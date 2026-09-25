#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${GUNICORN_WORKERS:-3}" \
  --timeout "${GUNICORN_TIMEOUT:-60}" \
  --graceful-timeout "${GUNICORN_GRACEFUL_TIMEOUT:-30}" \
  --max-requests "${GUNICORN_MAX_REQUESTS:-1000}" \
  --max-requests-jitter "${GUNICORN_MAX_REQUESTS_JITTER:-100}" \
  --worker-tmp-dir /dev/shm \
  --access-logfile - \
  --access-logformat '{"ts":"%(t)s","remote_addr":"%(h)s","method":"%(m)s","path":"%(U)s","query":"%(q)s","status":%(s)s,"bytes":%(B)s,"referrer":"%(f)s","ua":"%(a)s","request_time":%(L)s}'
