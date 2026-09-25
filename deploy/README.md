# Production Deployment Files

This directory contains scripts and configuration templates for deploying the platform to production.

## Files

### `deploy.sh`
Automated deployment script. Pulls latest code, rebuilds containers, runs migrations, and verifies health.

**Usage:**
```bash
./deploy/deploy.sh                           # Deploy normally
SKIP_MIGRATIONS=1 ./deploy/deploy.sh         # Deploy without running migrations
VERBOSE=1 ./deploy/deploy.sh                 # Verbose output (debug mode)
```

**What it does:**
1. Pulls latest code from `origin main` (via git)
2. Validates docker-compose.yml
3. Rebuilds and starts containers
4. Waits for backend health check (max 20s)
5. Runs database migrations (if not skipped)
6. Collects static files
7. Verifies all containers are healthy

**Returns:** 0 on success, 1 on failure.

### `backup.sh`
Automated database and media backup script.

**Usage:**
```bash
./deploy/backup.sh                           # Run backup once
# Or schedule via cron (see CRONTAB.example)
```

**What it does:**
1. Dumps PostgreSQL database to `backups/postgres_YYYY-MM-DD_HH-MM-SS.sql`
2. Archives media volume to `backups/media_YYYY-MM-DD_HH-MM-SS.tar.gz` (if populated)
3. Auto-deletes backups older than 14 days (configurable via `RETENTION_DAYS`)

**Note:** Requires `.env` to be present and containers running.

### `nginx-production-example.conf`
Host-level nginx configuration template (TLS termination, reverse proxy).

**Usage:**
1. Copy to `/etc/nginx/sites-available/<your-domain>`
2. Replace `<DOMAIN>` placeholders with your actual domain
3. Link to `/etc/nginx/sites-enabled/`
4. Run `nginx -t` to validate
5. Reload nginx

**What it does:**
- Listens on ports 80 (HTTP redirect) and 443 (HTTPS)
- Terminates TLS (Certbot-managed certificates)
- Reverse-proxies to Docker container nginx (127.0.0.1:7788)
- Handles gzip compression
- Sets security headers

### `RESTORE.md`
Disaster recovery guide. How to restore database and media from backups.

**Topics covered:**
- Restore database only
- Restore media only
- Full stack recovery
- Schema migration after restore
- Changing database password during restore

### `SECURITY.md`
Security hardening checklist and known constraints.

**Topics covered:**
- Pre-deployment security checks
- Known limitations (HSTS, manual migrations, rate limits, etc.)
- Incident response procedures
- Security recommendations (daily, weekly, monthly)

### `CRONTAB.example`
Example crontab entries for automating backups and health checks.

**Setup:**
1. Copy or read the entries
2. Run `sudo crontab -e`
3. Paste relevant entries, adjusting paths and times
4. Save and exit

**Recommended automated tasks:**
- Daily backup at 02:00 UTC
- Daily disk space check
- Weekly log rotation

### `../docs/DEPLOYMENT.md`
Complete step-by-step production deployment guide. Start here.

---

## Quick Start for Operators

### First-Time Deployment to VPS

```bash
# 1. SSH into VPS
ssh root@your-vps-ip
cd /path/to/testplatform

# 2. Copy and edit .env
cp .env.production.example .env
# Fill in real values (domain, secrets, passwords)

# 3. Start the stack
docker compose up -d --build

# 4. Verify health
curl http://127.0.0.1:7788/healthz/

# 5. Configure host nginx (from outside the container)
sudo cp deploy/nginx-production-example.conf /etc/nginx/sites-available/myapp.com
# Edit the domain in the config file

# 6. Set up TLS (Certbot)
sudo certbot certonly --nginx -d myapp.com

# 7. Back in the container, run initial migrations
docker compose exec backend python manage.py migrate

# 8. Create superadmin
docker compose exec backend python manage.py createsuperuser

# 9. Test
curl https://myapp.com/healthz/
```

### Regular Updates

```bash
cd /path/to/testplatform
./deploy/deploy.sh
```

### Backup Schedule

```bash
# Set up daily 2 AM backups
sudo crontab -e
# Add: 0 2 * * * cd /path/to/testplatform && ./deploy/backup.sh >> /var/log/testplatform_backup.log 2>&1
```

### Disaster Recovery

```bash
cd /path/to/testplatform
./deploy/backup.sh              # Take a backup first
# Then follow steps in deploy/RESTORE.md
```

---

## Troubleshooting

### Deploy script fails at health check

```bash
docker compose logs backend | tail -50
# Check for:
# - Database connection errors (POSTGRES_PASSWORD mismatch, postgres not ready)
# - Invalid SECRET_KEY (too short with DEBUG=False)
# - Port conflicts (NGINX_PORT already in use)
```

### Backup script can't dump database

```bash
docker compose exec postgres pg_isready -U $POSTGRES_USER
docker compose ps postgres    # ensure postgres is healthy
# If not, check: docker compose logs postgres | tail -20
```

### Restore fails

```bash
# Verify .env is correct
cat .env | grep POSTGRES

# Manually test postgres access
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT COUNT(*) FROM accounts_user;"

# Check restore file exists and is readable
ls -lh .backups/postgres_*.sql
```

---

## Monitoring Checklist

Daily:
- [ ] Check backup succeeded: `ls -lh .backups/postgres_*.sql` (file size should be > 0KB)
- [ ] Verify app health: `curl https://myapp.com/healthz/`
- [ ] Review error logs: `docker compose logs backend | grep ERROR`

Weekly:
- [ ] Check disk space: `df -h`
- [ ] Verify TLS cert expiry: `sudo certbot certificates`
- [ ] Test backup restore (on staging)

Monthly:
- [ ] Full security audit (see `deploy/SECURITY.md`)
- [ ] Review code changes since last month: `git log --oneline --since="30 days ago"`

---

## Support & Documentation

- **Deployment:** `../docs/DEPLOYMENT.md` (complete guide)
- **Security:** `./SECURITY.md` (hardening, incident response)
- **Backup/Restore:** `./RESTORE.md` (disaster recovery)
- **Cron Setup:** `./CRONTAB.example` (automation)
- **Architecture:** `../docs/ARCHITECTURE.md` (system design)
- **API Docs:** `../docs/API.md` (endpoints, request/response formats)
- **Database:** `../docs/DATABASE.md` (schema, models)
