#!/usr/bin/env bash
# Kör migrationer + tester mot en temporär lokal Postgres (15+).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v postgres || ls /usr/lib/postgresql/*/bin/postgres | tail -1)")}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54331}"
RUN=()
# Postgres vägrar köra som root.
if [ "$(id -u)" = "0" ]; then chown -R postgres "$TMP"; RUN=(runuser -u postgres --); fi
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start >/dev/null
P=("${RUN[@]}" "$PGBIN/psql" -h "$TMP" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

cat "$ROOT/supabase/tests/stub.sql" $(ls "$ROOT"/supabase/migrations/*.sql | grep -v _cron.sql) | "${P[@]}" -f - >/dev/null
"${P[@]}" -f "$ROOT/supabase/tests/ingest.test.sql" >/dev/null
"${P[@]}" -c "truncate public.readings, public.capability_state, public.devices, public.zones cascade" >/dev/null
"${P[@]}" -f "$ROOT/supabase/tests/rls.test.sql"
echo "Alla databastester OK"
