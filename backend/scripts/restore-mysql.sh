#!/usr/bin/env sh
set -eu

: "${MYSQL_HOST:?MYSQL_HOST is required}"
: "${MYSQL_PORT:=3306}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

test -f "$BACKUP_FILE"
MYSQL_PWD="$MYSQL_PASSWORD" gunzip -c "$BACKUP_FILE" \
  | mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER"

echo "Restored $BACKUP_FILE"
