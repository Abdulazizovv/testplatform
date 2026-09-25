#!/bin/bash
set -e

###############################################
# Production Deploy Script
###############################################
# Automated deployment: pull latest code, rebuild containers, run migrations,
# verify health. Run from the project root.
#
# Usage:
#   ./deploy/deploy.sh           # deploy with default settings
#   SKIP_MIGRATIONS=1 ./deploy/deploy.sh
#   VERBOSE=1 ./deploy/deploy.sh
#
# Returns exit code 0 on success, 1 on failure.

set -o pipefail

REPO_ROOT="${REPO_ROOT:-.}"
VERBOSE="${VERBOSE:-0}"
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"
HEALTH_RETRIES=10
HEALTH_TIMEOUT=5

log() { echo "[$(date '+%H:%M:%S')] $*"; }
err() { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; }

if [ "$VERBOSE" = "1" ]; then
    set -x
fi

cd "$REPO_ROOT" || {
    err "Cannot cd to $REPO_ROOT"
    exit 1
}

if [ ! -f docker-compose.yml ]; then
    err "docker-compose.yml not found. Run this script from the project root."
    exit 1
fi

if [ ! -f .env ]; then
    err ".env file not found. Copy .env.example or .env.production.example and fill in the values."
    exit 1
fi

log "=== Starting production deployment ==="
log "Working directory: $(pwd)"

# 1. Pull latest code.
log "Pulling latest code from git..."
if ! git pull origin main; then
    err "Git pull failed."
    exit 1
fi

# 2. Validate docker-compose.yml
log "Validating docker-compose.yml..."
if ! docker compose config > /dev/null; then
    err "docker-compose.yml validation failed."
    exit 1
fi

# 3. Build and start containers.
log "Building and starting containers..."
if ! docker compose up -d --build; then
    err "Docker compose up failed."
    exit 1
fi

# 4. Wait for backend to be healthy.
log "Waiting for backend to become healthy..."
RETRY=0
while [ $RETRY -lt $HEALTH_RETRIES ]; do
    if docker compose exec backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz/', timeout=3)" 2>/dev/null; then
        log "Backend is healthy."
        break
    fi
    RETRY=$((RETRY + 1))
    if [ $RETRY -eq $HEALTH_RETRIES ]; then
        err "Backend health check failed after $HEALTH_RETRIES attempts."
        log "Container logs:"
        docker compose logs backend | tail -50
        exit 1
    fi
    sleep 2
done

# 5. Run migrations (if not skipped).
if [ "$SKIP_MIGRATIONS" != "1" ]; then
    log "Running database migrations..."
    if ! docker compose exec backend python manage.py migrate; then
        err "Migrations failed. Rolling back may be required."
        exit 1
    fi
else
    log "Skipping migrations (SKIP_MIGRATIONS=1)"
fi

# 6. Collect static files.
log "Collecting static files..."
if ! docker compose exec backend python manage.py collectstatic --noinput; then
    err "collectstatic failed."
    exit 1
fi

# 7. Verify overall health.
log "Verifying container health..."
CONTAINERS=$(docker compose ps --quiet)
for CONTAINER in $CONTAINERS; do
    HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "unknown")
    NAME=$(docker inspect --format='{{.Name}}' "$CONTAINER" | sed 's|/||')
    case "$HEALTH" in
        healthy) log "✓ $NAME is healthy" ;;
        starting) log "⚠ $NAME is starting up" ;;
        unhealthy) err "$NAME health check FAILED"; exit 1 ;;
        unknown) log "⚠ $NAME has no health check (this is OK for some services)" ;;
    esac
done

# 8. Final health endpoint checks.
log "Checking HTTP health endpoints..."
if ! curl -sf http://127.0.0.1:7788/healthz/ > /dev/null; then
    err "Backend health endpoint returned non-200 status. Check logs:"
    docker compose logs backend | tail -20
    exit 1
fi
log "✓ Backend health endpoint OK"

log "=== Deployment SUCCESSFUL ==="
log "Next steps:"
log "  1. Verify application at https://<your-domain>"
log "  2. Check logs: make logs"
log "  3. Create superadmin if needed: docker compose exec backend python manage.py createsuperuser"
log "  4. Review: docker compose ps"

exit 0
