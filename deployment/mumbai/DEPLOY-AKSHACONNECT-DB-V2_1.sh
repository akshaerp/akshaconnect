#!/usr/bin/env bash
set -euo pipefail
umask 077

CONTAINER="${AKSHACONNECT_CONTAINER:-akshaconnect-api}"
REPO="${AKSHACONNECT_REPO:-/home/ubuntu/akshaconnect}"
EXPECTED_DB="akshaconnect"
EXPORT_DIR="${AKSHACONNECT_DB_EXPORT_DIR:-/home/ubuntu/db_exports}"

MIG1="$REPO/database/migrations/post_v1/core/202609241700__core_database_lifecycle_v1.sql"
MIG2="$REPO/database/migrations/post_v1/acn/202609241730__acn_tenant_multi_workspace_v1.sql"
PREFLIGHT="$REPO/database/migrations/post_v1/acn/verification/202609241730__acn_tenant_multi_workspace_v1_preflight.sql"
POSTCHECK="$REPO/database/migrations/post_v1/acn/verification/202609241730__acn_tenant_multi_workspace_v1_postcheck.sql"
PROVISION="$REPO/deployment/app/AKSHACONNECT_APP_TENANT_PROVISION_V2.sql"
PROVISION_VERIFY="$REPO/deployment/app/VERIFY_AKSHACONNECT_APP_TENANT_V2.sql"

MIG1_REL="database/migrations/post_v1/core/202609241700__core_database_lifecycle_v1.sql"
MIG2_REL="database/migrations/post_v1/acn/202609241730__acn_tenant_multi_workspace_v1.sql"
PROVISION_REL="deployment/app/AKSHACONNECT_APP_TENANT_PROVISION_V2.sql"

EXPECTED_MIG1_SHA="2073455649d6b29cea1461bd598e9caacdde102bee4d0058fb7f86ea88ea4cca"
EXPECTED_MIG2_SHA="d02840ad68e05966188b6e0269e6be567c794522a25b4c7d2b295bda334fd733"
EXPECTED_PROVISION_SHA="83617a8d93a252519140bc379bd93614e6532a79dad1337d9b427578f501d004"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
TRIAL_DB="akshaconnect_trial_${TS//[^0-9]/}"
BACKUP="$EXPORT_DIR/akshaconnect_pre_sso_multiworkspace_v2_1_${TS}.dump"
WORK="/tmp/akshaconnect_sso_multiworkspace_v2_1_${TS}"
mkdir -p "$WORK" "$EXPORT_DIR"

TRIAL_CREATED=0
cleanup() {
  code=$?
  if [ "$TRIAL_CREATED" -eq 1 ]; then
    dropdb --if-exists "$TRIAL_DB" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK" >/dev/null 2>&1 || true
  exit "$code"
}
trap cleanup EXIT

echo "============================================================"
echo " AKSHACONNECT DB V2.1 - TRIAL FIRST + LIVE APPLY"
echo "============================================================"

sudo docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || {
  echo "ERROR: $CONTAINER is not running"
  exit 20
}
curl -fsS http://127.0.0.1:4100/health >/dev/null
curl -fsS http://127.0.0.1:4100/ready >/dev/null
echo "LIVE API GUARD PASS"

for f in "$MIG1" "$MIG2" "$PREFLIGHT" "$POSTCHECK" "$PROVISION" "$PROVISION_VERIFY"; do
  test -f "$f" || { echo "ERROR: missing $f"; exit 21; }
done

[ "$(sha256sum "$MIG1" | awk '{print $1}')" = "$EXPECTED_MIG1_SHA" ] || { echo "ERROR: MIG1 SHA mismatch"; exit 22; }
[ "$(sha256sum "$MIG2" | awk '{print $1}')" = "$EXPECTED_MIG2_SHA" ] || { echo "ERROR: MIG2 SHA mismatch"; exit 23; }
[ "$(sha256sum "$PROVISION" | awk '{print $1}')" = "$EXPECTED_PROVISION_SHA" ] || { echo "ERROR: APP provisioning SHA mismatch"; exit 24; }
echo "MIGRATION SHA GUARDS PASS"

DB_URL="$(
  sudo docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^AKSHACONNECT_DATABASE_URL=//p'
)"
test -n "$DB_URL" || { echo "ERROR: AKSHACONNECT_DATABASE_URL missing"; exit 25; }

for cmd in python3 psql pg_dump pg_restore createdb dropdb; do
  command -v "$cmd" >/dev/null || { echo "ERROR: missing command $cmd"; exit 26; }
done

eval "$(DB_URL="$DB_URL" python3 - <<'PY'
import os, shlex
from urllib.parse import urlparse, unquote
u=urlparse(os.environ["DB_URL"])
if u.scheme not in ("postgres","postgresql"):
    raise SystemExit("Unexpected PostgreSQL URL")
for k,v in {
    "PGHOST":u.hostname or "127.0.0.1",
    "PGPORT":str(u.port or 5432),
    "PGUSER":unquote(u.username or ""),
    "PGPASSWORD":unquote(u.password or ""),
}.items():
    print(f"export {k}={shlex.quote(v)}")
PY
)"

LIVE_DB="$(psql -X -At -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -c 'select current_database()')"
[ "$LIVE_DB" = "$EXPECTED_DB" ] || { echo "ERROR: live DB identity mismatch: $LIVE_DB"; exit 27; }
echo "DATABASE IDENTITY PASS: $LIVE_DB"

TENANT_TABLE="$(psql -X -At -d "$EXPECTED_DB" -c "select coalesce(to_regclass('public.ac_tenant')::text,'')")"
if [ -n "$TENANT_TABLE" ]; then
  echo "V2 tenant model already exists; verifying canonical state."
  psql -X -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -f "$POSTCHECK"
  psql -X -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -f "$PROVISION_VERIFY"
  echo "DATABASE V2.1 ALREADY APPLIED / VERIFIED"
  trap - EXIT
  rm -rf "$WORK"
  exit 0
fi

psql -X -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -f "$PREFLIGHT"
echo "LIVE PREFLIGHT PASS"

pg_dump --format=custom --no-owner --no-acl -d "$EXPECTED_DB" -f "$BACKUP"
pg_restore --list "$BACKUP" >/dev/null
BACKUP_SHA="$(sha256sum "$BACKUP" | awk '{print $1}')"
echo "ROLLBACK_DUMP=$BACKUP"
echo "ROLLBACK_SHA256=$BACKUP_SHA"
echo "BACKUP CATALOGUE PASS"

APPLY_SQL="$WORK/apply.sql"
cat > "$APPLY_SQL" <<SQL
\set ON_ERROR_STOP on
BEGIN;
\i '$MIG1'
INSERT INTO public.ac_db_migrations
(module_code,migration_type,migration_file,migration_sha256,status,metadata_json)
VALUES
('CORE','BASELINE_BOOTSTRAP','$MIG1_REL','$EXPECTED_MIG1_SHA','SUCCESS',
 jsonb_build_object('deployment','MUMBAI'));

\i '$MIG2'
INSERT INTO public.ac_db_migrations
(module_code,migration_type,migration_file,migration_sha256,status,metadata_json)
VALUES
('ACN','POST_V1','$MIG2_REL','$EXPECTED_MIG2_SHA','SUCCESS',
 jsonb_build_object('deployment','MUMBAI'));

\i '$PROVISION'
INSERT INTO public.ac_db_seed_runs
(seed_code,seed_file,seed_sha256,status,metadata_json)
VALUES
('AKSHACONNECT_APP_TENANT_V2','$PROVISION_REL','$EXPECTED_PROVISION_SHA','SUCCESS',
 jsonb_build_object('provider','AKSHAERP','external_subject','APP','tenant_code','AKSHAERP_INTERNAL'));
COMMIT;
SQL

echo "===== TRIAL RESTORE ====="
createdb "$TRIAL_DB"
TRIAL_CREATED=1
pg_restore --no-owner --no-acl -d "$TRIAL_DB" "$BACKUP"
psql -X -v ON_ERROR_STOP=1 -d "$TRIAL_DB" -f "$PREFLIGHT"
psql -X -v ON_ERROR_STOP=1 -d "$TRIAL_DB" -f "$APPLY_SQL"
psql -X -v ON_ERROR_STOP=1 -d "$TRIAL_DB" -f "$POSTCHECK"
psql -X -v ON_ERROR_STOP=1 -d "$TRIAL_DB" -f "$PROVISION_VERIFY"
dropdb "$TRIAL_DB"
TRIAL_CREATED=0
echo "TRIAL RESTORE / APPLY / POSTCHECK PASS"

echo "===== LIVE RECHECK ====="
psql -X -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -f "$PREFLIGHT"
curl -fsS http://127.0.0.1:4100/health >/dev/null

echo "===== QUIESCE API ====="
sudo docker stop "$CONTAINER" >/dev/null
API_RESTART_NEEDED=1
restart_api() {
  if [ "${API_RESTART_NEEDED:-0}" -eq 1 ]; then
    sudo docker start "$CONTAINER" >/dev/null || true
  fi
}
trap 'restart_api; cleanup' EXIT

ACTIVE="$(psql -X -At -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -c "
select count(*)
from pg_stat_activity
where datname=current_database()
  and pid<>pg_backend_pid()
  and state<>'idle'
")"
[ "$ACTIVE" = "0" ] || { echo "ERROR: active DB sessions remain: $ACTIVE"; exit 28; }
echo "ZERO ACTIVE DB SESSIONS PASS"

psql -X -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -f "$APPLY_SQL"
psql -X -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -f "$POSTCHECK"
psql -X -v ON_ERROR_STOP=1 -d "$EXPECTED_DB" -f "$PROVISION_VERIFY"
echo "LIVE DATABASE APPLY + POSTCHECK PASS"

sudo docker start "$CONTAINER" >/dev/null
API_RESTART_NEEDED=0

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4100/health >/dev/null 2>&1 &&
     curl -fsS http://127.0.0.1:4100/ready >/dev/null 2>&1; then
    echo "API HEALTH AFTER DB MIGRATION PASS"
    break
  fi
  [ "$i" -lt 30 ] || { echo "ERROR: API health did not recover"; exit 29; }
  sleep 1
done

trap - EXIT
rm -rf "$WORK"

echo "============================================================"
echo " AKSHACONNECT DB V2.1 PASS"
echo " Rollback: $BACKUP"
echo " SHA256  : $BACKUP_SHA"
echo "============================================================"
