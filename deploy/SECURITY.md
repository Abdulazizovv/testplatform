# Security Checklist & Notes

This document covers production security hardening and known constraints.

## Pre-Deployment Security Checks

### Environment & Secrets

- [ ] `DJANGO_SECRET_KEY`: 50+ chars, unique, strong (generated with `secrets.token_urlsafe`)
- [ ] `DJANGO_DEBUG=False` (critical: no debug info, SQL queries, or tracebacks)
- [ ] `DJANGO_SECURE_SSL=True` (enforces HTTPS redirect, secure cookies, HSTS)
- [ ] `POSTGRES_PASSWORD`: 24+ chars, strong, unique (generated with `secrets.token_hex`)
- [ ] No `DJANGO_SECRET_KEY` or `POSTGRES_PASSWORD` in git history
- [ ] `.env` file in `.gitignore` (add if missing)
- [ ] `.env.production.example` uses placeholders, not real secrets

### Database & Storage

- [ ] PostgreSQL: not exposed to the internet (internal network only)
- [ ] Redis: not exposed to the internet (internal network only)
- [ ] Media volume: mounted at `/srv/media` in nginx (readonly)
- [ ] Static files: mounted at `/srv/static` in nginx (readonly)

### Containers

- [ ] Backend runs as non-root user (uid 1000, `app`)
- [ ] Celery worker runs as non-root (via inherited Dockerfile)
- [ ] No `privileged: true` in docker-compose.yml
- [ ] All volumes are namespaced (project-scoped)

### TLS & Networking

- [ ] Host nginx terminates TLS (Certbot-managed certificates)
- [ ] Docker nginx listens only on loopback (127.0.0.1:NGINX_PORT)
- [ ] X-Forwarded-Proto headers passed correctly (host nginx → container nginx → Django)
- [ ] HSTS enabled (Strict-Transport-Security: max-age=31536000)
  - ⚠️ Do NOT enable `SECURE_HSTS_PRELOAD` until domain is finalized (hard to undo)
- [ ] Client max body size: 10 MB (nginx + Django)

### Authentication & Authorization

- [ ] Session authentication (Django sessions, cookie-based)
- [ ] CSRF protection enabled (CSRF_TRUSTED_ORIGINS configured per domain)
- [ ] Login brute-force protection (django-axes): max 5 attempts, 15 min cooloff
- [ ] All admin-only endpoints protected by permission checks
- [ ] Scoping enforced (branch_admins cannot see other branches' data)

### API Security

- [ ] Rate limiting enabled:
  - Login: 10/minute per IP (+ 5 burst)
  - General API: 30/sec per IP (+ 20 burst)
  - Public/Student API: 20/sec per IP (+ 60 burst)
- [ ] No CORS headers (same-origin only; SPA + backend on same domain via nginx)
- [ ] Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] Referrer-Policy: same-origin
- [ ] No sensitive data in error responses (DEBUG=False hides full tracebacks)

### Logging & Monitoring

- [ ] Logs go to stdout (JSON format, easy to parse/ship)
- [ ] No credentials logged (verified in Django logging config)
- [ ] Log rotation configured (docker json-file: max 10MB, 3 files)
- [ ] Plan for log aggregation (syslog, ELK, CloudWatch, etc.)

### Demo Data

- [ ] `create_demo_data.py` is in `.gitignore` (never reaches production)
- [ ] Demo credentials stored in separate `DEMO_CREDENTIALS.txt` (also ignored)
- [ ] No hardcoded test users in fixtures

## Known Limitations

### HSTS Duration

Once you enable HSTS (currently 1 year = 31536000 seconds), browsers will:
- Cache the policy for a full year
- Refuse to connect over HTTP even if you later disable HTTPS

**Implications:**
- Never enable HSTS on a test domain that you'll abandon
- Test HSTS on staging first with a low duration (e.g., 300 seconds)
- Changing domains requires users' browsers to expire the old HSTS policy (1 year minimum)

**Recommendation:**
- Keep `SECURE_HSTS_PRELOAD = False` until the production domain is 100% finalized
- Only enable preload after 1+ year of stable operation

### Migrations Are Manual

- Migrations do NOT run automatically on container startup
- This is intentional (gives you control, prevents accidental schema changes)
- **Always** run `docker compose exec backend python manage.py migrate` after code updates
- Test migrations on staging first

### Celery Has No Auto-Retry

- Celery worker does not retry failed tasks by default
- Implement retry logic per task if needed (see Celery docs)
- Monitor worker health: `docker compose exec celery celery -A config inspect active`

### Media Uploads Have No Expiration

- Uploaded files persist forever (no auto-deletion)
- Manual cleanup needed as the media volume grows
- Back up media volume regularly (see `backup.sh`)
- Max upload size: 10 MB (enforced in nginx + Django)

### No Rate Limit Recovery

- Rate limit counters are stored in Redis
- If Redis is restarted, counters reset (brief window of raised limits)
- Attacker can trigger restart manually → exploit window
- Mitigation: Monitor Redis restarts, alert on failures

### Admin Endpoint Is Public

- `/admin/` is publicly accessible (only auth-protected)
- Default Django admin UI is visible to anyone who knows the URL
- **Option 1:** Restrict by IP (uncomment in `deploy/nginx-production-example.conf`)
- **Option 2:** Use a custom admin URL (rename in `urls.py`)
- **Option 3:** Use VPN + IP restriction together

## Security Recommendations

### Daily Operations

- [ ] Monitor logs for errors: `make logs | grep ERROR`
- [ ] Check for unusual rate-limit hits: `make logs | grep 429`
- [ ] Verify backups succeeded: `ls -lh .backups/ && tail -5 /var/log/testplatform_backup.log`
- [ ] Review unexpected login lockouts: `make logs | grep axes`

### Weekly

- [ ] Check TLS certificate expiry: `sudo certbot certificates`
- [ ] Review docker image updates: `docker compose images --digests`
- [ ] Audit recent code changes: `git log --oneline --since="7 days ago"`

### Monthly

- [ ] Test disaster recovery (restore a backup to staging)
- [ ] Review Django security updates: https://www.djangoproject.com/weblog/
- [ ] Check system logs for security events: `sudo journalctl --since="30 days ago" PRIORITY=3`
- [ ] Rotate superadmin password

### Before Every Production Deployment

- [ ] Run migrations on staging first
- [ ] Verify no DEBUG=True in `.env`
- [ ] Confirm DJANGO_SECRET_KEY is strong (50+ chars, looks random)
- [ ] Ensure CSRF_TRUSTED_ORIGINS matches your domain (https://)
- [ ] Review git changes (no credentials, no test files): `git log origin/main..HEAD`
- [ ] Test on staging: `SKIP_MIGRATIONS=1 ./deploy/deploy.sh` (no schema changes)

## Incident Response

### Suspected Credential Leak

1. Immediately rotate the leaked credential (password, API key, secret)
2. Check git history for any exposure: `git log -S "<secret>" --all --oneline`
3. If found in git, use `git-filter-branch` or `git-filter-repo` to purge
4. Force-push to all remotes
5. Notify affected users

### RCE / Code Injection Attack

1. Stop affected container: `docker compose down backend`
2. Preserve logs: `docker logs <container-id> > /var/log/incident_$(date +%s).log`
3. Review recent deployments: `git log --oneline -10`
4. Revert to known-good state: `git checkout <safe-commit>`
5. Rebuild and restart: `docker compose up -d --build backend`
6. Notify security team and affected users

### Data Breach (Database Access)

1. Stop all services: `docker compose down`
2. Isolate the VPS (firewall rules, security group)
3. Preserve database: `docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > /var/log/incident_db.sql`
4. Review access logs: `docker compose logs --since="1h" postgres`
5. Contact your security team for forensics
6. Plan user notification and credential reset

### DoS / Rate Limit Bypass

1. Check nginx logs for attack pattern: `tail -100 /var/log/nginx/access.log | grep 429`
2. Identify attacker IP: `grep 429 /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn`
3. Temporarily block at firewall: `sudo ufw insert 1 deny from <attacker-ip>`
4. Review nginx rate-limit zones in `nginx/default.conf`
5. Adjust limits if needed: increase burst or zone size
6. Remove firewall rule after attack subsides: `sudo ufw delete deny from <attacker-ip>`

## Security Resources

- [Django Security Documentation](https://docs.djangoproject.com/en/stable/topics/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/sql-security.html)
- [nginx Security Tips](https://nginx.org/en/docs/http/ngx_http_security_module.html)
