# MySQL backup and restore

Run these scripts from a trusted Linux host or container with MySQL client tools installed. Do not commit a password to a script or command history.

```sh
export MYSQL_HOST=db.example.com MYSQL_USER=backup_user MYSQL_PASSWORD='...'
export MYSQL_DB=face_attendance_db BACKUP_DIR=/secure/backups
sh backup-mysql.sh
```

Restore only after verifying the target environment and backup file:

```sh
export MYSQL_HOST=db.example.com MYSQL_USER=restore_user MYSQL_PASSWORD='...'
export BACKUP_FILE=/secure/backups/face_attendance_db_20260101T000000Z.sql.gz
sh restore-mysql.sh
```

Schedule `backup-mysql.sh` with a daily cron job and copy encrypted backups to protected object storage. Test restoration regularly on a non-production database.
