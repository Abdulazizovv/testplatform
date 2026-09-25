# Database & Media Restore Guide

If you need to restore the platform from a backup, follow this guide.

## Prerequisites

- Access to the VPS where the platform is hosted
- A backup file (database SQL dump and/or media archive)
- Docker and docker-compose running
- The application stack should be running (`docker compose ps`)

## Restore Database Only

### 1. Stop the application (optional but recommended)

```bash
docker compose down
```

### 2. Restore the database from a SQL dump

If you have a backup file named `postgres_2024-01-15_02-00-00.sql`:

```bash
docker compose up -d postgres
docker compose exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB < ./backups/postgres_2024-01-15_02-00-00.sql
```

### 3. Verify the restore and restart

```bash
docker compose up -d
docker compose exec backend python manage.py migrate --noinput  # if schema changed since backup
docker compose ps  # verify all services are healthy
```

## Restore Media Volume Only

### 1. Extract the media backup

If you have a media archive named `media_2024-01-15_02-00-00.tar.gz`:

```bash
# Stop services that use media
docker compose down

# Extract media files (assuming the archive structure is /media/...)
cd backend
tar xzf ../backups/media_2024-01-15_02-00-00.tar.gz --strip-components=1 -C media/
cd ..

# Restart
docker compose up -d
```

## Restore Database + Media (Complete Recovery)

### 1. Full stack restoration

```bash
# 1. Backup current state (just in case)
./deploy/backup.sh

# 2. Stop the entire stack
docker compose down

# 3. Delete the old database volume (WARNING: irreversible)
docker volume rm testplatform_postgres_data

# 4. Start postgres only
docker compose up -d postgres

# 5. Wait for postgres to be ready
sleep 5

# 6. Restore the database
docker compose exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB < ./backups/postgres_2024-01-15_02-00-00.sql

# 7. Restore media files
cd backend
tar xzf ../backups/media_2024-01-15_02-00-00.tar.gz --strip-components=1 -C media/
cd ..

# 8. Start everything else
docker compose up -d

# 9. Verify
docker compose ps
curl http://127.0.0.1:7788/healthz/
```

## Restore to a Different Database Password

If you're restoring to a new environment with a different `POSTGRES_PASSWORD`:

1. The SQL dump is database-agnostic (doesn't include user/role creation)
2. The new `POSTGRES_PASSWORD` in `.env` will be used when postgres starts
3. Simply restore normally — the new password will be applied

## Restore with Schema Changes

If the backup is from an older version of the code and the database schema has changed:

```bash
# After the restore completes:
docker compose exec backend python manage.py migrate
```

This will run any new migrations since the backup was taken.

## Verify a Successful Restore

After restoration, confirm the data is intact:

```bash
# Check backend health
curl -i http://127.0.0.1:7788/healthz/

# Check a few records exist (example: branches)
docker compose exec backend python manage.py shell
>>> from apps.branches.models import Branch
>>> Branch.objects.count()
```

## Backup vs. Restore Frequency

- **Backups**: Automate via cron (daily or weekly depending on data change rate)
- **Restores**: Rare; needed only for disaster recovery or migrating to a new VPS

See `deploy/backup.sh` for automated backups and crontab setup.
