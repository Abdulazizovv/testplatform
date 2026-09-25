# Deployment runbook (single VPS, Docker Compose)

Assumes a VPS with a **host-level nginx** that terminates TLS (certificates live there, not
in this repo). The project's nginx container never sees TLS or the domain; it listens on
`127.0.0.1:${NGINX_PORT:-7788}`. The production domain is **not decided yet** - wherever
you see `<your-domain>` below, substitute it when chosen.

## 1. Install Docker (skip if present)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in afterwards
```

## 2. Get the code

```bash
git clone <repo-url> testplatform && cd testplatform
```

## 3. Configure `.env`

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # -> DJANGO_SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(24))"       # -> POSTGRES_PASSWORD
```

Set in `.env`:
- `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD` - real values (the backend refuses to start with a
  short or placeholder key when `DJANGO_DEBUG=False`).
- `DJANGO_DEBUG=False`, `DJANGO_SECURE_SSL=True`.
- `DJANGO_ALLOWED_HOSTS=<your-domain>[,www.<your-domain>]` (`localhost`, `127.0.0.1`,
  `backend` are added automatically - they're needed by the container healthcheck and the
  frontend's server-side calls).
- `CSRF_TRUSTED_ORIGINS=https://<your-domain>`.
- `NGINX_PORT` if 7788 is taken.
- `POSTGRES_*` are applied only when the database volume is first created. Changing the
  password later requires `ALTER USER` inside Postgres (or, on a disposable dev box,
  `docker compose down -v`, which DELETES the data).
- Leave `REDIS_URL` / `CELERY_BROKER_URL` empty - compose injects them.

## 4. Start

```bash
make up            # docker compose up -d --build
make ps            # every service should become "healthy"
make createsuperuser
```

Migrations and `collectstatic` run automatically on backend start.

## 5. Host nginx (TLS) - example, adapt to the chosen domain

```nginx
server {
    listen 443 ssl;
    server_name <your-domain>;
    # ssl_certificate / ssl_certificate_key: managed by Certbot on the host

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:7788;          # = NGINX_PORT
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;   # required: Django trusts this header
    }
}
server { listen 80; server_name <your-domain>; return 301 https://$host$request_uri; }
```

`X-Forwarded-Proto` and `X-Forwarded-For` from the host nginx are required: the first makes
Django treat requests as secure (cookies, redirects), the second lets the inner nginx apply
rate limits and axes lockouts per real client instead of per proxy.

## 6. Verify

```bash
curl -i https://<your-domain>/healthz/     # backend  -> {"ok": true}
curl -i https://<your-domain>/healthz      # frontend -> {"ok":true}
```
Open `https://<your-domain>/kirish` and log in with the superadmin; create a Branch and
users at `/admin/`.

## 7. Update / operate

```bash
git pull && make up          # rebuild + restart changed services
make logs                    # JSON logs; make celery-logs / make fe-logs
docker compose exec backend python manage.py migrate   # (already automatic on start)
```

Backups: `docker compose exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql`
(schedule via host cron; also back up the `media_volume` once uploads exist).

## Testing the stack locally over plain HTTP

Set `DJANGO_SECURE_SSL=False` and `CSRF_TRUSTED_ORIGINS=http://localhost:7788` in `.env`,
then `make up` and open http://localhost:7788. Never use `DJANGO_SECURE_SSL=False` in
production.
