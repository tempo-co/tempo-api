#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$SCRIPT_DIR/../staging/tempo-staging-refresh.sh
TMP_DIR=$(mktemp -d)
SOCKET="$TMP_DIR/docker.sock"
trap 'kill "${SOCKET_PID:-}" 2>/dev/null || true; rm -rf "$TMP_DIR"' EXIT

BIN="$TMP_DIR/bin"
mkdir -p "$BIN" "$TMP_DIR/state" "$TMP_DIR/backups" "$TMP_DIR/home/.config/tempo-staging/docker-config" "$TMP_DIR/home/.local/share/tempo-staging/docker"
chmod 700 "$TMP_DIR/backups"
printf '%s\n' '{"auths":{"ghcr.io":{"auth":"synthetic"}}}' > "$TMP_DIR/home/.config/tempo-staging/docker-config/config.json"
chmod 600 "$TMP_DIR/home/.config/tempo-staging/docker-config/config.json"
python3 - "$TMP_DIR/backups/tempo-20260920-000000.dump" "$TMP_DIR/backups/tempo-20260921-060000.dump" <<'PY'
import sys
from pathlib import Path
for path in map(Path, sys.argv[1:]):
    path.write_bytes((f'synthetic archive {path.name}\n'.encode()) * 80)
PY
chmod 600 "$TMP_DIR/backups/tempo-20260920-000000.dump" "$TMP_DIR/backups/tempo-20260921-060000.dump"

cat > "$TMP_DIR/staging.env" <<'EOF'
TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
TEMPO_WEB_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
STAGING_PUBLIC_URL=https://staging.example.invalid/tempo
STAGING_WEB_HOST_PORT=8119
STAGING_DB_USERNAME=tempo_staging
STAGING_DB_PASSWORD=synthetic-refresh-password
STAGING_DB_NAME=tempo_staging
SESSION_SECRET=synthetic-session-secret
BANKING_SESSION_ENCRYPTION_KEY_B64=synthetic-banking-key
EOF
chmod 600 "$TMP_DIR/staging.env"
: > "$TMP_DIR/compose.yml"
: > "$TMP_DIR/docker.log"
printf 'production.example.invalid\n' > "$TMP_DIR/home/.config/tempo-staging/production-origin-host"
chmod 600 "$TMP_DIR/home/.config/tempo-staging/production-origin-host"

python3 - "$SOCKET" <<'PY' &
import socket
import sys
import time
path = sys.argv[1]
server = socket.socket(socket.AF_UNIX)
server.bind(path)
server.listen(1)
while True:
    time.sleep(1)
PY
SOCKET_PID=$!
for _ in $(seq 1 50); do
    [[ -S "$SOCKET" ]] && break
    sleep 0.02
done
[[ -S "$SOCKET" ]] || { printf 'FAIL: fake Docker socket did not start\n' >&2; exit 1; }

cat > "$BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"

if [[ ${1-} == info ]]; then
    if [[ $* == *SecurityOptions* ]]; then printf 'rootless\n'; else printf '%s\n' "$EXPECTED_STAGING_ROOT"; fi
    exit 0
fi

if [[ ${1-} == cp ]]; then
    exit 0
fi
if [[ ${1-} == compose ]]; then
    command_line="$*"
    if [[ $command_line == *' stop api web'* && ${FAKE_STOP_FAILURE:-0} == 1 && ! -e ${FAKE_PARTIAL_STOP_MARKER:?} ]]; then
        : > "$FAKE_PARTIAL_STOP_MARKER"
        exit 1
    fi
    if [[ $command_line == *' config --format json'* ]]; then
        if [[ ${FAKE_BAD_POLICY:-0} == 1 ]]; then
            cat <<'JSON'
{"name":"tempo-staging","services":{"api":{"image":"ghcr.io/tempo-co/tempo-api:latest","environment":{"AI_CATEGORIZATION_ENABLED":"false","AI_CATEGORIZATION_WEB_SEARCH_ENABLED":"false","BANKING_INTEGRATION_ENABLED":"false","DB_SYNCHRONIZE":"false","WEB_BASE_URL":"https://staging.example.invalid/tempo"}},"web":{"image":"ghcr.io/tempo-co/tempo-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","ports":[{"mode":"ingress","host_ip":"0.0.0.0","target":8080,"published":"8119","protocol":"tcp"}]}},"volumes":{"tempo_staging_postgres_data":{"name":"tempo-staging-postgres-data"}},"networks":{"backend":{"name":"tempo-staging-backend"},"edge":{"name":"tempo-staging-edge"}}}
JSON
        else
            rendered_config=$(cat <<'JSON'
{"name":"tempo-staging","services":{"postgres":{"image":"postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":{"POSTGRES_DB":"tempo_staging"},"volumes":["tempo-staging-postgres-data:/var/lib/postgresql/data"],"networks":["backend"]},"redis":{"image":"redis@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","networks":["backend"]},"mailpit":{"image":"axllent/mailpit@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","networks":["backend","edge"]},"api":{"image":"ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":{"DB_HOST":"postgres","DB_NAME":"tempo_staging","AI_CATEGORIZATION_ENABLED":"false","AI_CATEGORIZATION_WEB_SEARCH_ENABLED":"false","BANKING_INTEGRATION_ENABLED":"false","DB_SYNCHRONIZE":"false","WEB_BASE_URL":"https://staging.example.invalid/tempo"},"networks":["backend","edge"]},"web":{"image":"ghcr.io/tempo-co/tempo-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","ports":[{"mode":"ingress","host_ip":"127.0.0.1","target":8080,"published":"8119","protocol":"tcp"}],"networks":["edge","ingress"]}},"volumes":{"tempo_staging_postgres_data":{"name":"tempo-staging-postgres-data"}},"networks":{"backend":{"name":"tempo-staging-backend","internal":true},"edge":{"name":"tempo-staging-edge","internal":true},"ingress":{"name":"tempo-staging-ingress","internal":false}}}
JSON
)
            printf '%s\n' "$rendered_config" | python3 -c '
import json
import os
import sys

config = json.load(sys.stdin)
services = config["services"]
api = services["api"]
postgres = services["postgres"]
database = os.environ.get("FAKE_STAGING_DB_NAME", "tempo_staging")
api["environment"]["DB_NAME"] = database
postgres["environment"]["POSTGRES_DB"] = database
if os.environ.get("FAKE_BAD_DB_HOST") == "1":
    api["environment"]["DB_HOST"] = "production-db.internal"
if os.environ.get("FAKE_BAD_DB_NAME") == "1":
    api["environment"]["DB_NAME"] = "production_database"
if os.environ.get("FAKE_DB_HOST_REDIRECT") == "1":
    api["extra_hosts"] = ["postgres:192.0.2.10"]
network_case = os.environ.get("FAKE_BAD_NETWORK")
if network_case == "api-extra-network":
    api["networks"].append("production-db")
    config["networks"]["production-db"] = {"name": "tempo-production-db", "external": True}
elif network_case == "postgres-extra-network":
    postgres["networks"].append("edge")
elif network_case == "api-network-alias":
    api["networks"] = {"backend": {"aliases": ["postgres"]}, "edge": {}}
elif network_case == "external-backend":
    config["networks"]["backend"]["external"] = True
elif network_case == "network-mode":
    api["network_mode"] = "host"
json.dump(config, sys.stdout)
'
        fi
        exit 0
    fi
    if [[ $command_line == *' ps -q postgres'* ]]; then printf 'pgid\n'; exit 0; fi
    if [[ $command_line == *' ps -q redis'* ]]; then printf 'redisid\n'; exit 0; fi
    if [[ $command_line == *' ps -q api'* ]]; then printf 'apiid\n'; exit 0; fi
    exit 0
fi
if [[ ${1-} == exec ]]; then
    shift
    while [[ ${1-} == -i || ${1-} == -t || ${1-} == -e ]]; do
        if [[ $1 == -e ]]; then shift; fi
        shift
    done
    container=${1-}
    shift
    command_line="exec $container $*"
    if [[ $container == pgid && $command_line == *' chown postgres:postgres '* && ${FAKE_PGPASS_CHOWN_FAILURE:-0} == 1 ]]; then
        exit 1
    fi

    if [[ $container == pgid && $command_line == *'psql '* ]]; then
        sql=''
        args=("$@")
        for ((i = 0; i < ${#args[@]}; i += 1)); do
            if [[ ${args[i]} == -c ]]; then sql=${args[i + 1]}; fi
        done
        if [[ $command_line == *' -At '* ]]; then
            if [[ $sql == *providerSessionId* ]]; then printf '0|0\n'
            elif [[ $sql == *bank_sync_runs* ]]; then printf '0\n'
            else printf '0\n'
            fi
        fi
        exit 0
    fi
    if [[ $container == redisid && $command_line == *'FLUSHALL'* ]]; then
        exit 0
    fi
    exit 0
fi
exit 0
EOF
chmod +x "$BIN/docker"

cat > "$BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$FAKE_CURL_LOG"
url=''
for arg in "$@"; do url=$arg; done
if [[ $url == */api/health ]]; then
    request_count=0
    if [[ -f $FAKE_API_HEALTH_COUNT_FILE ]]; then
        request_count=$(<"$FAKE_API_HEALTH_COUNT_FILE")
    fi
    request_count=$((request_count + 1))
    printf '%s\n' "$request_count" > "$FAKE_API_HEALTH_COUNT_FILE"
    if (( request_count > 2 )); then
        printf 'curl: (22) HTTP 429 rate limit exceeded\n' >&2
        exit 22
    fi
    if [[ ${FAKE_API_HEALTH_RESPONSE_AT_REQUEST:-} == "$request_count" ]]; then
        printf '%s\n' "${FAKE_API_HEALTH_RESPONSE:?}"
    else
        printf '{"status":"ok"}\n'
    fi
fi
exit 0
EOF
chmod +x "$BIN/curl"

export PATH="$BIN:$PATH"
export HOME="$TMP_DIR/home"
export EXPECTED_STAGING_ROOT="$HOME/.local/share/tempo-staging/docker"
export FAKE_DOCKER_LOG="$TMP_DIR/docker.log"
export TEMPO_STAGING_REFRESH_COMPOSE_FILE="$TMP_DIR/compose.yml"
export TEMPO_STAGING_REFRESH_ENV_FILE="$TMP_DIR/staging.env"
export TEMPO_STAGING_REFRESH_STATE_DIR="$TMP_DIR/state"
export TEMPO_STAGING_REFRESH_BACKUP_DIR="$TMP_DIR/backups"
export TEMPO_STAGING_REFRESH_DOCKER_HOST="unix://$SOCKET"
export TEMPO_STAGING_REFRESH_TEST_MODE=1
export FAKE_PARTIAL_STOP_MARKER="$TMP_DIR/partial-stop.marker"
export FAKE_CURL_LOG="$TMP_DIR/curl.log"
export FAKE_API_HEALTH_COUNT_FILE="$TMP_DIR/api-health-request-count"

cp "$TMP_DIR/staging.env" "$TMP_DIR/duplicate.env"
printf 'STAGING_DB_NAME=duplicate_name\n' >> "$TMP_DIR/duplicate.env"
if TEMPO_STAGING_REFRESH_ENV_FILE="$TMP_DIR/duplicate.env" bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: duplicate staging env keys were accepted\n' >&2
    exit 1
fi
if TEMPO_STAGING_REFRESH_TEST_MODE=0 bash "$SCRIPT" refresh --confirm-production-backup-refresh >/dev/null 2>&1; then
    printf 'FAIL: refresh test mode was not required for the synthetic Docker socket\n' >&2
    exit 1
fi
cp "$TMP_DIR/staging.env" "$TMP_DIR/permissive.env"
chmod 644 "$TMP_DIR/permissive.env"
if TEMPO_STAGING_REFRESH_ENV_FILE="$TMP_DIR/permissive.env" bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: permissive staging env mode was accepted\n' >&2
    exit 1
fi
if TEMPO_STAGING_REFRESH_TEST_MODE=0 TEMPO_STAGING_REFRESH_BACKUP_DIR="$TMP_DIR/backups" bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: production backup directory override was accepted\n' >&2
    exit 1
fi
if FAKE_BAD_POLICY=1 bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: unsafe rendered staging policy was accepted\n' >&2
    exit 1
fi
if FAKE_BAD_DB_HOST=1 bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: production database host in rendered staging Compose was accepted\n' >&2
    exit 1
fi
if FAKE_BAD_DB_NAME=1 bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: mismatched database name in rendered staging Compose was accepted\n' >&2
    exit 1
fi
if FAKE_DB_HOST_REDIRECT=1 bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: external Compose host mapping for staging Postgres was accepted\n' >&2
    exit 1
fi

for bad_network in api-extra-network postgres-extra-network api-network-alias external-backend network-mode; do
    if FAKE_BAD_NETWORK="$bad_network" bash "$SCRIPT" validate >/dev/null 2>&1; then
        printf 'FAIL: unsafe staging network policy was accepted: %s\n' "$bad_network" >&2
        exit 1
    fi
done

for reserved_database in tempo_staging_refresh tempo_staging_previous tempo_staging_failed postgres template0 template1; do
    reserved_env="$TMP_DIR/$reserved_database.env"
    python3 - "$TMP_DIR/staging.env" "$reserved_env" "$reserved_database" <<'PY'
from pathlib import Path
import re
import sys
source, target, database = map(Path, sys.argv[1:])
text = source.read_text(encoding='utf-8')
text, count = re.subn(r'(?m)^STAGING_DB_NAME=.*$', f'STAGING_DB_NAME={database.name}', text)
if count != 1:
    raise SystemExit('expected one synthetic staging database name')
target.write_text(text, encoding='utf-8')
PY
    chmod 600 "$reserved_env"
    : > "$FAKE_DOCKER_LOG"
    if FAKE_STAGING_DB_NAME="$reserved_database" TEMPO_STAGING_REFRESH_ENV_FILE="$reserved_env" bash "$SCRIPT" refresh --confirm-production-backup-refresh >/dev/null 2>&1; then
        printf 'FAIL: reserved staging database name %s was accepted\n' "$reserved_database" >&2
        exit 1
    fi
    if grep -E 'compose .* (up|down|stop|start)|CREATE DATABASE|DROP DATABASE|pg_restore|psql ' "$FAKE_DOCKER_LOG" >/dev/null; then
        printf 'FAIL: reserved staging database name %s reached database operations\n' "$reserved_database" >&2
        exit 1
    fi
done

bash "$SCRIPT" refresh --confirm-production-backup-refresh

[[ -f "$TMP_DIR/backups/tempo-20260920-000000.dump" && -f "$TMP_DIR/backups/tempo-20260921-060000.dump" ]] || \
    { printf 'FAIL: refresh removed a source backup archive\n' >&2; exit 1; }
grep -F "cp $TMP_DIR/backups/tempo-20260921-060000.dump" "$FAKE_DOCKER_LOG" >/dev/null || \
    { printf 'FAIL: refresh did not copy the newest custom-format backup\n' >&2; exit 1; }
if grep -E 'prodpg|pg_dump|\.sql\.gz' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: refresh queried production or used a legacy SQL archive\n' >&2
    exit 1
fi
grep -F 'pg_restore --list' "$FAKE_DOCKER_LOG" >/dev/null || { printf 'FAIL: staging pg_restore did not validate the archive\n' >&2; exit 1; }
grep -F 'pg_restore --exit-on-error --no-owner --no-privileges' "$FAKE_DOCKER_LOG" >/dev/null || \
    { printf 'FAIL: staging restore did not strip owners and privileges\n' >&2; exit 1; }
if grep -F 'set-staging-password.js' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: refresh overwrote the restored production account identity/password hash\n' >&2
    exit 1
fi
grep -F 'http://127.0.0.1:8119/tempo/' "$FAKE_CURL_LOG" >/dev/null || \
    { printf 'FAIL: refresh health check did not use the local staging route\n' >&2; exit 1; }
grep -F 'http://127.0.0.1:8119/tempo/api/health' "$FAKE_CURL_LOG" >/dev/null || \
    { printf 'FAIL: refresh health check did not exercise the host-facing staging API route\n' >&2; exit 1; }
python3 - "$FAKE_DOCKER_LOG" <<'PY'
from pathlib import Path
import re
import sys

log = Path(sys.argv[1]).read_text(encoding='utf-8')
writes = set(re.findall(
    r'(?i)\b(?:UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|INSERT\s+INTO|MERGE\s+INTO|COPY)\s+(?:public\.)?["`]?([a-z_]+)',
    log,
))
if writes != {'bank_connections', 'bank_sync_runs'}:
    raise SystemExit(f'unexpected data writes during refresh: {sorted(writes)}')
PY
grep -F 'redisid' "$FAKE_DOCKER_LOG" | grep -F 'FLUSHALL' >/dev/null || { printf 'FAIL: staging Redis was not flushed\n' >&2; exit 1; }
if grep -E 'prod(redis|_redis|Redis)' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: production Redis was touched\n' >&2
    exit 1
fi

for bad_response in 'not-json' '{"status":"degraded"}'; do
    : > "$FAKE_DOCKER_LOG"
    : > "$FAKE_CURL_LOG"
    : > "$FAKE_API_HEALTH_COUNT_FILE"
    output="$TMP_DIR/refresh-api-health-failure.out"
    # The staging deployer already consumed one request from this API client's
    # two-request, 30-second health-route allowance before calling refresh.
    curl --fail --silent --show-error --max-time 15 http://127.0.0.1:8119/tempo/api/health >/dev/null
    if FAKE_API_HEALTH_RESPONSE_AT_REQUEST=2 FAKE_API_HEALTH_RESPONSE="$bad_response" bash "$SCRIPT" refresh --confirm-production-backup-refresh >"$output" 2>&1; then
        printf 'FAIL: refresh accepted invalid API health JSON: %s\n' "$bad_response" >&2
        exit 1
    fi
    grep -F 'host-facing staging API health route did not return healthy JSON' "$output" >/dev/null || \
        { printf 'FAIL: invalid API health JSON did not fail the refresh\n' >&2; exit 1; }
    python3 - "$FAKE_API_HEALTH_COUNT_FILE" "$FAKE_CURL_LOG" "$FAKE_DOCKER_LOG" "$output" <<'PY'
from pathlib import Path
import sys

count_file, curl_log, docker_log, output = map(Path, sys.argv[1:])
curls = curl_log.read_text(encoding='utf-8')
docker = docker_log.read_text(encoding='utf-8')
if count_file.read_text(encoding='utf-8').strip() != '2':
    raise SystemExit('rollback made a third host-facing API health request and hit the rate limit')
if curls.count('http://127.0.0.1:8119/tempo/api/health') != 2:
    raise SystemExit('expected only deployment and refresh host-facing API health requests')
if docker.count('up -d --wait api web') < 2:
    raise SystemExit('refresh failure did not restart API/web after rollback')
if 'database rollback was not verified' in output.read_text(encoding='utf-8'):
    raise SystemExit('API/web did not recover after invalid health JSON')
PY
done

: > "$FAKE_DOCKER_LOG"
chmod 775 "$TMP_DIR/backups"
if bash "$SCRIPT" refresh --confirm-production-backup-refresh >/dev/null 2>&1; then
    printf 'FAIL: permissive production backup directory mode was accepted\n' >&2
    exit 1
fi
if grep -E 'compose .* up| cp |CREATE DATABASE|pg_restore' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: invalid backup-directory permissions reached database work\n' >&2
    exit 1
fi
chmod 700 "$TMP_DIR/backups"
mkdir -p "$TMP_DIR/no-backups"
chmod 700 "$TMP_DIR/no-backups"
: > "$FAKE_DOCKER_LOG"
if TEMPO_STAGING_REFRESH_BACKUP_DIR="$TMP_DIR/no-backups" bash "$SCRIPT" refresh --confirm-production-backup-refresh >/dev/null 2>&1; then
    printf 'FAIL: refresh succeeded without a custom-format backup\n' >&2
    exit 1
fi
if grep -E 'compose .* up| cp |CREATE DATABASE|prodpg|pg_dump' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: missing-backup refresh touched a database or production\n' >&2
    exit 1
fi
: > "$FAKE_DOCKER_LOG"
export FAKE_PGPASS_CHOWN_FAILURE=1
if bash "$SCRIPT" refresh --confirm-production-backup-refresh >/dev/null 2>&1; then
    printf 'FAIL: pgpass installation failure unexpectedly succeeded\n' >&2
    exit 1
fi
if ! grep -F 'rm -f /tmp/tempo-staging-refresh.pgpass' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: partially installed staging pgpass was not cleaned up\n' >&2
    exit 1
fi
unset FAKE_PGPASS_CHOWN_FAILURE
: > "$FAKE_DOCKER_LOG"
export FAKE_STOP_FAILURE=1
if bash "$SCRIPT" refresh --confirm-production-backup-refresh >/dev/null 2>&1; then
    printf 'FAIL: partial application stop unexpectedly succeeded\n' >&2
    exit 1
fi
if ! grep -F ' stop api web' "$FAKE_DOCKER_LOG" >/dev/null || ! grep -F ' up -d --wait api web' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: partial application stop did not trigger verified restart recovery\n' >&2
    exit 1
fi
if grep -F 'PGPASSWORD=' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: staging database password was exposed in Docker argv\n' >&2
    exit 1
fi
printf 'PASS: tempo staging refresh fake-runtime flow\n'
