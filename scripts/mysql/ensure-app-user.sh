#!/usr/bin/env sh
# Idempotently create/refresh the least-privilege MySQL account used by the backend.
# Runs as the one-shot `mysql-init` compose service on every `up`, so it also
# works on an existing data volume (MYSQL_USER of the mysql image only applies
# to a fresh volume). The app account gets privileges on the app database only:
# DDL is needed because the backend runs `alembic upgrade head` at start-up.
set -eu
: "${MYSQL_ROOT_PASSWORD:?}" "${MYSQL_DB:?}" "${MYSQL_APP_USER:?}" "${MYSQL_APP_PASSWORD:?}"

case "$MYSQL_APP_USER$MYSQL_DB" in
    *[!A-Za-z0-9_]*) echo "MYSQL_APP_USER and MYSQL_DB may only contain letters, digits and _" >&2; exit 1 ;;
esac
# Escape single quotes for the SQL string literal.
password=$(printf "%s" "$MYSQL_APP_PASSWORD" | sed "s/'/''/g")

MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -h mysql -uroot <<SQL
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'%' IDENTIFIED BY '${password}';
ALTER USER '${MYSQL_APP_USER}'@'%' IDENTIFIED BY '${password}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, LOCK TABLES
    ON \`${MYSQL_DB}\`.* TO '${MYSQL_APP_USER}'@'%';
FLUSH PRIVILEGES;
SQL
echo "MySQL app user '${MYSQL_APP_USER}' ready on ${MYSQL_DB}"
