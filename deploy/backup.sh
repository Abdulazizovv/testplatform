#!/bin/bash
set -e

###############################################
# PostgreSQL + Media Volume Backup Script
###############################################
# Backs up the database and media files to a timestamped file.
# Install in crontab to run daily/weekly:
#   0 2 * * * /mendeleyev/deploy/backup.sh >> /var/log/mendeleyev_backup.log 2>&1
#
# This script:
# 1. Dumps the PostgreSQL database to a .sql file
# 2. Creates a .tar.gz of the media volume (if it has contents)
# 3. Names backups with timestamps (YYYY-MM-DD_HH-MM-SS)
# 4. Optionally deletes backups older than N days
#
# Requirements:
# - Run from the project root where docker-compose.yml lives
# - .env must be present with POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
# - The docker containers must be running

BACKUP_DIR="${BACKUP_DIR:-./.backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"  # Keep backups for 14 days by default

# Create backup directory if it doesn't exist.
mkdir -p "$BACKUP_DIR"

# Load environment variables from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "ERROR: .env not found. Run from the project root." >&2
    exit 1
fi

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
DB_BACKUP_FILE="$BACKUP_DIR/postgres_${TIMESTAMP}.sql"
MEDIA_BACKUP_FILE="$BACKUP_DIR/media_${TIMESTAMP}.tar.gz"

echo "Starting backup at $TIMESTAMP..."

# Backup PostgreSQL database.
echo "Dumping PostgreSQL database to $DB_BACKUP_FILE..."
docker compose exec -T postgres pg_dump \
    -U "${POSTGRES_USER}" \
    "${POSTGRES_DB}" > "$DB_BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "Database backup successful: $DB_BACKUP_FILE ($(du -h "$DB_BACKUP_FILE" | cut -f1))"
else
    echo "ERROR: Database backup failed!" >&2
    exit 1
fi

# Backup media volume if it contains files.
if docker compose exec media_volume test -d /app/media && [ "$(docker compose exec media_volume find /app/media -type f 2>/dev/null | wc -l)" -gt 0 ]; then
    echo "Archiving media volume to $MEDIA_BACKUP_FILE..."
    docker compose run --rm -v media_volume:/media:ro alpine tar czf /media.tar.gz -C / media/ 2>/dev/null || \
        tar czf "$MEDIA_BACKUP_FILE" -C /var/lib/docker/volumes/*/media 2>/dev/null || \
        echo "WARNING: Could not backup media volume (optional)."

    if [ -f "$MEDIA_BACKUP_FILE" ]; then
        echo "Media backup successful: $MEDIA_BACKUP_FILE ($(du -h "$MEDIA_BACKUP_FILE" | cut -f1))"
    fi
fi

# Cleanup old backups (older than RETENTION_DAYS).
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "postgres_*.sql" -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -name "media_*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "Retention cleanup completed."

echo "Backup finished at $(date '+%Y-%m-%d %H:%M:%S')"
echo "Backups location: $BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -5
