# Production Deployment Guide

Single VPS with Docker Compose. TLS terminates at the host level (not in containers).

## Architecture Overview

- **Host nginx**: Listens on 443 (TLS), reverse-proxies to Docker container nginx
- **Container nginx**: Loopback-only (127.0.0.1:7788), routes to backend/frontend
- **Backend**: Gunicorn + Django, exposes 8000 on internal network
- **Frontend**: Next.js, exposes 3000 on internal network
- **Database**: PostgreSQL, internal network only
- **Cache/Broker**: Redis, internal network only

The production domain is a **placeholder** (`<DOMAIN>`) until decided. Substitute it everywhere.

---

## Prerequisites

### VPS Setup

- Ubuntu 22.04+ or similar
- 2+ CPU cores, 2+ GB RAM (scale up with user count)
- 20+ GB disk (media storage, backups, logs)
- Public IP with DNS configured

### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in afterwards
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Firewall (ufw)

```bash
sudo ufw enable
sudo ufw allow 22/tcp          # SSH
sudo ufw allow 80/tcp          # HTTP (auto-redirect to HTTPS)
sudo ufw allow 443/tcp         # HTTPS
sudo ufw allow 3000/tcp        # (optional, for behind-the-scenes debugging only)
```

---

## Step 1: Get the Code

```bash
git clone <your-repo-url> testplatform
cd testplatform
```

## Step 2: Configure Environment

Copy the production template and fill in actual values:

```bash
cp .env.production.example .env
```

**Edit `.env`** with your real values:

```bash
# Generate secrets (do NOT reuse from dev):
python3 -c "import secrets; print('DJANGO_SECRET_KEY=' + secrets.token_urlsafe(64))"
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_hex(24))"
```

Set these in `.env`:

| Variable | Example | Notes |
|----------|---------|-------|
| `DJANGO_SECRET_KEY` | (from above) | 50+ chars, unique, strong |
| `DJANGO_DEBUG` | `False` | MUST be False in prod |
| `DJANGO_ALLOWED_HOSTS` | `app.example.com,www.example.com` | Your real domain(s) |
| `CSRF_TRUSTED_ORIGINS` | `https://app.example.com` | MUST be https:// |
| `DJANGO_SECURE_SSL` | `True` | MUST be True in prod |
| `POSTGRES_DB` | `testplatform` | (no change needed) |
| `POSTGRES_USER` | `testplatform` | (no change needed) |
| `POSTGRES_PASSWORD` | (from above) | 24+ chars, strong |
| `NGINX_PORT` | `7788` | (no change unless conflict) |
| `GUNICORN_WORKERS` | `4` | Adjust for your CPU count |

**Important:** `POSTGRES_*` values are applied **only** when the volume is created for the
first time. Once set, changing them has no effect; you must either run `ALTER USER` in Postgres
or destroy the volume (`docker compose down -v`) and lose all data.

## Step 3: Start the Stack

```bash
docker compose up -d --build

# Wait 10-20s for containers to initialize
sleep 15

# Check health
docker compose ps
```

Expected output: every service should show `healthy` or `starting`.

## Step 4: Verify Backend Health

```bash
curl -i http://127.0.0.1:7788/healthz/
```

Expected: 200 OK with JSON `{"ok": true}`.

**If unhealthy**, check logs:

```bash
docker compose logs backend | tail -100
docker compose logs postgres | tail -50
```

## Step 5: Host nginx (TLS Termination)

Copy the example config and customize:

```bash
sudo cp deploy/nginx-production-example.conf /etc/nginx/sites-available/<DOMAIN>
sudo sed -i 's/<DOMAIN>/app.example.com/g' /etc/nginx/sites-available/<DOMAIN>
sudo ln -s /etc/nginx/sites-available/<DOMAIN> /etc/nginx/sites-enabled/
```

**Test and enable:**

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Step 6: Install TLS Certificates (Certbot)

```bash
sudo certbot certonly --nginx -d app.example.com -d www.example.com
```

Certbot will automatically update the SSL paths in the nginx config. Set up auto-renewal:

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
sudo certbot renew --dry-run   # test renewal
```

## Step 7: Run Initial Migrations

The backend **runs `migrate` automatically on every container start** (`backend/docker-entrypoint.sh`), so nothing to do here on a normal deploy. To run or inspect migrations manually:

```bash
docker compose exec backend python manage.py showmigrations
docker compose exec backend python manage.py migrate
```

Output should show: `Running migrations: ... OK`.

## Step 8: Create Superadmin

```bash
docker compose exec backend python manage.py createsuperuser
```

Interactive prompts will ask for username, email, password.

## Step 9: Collect Static Files

```bash
docker compose exec backend python manage.py collectstatic --noinput
```

Output: `X static files copied to 'staticfiles'`.

## Step 10: Verify Full Stack

### Frontend health (no auth needed)

```bash
curl -i https://<DOMAIN>/healthz
```

Expected: 200 OK, JSON `{"ok":true}`.

### Backend health (no auth needed)

```bash
curl -i https://<DOMAIN>/healthz/
```

Expected: 200 OK, JSON `{"ok": true}`.

### Login

Open `https://<DOMAIN>/kirish` in a browser and log in with the superadmin credentials.

### Admin panel

Go to `https://<DOMAIN>/admin/` and create your first **Branch** (organization).
- Each branch has its own users, subjects, tests.
- Create teachers, students, and test content per branch.

---

## Operations

### Daily operations

```bash
# Check all services
make ps

# View logs (all services)
make logs

# View backend logs only
make logs backend

# View frontend logs only
make fe-logs

# View celery worker logs
make celery-logs
```

### Deployments (pull and update)

```bash
cd /path/to/testplatform
./deploy/deploy.sh
```

This script:
1. Pulls latest code from git
2. Rebuilds containers
3. Runs migrations (can skip with `SKIP_MIGRATIONS=1 ./deploy/deploy.sh`)
4. Collects static files
5. Verifies health

Or manually:

```bash
git pull origin main
docker compose up -d --build
docker compose exec backend python manage.py migrate
make ps
```

### Backups

Automate with cron:

```bash
sudo crontab -e
# Add this line to run backup daily at 02:00 UTC:
0 2 * * * cd /path/to/testplatform && ./deploy/backup.sh >> /var/log/testplatform_backup.log 2>&1
```

Manual backup:

```bash
./deploy/backup.sh
```

Outputs: `.backups/postgres_YYYY-MM-DD_HH-MM-SS.sql` and `.backups/media_*.tar.gz`

**Retention policy**: Backups older than 14 days are auto-deleted. Adjust `RETENTION_DAYS` in `backup.sh`.

### Restore (disaster recovery)

See `deploy/RESTORE.md` for complete restore procedures (database only, media only, or full).

Quick restore:

```bash
docker compose down
docker volume rm testplatform_postgres_data
docker compose up -d postgres
sleep 5
docker compose exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB < .backups/postgres_YYYY-MM-DD_*.sql
docker compose up -d
docker compose exec backend python manage.py migrate
```

---

## Database Maintenance

### Reset password for an existing user

```bash
docker compose exec backend python manage.py shell
>>> from apps.accounts.models import User
>>> u = User.objects.get(username='teacher1')
>>> u.set_password('newpassword123')
>>> u.save()
```

### Access the database directly

```bash
docker compose exec postgres psql -U $POSTGRES_USER $POSTGRES_DB
```

Then use standard SQL (e.g., `\dt` for tables, `SELECT * FROM accounts_user;`).

---

## Known Limitations & Important Notes

### Migrations are NOT automatic

- The backend **runs migrations on every start** (`docker-entrypoint.sh`); take a DB backup (`deploy/backup.sh`) before deploying schema changes
- Test migrations on staging before running in production

### Media uploads

- Max file size: 10 MB (set in nginx and Django)
- Only images supported (re-encoded on upload)
- No auto-expiration or garbage collection (manual cleanup needed)
- Back up media volume regularly (see `backup.sh`)

### Celery is not auto-recovery

- Celery worker runs alongside backend but has no automatic task retries
- If a task fails, it is logged but not retried unless explicitly coded
- Implement task-specific error handling in views

### HSTS is strict once enabled

- Production uses HSTS (Strict-Transport-Security) for 1 year
- Do NOT enable HSTS_PRELOAD until the domain is finalized
- Changing domains after HSTS is enabled requires browser-level intervention by users
- Test with a low HSTS duration on staging first

### No automatic backups

- Backups must be set up manually via cron (see "Backups" above)
- Schedule them to run during low-traffic periods
- Monitor backup success: `ls -lh .backups/`

### Admin endpoint protection (optional)

- `/admin/` is publicly accessible by default (only auth-protected)
- To restrict by IP, uncomment the location block in nginx config (`deploy/nginx-production-example.conf`)
- Examples: office IP ranges, VPN, bastion host

### DEBUG=False is strict

- No HTML error pages; all errors are logged (check `make logs`)
- Static files must be collected manually or via entrypoint
- 500 errors show a generic "server error" page (full trace in logs)

### Rate limits

- Login endpoint: 10/minute per IP + 15 burst
- Public student API: 20/second per IP
- General API: 30/second per IP (+ 20 burst)
- Adjust in `nginx/default.conf` and `config/settings.py` as needed

### Database password can only be changed once (at creation)

- `POSTGRES_PASSWORD` in `.env` is applied only when `postgres_data` volume is created
- Changing it later has no effect
- To change the actual password, use SQL inside the container or destroy the volume

---

## Troubleshooting

### Backend not starting

```bash
docker compose logs backend | tail -100
```

Common issues:
- Invalid `DJANGO_SECRET_KEY` (< 50 chars with `DEBUG=False`)
- Database unreachable (check postgres logs)
- Invalid `POSTGRES_PASSWORD` (only matters on first run)

### Health checks failing

```bash
docker compose ps  # check Status column
docker compose logs <service>
```

### Migrations won't run

```bash
docker compose exec backend python manage.py showmigrations
docker compose exec backend python manage.py migrate --noinput
```

If stuck, check the database and logs for context.

### TLS certificate errors

```bash
sudo certbot certificates
sudo certbot renew --force-renewal
sudo nginx -t && sudo systemctl reload nginx
```

### Media upload not working

- Check max file size in nginx: `client_max_body_size` (currently 10m)
- Check Django setting: `MEDIA_MAX_BYTES = 5MB` (in settings.py)
- Verify media volume is mounted and writable: `docker compose exec backend ls -la /app/media`

### High memory/CPU usage

- Reduce `GUNICORN_WORKERS` in `.env`
- Check for runaway Celery tasks: `docker compose exec celery celery -A config inspect active`
- Monitor: `docker stats`

---

## Before Going Live (Checklist)

- [ ] Domain DNS configured and pointing to VPS IP
- [ ] `.env` filled with real values (not placeholders)
- [ ] TLS certificates installed (Certbot)
- [ ] Backups automated (cron job confirmed)
- [ ] Superadmin created and tested login
- [ ] Branch and test users created
- [ ] At least one test uploaded and functional
- [ ] `docker compose ps` shows all services healthy
- [ ] Both health endpoints responding (https://<DOMAIN>/healthz and https://<DOMAIN>/healthz/)
- [ ] Rate limiting verified (too strict? too loose?)
- [ ] Logs monitored for errors (`make logs`)
- [ ] Disaster recovery plan documented (backup/restore tested)
- [ ] Team trained on day-2 operations
