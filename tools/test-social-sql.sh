#!/usr/bin/env bash
# Applies supabase/schema.sql TWICE to a throwaway local PostgreSQL (with a small Supabase shim), then runs the
# Friends & Stories, Messages, gallery, sleep and mind RLS / trigger / RPC checks in tools/sql/test-*.sql.
# Needs PostgreSQL 15+ server binaries: set PG_BIN (dir with initdb, pg_ctl, postgres) — e.g. from `npm i @embedded-postgres/linux-x64`.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/17/bin/initdb)")}"
PORT="${PORT:-54331}"
DIR="$(mktemp -d)"
trap '"$PG_BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$PG_BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/pg.log" -w start >/dev/null
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$DIR" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f tools/sql/supabase-local-shim.sql
echo "== schema.sql, run 1"; PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -o /dev/null -f supabase/schema.sql
echo "== schema.sql, run 2 (idempotent)"; PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -o /dev/null -f supabase/schema.sql
echo "== policies: $("${PSQL[@]}" -At -c "select count(*) from pg_policies where schemaname in ('public','storage')")"
"${PSQL[@]}" -o /dev/null -f tools/sql/test-social.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
echo "== gallery videos"; "${PSQL[@]}" -o /dev/null -f tools/sql/test-gallery-video.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
echo "== sleep logs"; "${PSQL[@]}" -o /dev/null -f tools/sql/test-sleep.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
echo "== mind & recovery"; "${PSQL[@]}" -o /dev/null -f tools/sql/test-mind.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
echo "== messages"; "${PSQL[@]}" -o /dev/null -f tools/sql/test-messages.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
echo "== calls"; "${PSQL[@]}" -o /dev/null -f tools/sql/test-calls.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
