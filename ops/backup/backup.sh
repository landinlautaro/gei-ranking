#!/usr/bin/env bash
# Backup of the PostgreSQL database (works for Docker, Neon or any other server).
#
#   DATABASE_URL='postgresql://user:password@host/dbname?sslmode=require' ./ops/backup/backup.sh
#
# What it does: pg_dump in the compressed "custom" format, checks that the file can be read back, and deletes
# backups older than KEEP_DAYS. A failed or partial dump never replaces a good file (it is written as *.partial first).
#
# Variables:
#   DATABASE_URL     (required) connection string. For Neon use the direct (non-pooled) one.
#   BACKUP_DIR       where to write (default ./backups)
#   KEEP_DAYS        days to keep (default 30)
#   PG_USE_DOCKER    1 = always run pg_dump from the postgres Docker image, which guarantees a client as new as the server
#                    (default: use the local pg_dump when it exists, else Docker)
#   PG_IMAGE         image for that (default postgres:17; use the server's major version or newer)
#   DOCKER_NETWORK   optional Docker network to join (to reach a database running in Docker Compose)
#
# Restore: see docs/DEPLOY.md ("Backups") and ops/backup/verify-restore.sh.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL (postgresql://user:password@host/dbname?sslmode=require)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%d-%H%M%SZ)"
file="$BACKUP_DIR/gei-ranking-$stamp.dump"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

# Runs a PostgreSQL client tool locally or from the Docker image. Output goes to stdout: no volumes needed.
pg() {
  local tool="$1"; shift
  if [ "${PG_USE_DOCKER:-0}" != "1" ] && command -v "$tool" >/dev/null 2>&1; then
    "$tool" "$@"
  else
    docker run --rm -i ${DOCKER_NETWORK:+--network "$DOCKER_NETWORK"} "$PG_IMAGE" "$tool" "$@"
  fi
}

echo "Dumping the database..."
pg pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" > "$partial"

size="$(wc -c < "$partial" | tr -d ' ')"
if [ "$size" -lt 2048 ]; then
  echo "ERROR: the dump is suspiciously small ($size bytes). Not keeping it." >&2
  exit 1
fi

# A dump that cannot be listed cannot be restored either.
pg pg_restore --list < "$partial" > /dev/null
mv "$partial" "$file"
trap - EXIT

find "$BACKUP_DIR" -maxdepth 1 -name 'gei-ranking-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "Backup written: $file ($(du -h "$file" | cut -f1)). Kept: $(find "$BACKUP_DIR" -maxdepth 1 -name 'gei-ranking-*.dump' | wc -l | tr -d ' ') file(s), up to $KEEP_DAYS days."
