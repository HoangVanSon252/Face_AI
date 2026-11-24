#!/usr/bin/env sh
# Daily backups for the `db-backup` compose service:
#   - MySQL logical dump (mysqldump --single-transaction, gzip)
#   - snapshot of the object-storage volume (attendance evidence photos)
# Keeps BACKUP_RETENTION_DAYS days of files in /backups (a host bind mount).
# Copy /backups off this machine regularly, together with FACE_EMBEDDING_KEY
# (without that key the encrypted face embeddings in the dump are unreadable).
set -eu
: "${BACKUP_RETENTION_DAYS:=14}"
: "${BACKUP_INTERVAL_SECONDS:=86400}"
umask 077
mkdir -p /backups

while true; do
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    if MYSQL_HOST=mysql BACKUP_DIR=/backups sh /scripts/backup-mysql.sh; then
        echo "[$stamp] mysql backup ok"
    else
        echo "[$stamp] mysql backup FAILED" >&2
    fi
    if tar -czf "/backups/object-storage_${stamp}.tar.gz" -C /object-storage .; then
        echo "[$stamp] object storage snapshot ok"
    else
        echo "[$stamp] object storage snapshot FAILED" >&2
    fi
    find /backups -type f -mtime +"$BACKUP_RETENTION_DAYS" \( -name '*.sql.gz' -o -name '*.tar.gz' \) -delete
    [ "${BACKUP_ONCE:-false}" = "true" ] && exit 0
    sleep "$BACKUP_INTERVAL_SECONDS"
done
