#!/usr/bin/env bash
# Apply every migration and the seed to a throwaway local Postgres, then run
# a test file against it.  Needs Docker.
#
#     bash supabase/tests/run_local.sh supabase/tests/0028_narration.sql
#
# The database is built the way the real one grew: migrations, then the seed,
# then the migrations again (so ones that update seeded rows -- e.g. 0028
# switching Premier on -- see them). Some early migrations expect seeded rows
# and print errors on a fresh database; that is expected and not what is
# being tested.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NAME=spacivelle-test-pg
TEST="${1:?which test file?}"

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:15 >/dev/null
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 1

run() { docker cp "$1" "$NAME:/tmp/f.sql" && docker exec "$NAME" psql -q -U postgres -f /tmp/f.sql 2>&1 | grep -E "ERROR" | sed "s|^|  $(basename "$1"): |"; }

echo "== building the database (errors from early migrations are expected)"
run "$HERE/supabase_stubs.sql"
docker exec "$NAME" psql -q -U postgres -c "create schema if not exists extensions;" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do run "$f" >/dev/null; done
run "$ROOT/supabase/seed.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do run "$f" >/dev/null; done

echo "== $(basename "$TEST")"
docker cp "$TEST" "$NAME:/tmp/t.sql"
docker exec "$NAME" psql -q -U postgres -f /tmp/t.sql 2>&1 | grep -vE "^\s*$" | sed 's|psql:/tmp/t.sql:[0-9]*: ||'
docker rm -f "$NAME" >/dev/null
