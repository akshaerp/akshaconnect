#!/usr/bin/env bash
set -euo pipefail
umask 077

BRANCH="phase/standalone-v1"
REPO="${AKSHACONNECT_REPO:-/home/ubuntu/akshaconnect}"
LIVE="akshaconnect-api"
EXPECTED_BASE_IMAGE="${AKSHACONNECT_EXPECTED_BASE_IMAGE:-akshaconnect-api:v4b5r1-message-management}"
ENV_FILE="/etc/akshaconnect/akshaconnect.env"
ATTACH="/var/lib/akshaconnect/attachments"
FCM="/etc/akshaconnect/firebase-fcm-sender.json"
PUBLIC_HEALTH_URL="${AKSHACONNECT_PUBLIC_HEALTH_URL:-}"

EXPECTED_HEAD="${EXPECTED_HEAD:-}"
if [ -z "$EXPECTED_HEAD" ]; then
  echo "ERROR: EXPECTED_HEAD is required."
  echo "Usage: EXPECTED_HEAD=<pushed_commit_sha> bash $0"
  exit 10
fi

SHORT="${EXPECTED_HEAD:0:8}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
CANDIDATE_IMAGE="akshaconnect-api:sso-mw-v2_1-$SHORT"
CANDIDATE="akshaconnect-api-sso-mw-v2_1-candidate"
ROLLBACK="akshaconnect-api-rollback-sso-mw-v2_1-$TS"
ENV_BACKUP="/etc/akshaconnect/akshaconnect.env.pre-sso-mw-v2_1-$TS"
BUILD="/tmp/akshaconnect_sso_mw_v2_1_build_$TS"

echo "============================================================"
echo " AKSHACONNECT SSO + MULTI-WORKSPACE V2.1"
echo " MUMBAI CONTROLLED DEPLOYMENT"
echo "============================================================"

echo "===== 1. LIVE RUNTIME GUARD ====="
sudo docker ps --format '{{.Names}}' | grep -qx "$LIVE" || { echo "ERROR: live API missing"; exit 11; }
LIVE_IMAGE="$(sudo docker inspect "$LIVE" --format '{{.Config.Image}}')"
LIVE_NETWORK="$(sudo docker inspect "$LIVE" --format '{{.HostConfig.NetworkMode}}')"
LIVE_RESTART="$(sudo docker inspect "$LIVE" --format '{{.HostConfig.RestartPolicy.Name}}')"
echo "Live image   : $LIVE_IMAGE"
echo "Network      : $LIVE_NETWORK"
echo "Restart      : $LIVE_RESTART"
[ "$LIVE_IMAGE" = "$EXPECTED_BASE_IMAGE" ] || { echo "ERROR: unexpected live base image"; exit 12; }
[ "$LIVE_NETWORK" = "host" ] || { echo "ERROR: live network is not host"; exit 13; }
[ "$LIVE_RESTART" = "unless-stopped" ] || { echo "ERROR: unexpected restart policy"; exit 14; }
curl -fsS http://127.0.0.1:4100/health >/dev/null
curl -fsS http://127.0.0.1:4100/ready >/dev/null
echo "LIVE RUNTIME PASS"

echo "===== 2. PROTECTED RUNTIME INPUTS ====="
sudo test -r "$ENV_FILE"
sudo test -r "$FCM"
test -d "$ATTACH"
sudo grep -q '^AKSHACONNECT_ERP_API_KEY=.' "$ENV_FILE" || { echo "ERROR: ERP API key missing"; exit 15; }
sudo grep -q '^AKSHACONNECT_ERP_BASE_URL=https://app\.akshaerp\.com$' "$ENV_FILE" || { echo "ERROR: ERP base URL mismatch"; exit 16; }
sudo grep -q '^AKSHACONNECT_ERP_API_CLIENT_ID=AKSHACONNECT_APP$' "$ENV_FILE" || { echo "ERROR: ERP client mismatch"; exit 17; }
echo "PROTECTED ENV PASS (secret not printed)"

echo "===== 3. GIT SOURCE GUARD + FAST-FORWARD PULL ====="
test -d "$REPO/.git" || { echo "ERROR: repo missing at $REPO"; exit 18; }
[ -z "$(git -C "$REPO" status --porcelain)" ] || { echo "ERROR: server repo is not clean"; exit 19; }
git -C "$REPO" fetch origin "$BRANCH"
REMOTE_HEAD="$(git -C "$REPO" rev-parse "origin/$BRANCH")"
[ "$REMOTE_HEAD" = "$EXPECTED_HEAD" ] || {
  echo "ERROR: origin/$BRANCH does not match EXPECTED_HEAD"
  echo "Expected: $EXPECTED_HEAD"
  echo "Remote  : $REMOTE_HEAD"
  exit 20
}
git -C "$REPO" checkout "$BRANCH"
git -C "$REPO" pull --ff-only origin "$BRANCH"
ACTUAL_HEAD="$(git -C "$REPO" rev-parse HEAD)"
[ "$ACTUAL_HEAD" = "$EXPECTED_HEAD" ] || { echo "ERROR: local server HEAD mismatch"; exit 21; }
echo "SOURCE HEAD PASS: $ACTUAL_HEAD"

echo "===== 4. SOURCE TESTS (DOCKERIZED NODE) ====="
cd "$REPO"

# Mumbai intentionally does not require a host-level Node installation.
# Use the already accepted live/base image's Node runtime against a read-only
# bind mount of the exact guarded Git source.
sudo docker image inspect "$EXPECTED_BASE_IMAGE" >/dev/null 2>&1 || {
  echo "ERROR: expected base image is not available for source validation"
  exit 29
}

sudo docker run --rm \
  --entrypoint sh \
  -v "$REPO:/src:ro" \
  -w /src \
  "$EXPECTED_BASE_IMAGE" \
  -lc '
    set -eu
    node --version
    node --check services/api/src/server.js
    node --check services/api/src/auth/akshaErpSsoHttpHandler.js
    node --check services/api/src/auth/akshaErpSsoRepository.js
    node --check services/api/src/auth/akshaErpSsoService.js
    node --check services/api/src/auth/localIdentityRepository.js
    node --check services/api/src/auth/localIdentityService.js
    node --test test/p1-v9-akshaerp-sso-multiworkspace-v2.test.js
  '

echo "SOURCE TESTS PASS"

echo "===== 5. BUILD ISOLATED CANDIDATE IMAGE ====="
sudo docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true
if sudo ss -lntp | grep -q ':4101'; then
  echo "ERROR: port 4101 already in use"
  exit 22
fi

rm -rf "$BUILD"
mkdir -p "$BUILD/overlay/src/auth" "$BUILD/overlay/packages/contracts/src"
cp services/api/src/server.js "$BUILD/overlay/src/server.js"
cp services/api/src/auth/akshaErpSsoHttpHandler.js "$BUILD/overlay/src/auth/"
cp services/api/src/auth/akshaErpSsoRepository.js "$BUILD/overlay/src/auth/"
cp services/api/src/auth/akshaErpSsoService.js "$BUILD/overlay/src/auth/"
cp services/api/src/auth/localIdentityRepository.js "$BUILD/overlay/src/auth/"
cp services/api/src/auth/localIdentityService.js "$BUILD/overlay/src/auth/"
cp packages/contracts/src/integrationTransportV1.js "$BUILD/overlay/packages/contracts/src/"
cp packages/contracts/src/providerModesV1.js "$BUILD/overlay/packages/contracts/src/"

cat > "$BUILD/Dockerfile" <<EOF
ARG BASE_IMAGE=$EXPECTED_BASE_IMAGE
FROM \${BASE_IMAGE}
COPY overlay/src/server.js /app/src/server.js
COPY overlay/src/auth/akshaErpSsoHttpHandler.js /app/src/auth/akshaErpSsoHttpHandler.js
COPY overlay/src/auth/akshaErpSsoRepository.js /app/src/auth/akshaErpSsoRepository.js
COPY overlay/src/auth/akshaErpSsoService.js /app/src/auth/akshaErpSsoService.js
COPY overlay/src/auth/localIdentityRepository.js /app/src/auth/localIdentityRepository.js
COPY overlay/src/auth/localIdentityService.js /app/src/auth/localIdentityService.js
COPY overlay/packages/contracts/src/integrationTransportV1.js /packages/contracts/src/integrationTransportV1.js
COPY overlay/packages/contracts/src/providerModesV1.js /packages/contracts/src/providerModesV1.js
RUN node --check /app/src/server.js \
 && node --check /app/src/auth/akshaErpSsoHttpHandler.js \
 && node --check /app/src/auth/akshaErpSsoRepository.js \
 && node --check /app/src/auth/akshaErpSsoService.js \
 && node --check /app/src/auth/localIdentityRepository.js \
 && node --check /app/src/auth/localIdentityService.js \
 && node -e "require('/app/src/integration/erpHttpAdapter'); require('/app/src/integration/providerConfiguration'); console.log('provider runtime imports pass')"
EOF

sudo docker build --no-cache -t "$CANDIDATE_IMAGE" "$BUILD"
echo "CANDIDATE IMAGE BUILD PASS: $CANDIDATE_IMAGE"

echo "===== 6. ISOLATED CANDIDATE ON 4101 ====="
sudo docker run -d \
  --name "$CANDIDATE" \
  --network host \
  --env-file "$ENV_FILE" \
  -e PORT=4101 \
  -e AKSHACONNECT_IDENTITY_PROVIDER=LOCAL \
  -e AKSHACONNECT_BUSINESS_PROVIDER=NONE \
  -v "$FCM:/run/firebase-fcm-sender.json:ro" \
  -v "$ATTACH:/var/lib/akshaconnect/attachments" \
  "$CANDIDATE_IMAGE" >/dev/null

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4101/health >/dev/null 2>&1 &&
     curl -fsS http://127.0.0.1:4101/ready >/dev/null 2>&1; then
    echo "ISOLATED CANDIDATE HEALTH PASS"
    break
  fi
  if [ "$i" -eq 30 ]; then
    sudo docker logs "$CANDIDATE" --tail 200 || true
    exit 23
  fi
  sleep 1
done
sudo docker rm -f "$CANDIDATE" >/dev/null
echo "CANDIDATE REMOVED; 4101 CLOSED"

echo "===== 7. GUARDED DATABASE DEPLOYMENT ====="
AKSHACONNECT_REPO="$REPO" \
AKSHACONNECT_CONTAINER="$LIVE" \
bash "$REPO/deployment/mumbai/DEPLOY-AKSHACONNECT-DB-V2_1.sh"
echo "DATABASE DEPLOYMENT PASS"

echo "===== 8. BACKUP + ACTIVATE SSO ENV KEYS ====="
sudo cp -a "$ENV_FILE" "$ENV_BACKUP"
sudo ENV_FILE="$ENV_FILE" python3 - <<'PY'
import os
from pathlib import Path

path=Path(os.environ["ENV_FILE"])
text=path.read_text()
updates={
  "AKSHACONNECT_IDENTITY_PROVIDER":"AKSHAERP",
  "AKSHACONNECT_BUSINESS_PROVIDER":"NONE",
  "AKSHACONNECT_ERP_BASE_URL":"https://app.akshaerp.com",
  "AKSHACONNECT_ERP_API_CLIENT_ID":"AKSHACONNECT_APP",
  "AKSHACONNECT_ERP_TIMEOUT_MS":"5000",
  "AKSHACONNECT_ERP_ALLOWED_ORIGINS":"https://app.akshaerp.com",
  "AKSHACONNECT_SSO_SESSION_TTL_SECONDS":"28800",
}
lines=text.splitlines()
seen=set()
out=[]
for line in lines:
    if "=" in line and not line.lstrip().startswith("#"):
        key=line.split("=",1)[0].strip()
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
            continue
    out.append(line)
for key,val in updates.items():
    if key not in seen:
        out.append(f"{key}={val}")
path.write_text("\n".join(out)+"\n")
PY

sudo grep -q '^AKSHACONNECT_IDENTITY_PROVIDER=AKSHAERP$' "$ENV_FILE"
sudo grep -q '^AKSHACONNECT_ERP_ALLOWED_ORIGINS=https://app\.akshaerp\.com$' "$ENV_FILE"
sudo grep -q '^AKSHACONNECT_ERP_API_KEY=.' "$ENV_FILE"
echo "SSO ENV ACTIVATION PASS"
echo "ENV rollback copy: $ENV_BACKUP"

rollback_live() {
  echo "ROLLBACK START"
  sudo docker rm -f "$LIVE" >/dev/null 2>&1 || true
  sudo cp -a "$ENV_BACKUP" "$ENV_FILE"
  if sudo docker inspect "$ROLLBACK" >/dev/null 2>&1; then
    sudo docker rename "$ROLLBACK" "$LIVE"
    sudo docker start "$LIVE" >/dev/null
    for i in $(seq 1 30); do
      if curl -fsS http://127.0.0.1:4100/health >/dev/null 2>&1; then
        echo "ROLLBACK HEALTH PASS"
        return 0
      fi
      sleep 1
    done
  fi
  echo "CRITICAL: rollback failed"
  return 1
}

echo "===== 9. PRESERVE CURRENT LIVE CONTAINER ====="
sudo docker stop "$LIVE" >/dev/null
sudo docker rename "$LIVE" "$ROLLBACK"
echo "ROLLBACK CONTAINER: $ROLLBACK"

echo "===== 10. START V2.1 LIVE API ON 4100 ====="
if ! sudo docker run -d \
  --name "$LIVE" \
  --network host \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e PORT=4100 \
  -v "$FCM:/run/firebase-fcm-sender.json:ro" \
  -v "$ATTACH:/var/lib/akshaconnect/attachments" \
  "$CANDIDATE_IMAGE" >/dev/null
then
  rollback_live
  exit 24
fi

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4100/health >/dev/null 2>&1 &&
     curl -fsS http://127.0.0.1:4100/ready >/dev/null 2>&1; then
    echo "NEW LIVE API HEALTH PASS"
    break
  fi
  if [ "$i" -eq 30 ]; then
    sudo docker logs "$LIVE" --tail 200 || true
    rollback_live
    exit 25
  fi
  sleep 1
done

echo "===== 11. SSO ROUTE ACTIVATION PROBE ====="
STATUS="$(
  curl -sS -o /tmp/akshaconnect_sso_probe.json -w '%{http_code}' \
    -H 'Origin: https://app.akshaerp.com' \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    -d '{}' \
    http://127.0.0.1:4100/api/v1/auth/akshaerp/sso
)"
cat /tmp/akshaconnect_sso_probe.json
echo
[ "$STATUS" = "401" ] || {
  echo "ERROR: expected 401 token-required probe, got $STATUS"
  rollback_live
  exit 26
}
grep -q 'AKSHAERP_SSO_TOKEN_REQUIRED' /tmp/akshaconnect_sso_probe.json || {
  echo "ERROR: SSO token-required marker missing"
  rollback_live
  exit 27
}
echo "SSO ROUTE ACTIVE PASS"

if [ -n "$PUBLIC_HEALTH_URL" ]; then
  curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null
  echo "PUBLIC HEALTH PASS"
fi

echo "===== 12. FINAL RUNTIME ====="
sudo docker inspect "$LIVE" \
  --format 'Image={{.Config.Image}} Network={{.HostConfig.NetworkMode}} Restart={{.HostConfig.RestartPolicy.Name}}'
sudo ss -lntp | grep ':4100'
if sudo ss -lntp | grep -q ':4101'; then
  echo "ERROR: 4101 still listening"
  rollback_live
  exit 28
fi

echo "============================================================"
echo " AKSHACONNECT SSO + MULTI-WORKSPACE V2.1 : DEPLOYED"
echo "============================================================"
echo "Source HEAD      : $EXPECTED_HEAD"
echo "Live image       : $CANDIDATE_IMAGE"
echo "Live port        : 4100"
echo "Rollback container: $ROLLBACK"
echo "Rollback env     : $ENV_BACKUP"
echo "Database         : akshaconnect"
echo "SSO provider     : AKSHAERP"
echo "ERP provider     : https://app.akshaerp.com"
echo "Web UI           : UNCHANGED"
echo "============================================================"
