#!/usr/bin/env bash
# Proves that a backup really restores: loads it into a throwaway PostgreSQL container and prints row counts.
# Nothing is touched besides that temporary container, which is removed at the end.
#
#   ./ops/backup/verify-restore.sh backups/gei-ranking-20261003-101500Z.dump
#
# PG_IMAGE (default postgres:17) must be the same major version as the one that made the dump, or newer.
set -euo pipefail

dump="${1:?Usage: verify-restore.sh <file.dump>}"
[ -s "$dump" ] || { echo "ERROR: $dump does not exist or is empty." >&2; exit 1; }
PG_IMAGE="${PG_IMAGE:-postgres:17}"
name="gei-verify-restore-$$"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify "$PG_IMAGE" >/dev/null
echo "Waiting for the temporary database..."
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -d verify >/dev/null 2>&1 && break
  sleep 1
done
sleep 2 # the first pg_isready answer comes from the init server, which restarts once

docker exec -i "$name" pg_restore --no-owner --no-privileges --exit-on-error -U postgres -d verify < "$dump"
echo "Restored without errors. Row counts:"
docker exec "$name" psql -U postgres -d verify -At -F ' = ' -c "
  select 'players', count(*) from players
  union all select 'matches', count(*) from matches
  union all select 'ranking_events', count(*) from ranking_events
  union all select 'ranking_snapshot', count(*) from ranking_snapshot
  union all select 'admin_users', count(*) from admin_users
  union all select 'migrations applied', count(*) from \"__EFMigrationsHistory\""
