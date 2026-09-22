#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$SCRIPT_DIR/../staging/tempo-staging-refresh.sh
TMP_DIR=$(mktemp -d)
SOCKET="$TMP_DIR/docker.sock"
trap 'kill "${SOCKET_PID:-}" 2>/dev/null || true; rm -rf "$TMP_DIR"' EXIT

BIN="$TMP_DIR/bin"
mkdir -p "$BIN" "$TMP_DIR/state" "$TMP_DIR/home/.config/tempo-staging/docker-config" "$TMP_DIR/home/.local/share/tempo-staging/docker"
printf '%s\n' '{"auths":{"ghcr.io":{"auth":"synthetic"}}}' > "$TMP_DIR/home/.config/tempo-staging/docker-config/config.json"
chmod 600 "$TMP_DIR/home/.config/tempo-staging/docker-config/config.json"

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
if [[ ${1-} == inspect && $* == *prodpg* ]]; then
    if [[ $* == *'--format'* ]]; then
        printf '{"com.docker.compose.project":"tempo-api-production","com.docker.compose.service":"postgres"}\n'
    fi
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
            cat <<'JSON'
{"name":"tempo-staging","services":{"postgres":{"image":"postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","volumes":["tempo-staging-postgres-data:/var/lib/postgresql/data"],"networks":["backend"]},"redis":{"image":"redis@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","networks":["backend"]},"mailpit":{"image":"axllent/mailpit@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","networks":["backend","edge"]},"api":{"image":"ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":{"AI_CATEGORIZATION_ENABLED":"false","AI_CATEGORIZATION_WEB_SEARCH_ENABLED":"false","BANKING_INTEGRATION_ENABLED":"false","DB_SYNCHRONIZE":"false","WEB_BASE_URL":"https://staging.example.invalid/tempo"},"networks":["backend","edge"]},"web":{"image":"ghcr.io/tempo-co/tempo-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","ports":[{"mode":"ingress","host_ip":"127.0.0.1","target":8080,"published":"8119","protocol":"tcp"}],"networks":["edge","ingress"]}},"volumes":{"tempo_staging_postgres_data":{"name":"tempo-staging-postgres-data"}},"networks":{"backend":{"name":"tempo-staging-backend"},"edge":{"name":"tempo-staging-edge"},"ingress":{"name":"tempo-staging-ingress"}}}
JSON
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
    if [[ $container == prodpg && $command_line == *'pg_dump --format=custom'* ]]; then
        printf 'synthetic-custom-format-dump\n'
        exit 0
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
exit 0
EOF
chmod +x "$BIN/curl"

export PATH="$BIN:$PATH"
export HOME="$TMP_DIR/home"
export EXPECTED_STAGING_ROOT="$HOME/.local/share/tempo-staging/docker"
export FAKE_DOCKER_LOG="$TMP_DIR/docker.log"
export TEMPO_PRODUCTION_POSTGRES_CONTAINER=prodpg
export TEMPO_STAGING_REFRESH_COMPOSE_FILE="$TMP_DIR/compose.yml"
export TEMPO_STAGING_REFRESH_ENV_FILE="$TMP_DIR/staging.env"
export TEMPO_STAGING_REFRESH_STATE_DIR="$TMP_DIR/state"
export TEMPO_STAGING_REFRESH_DOCKER_HOST="unix://$SOCKET"
export TEMPO_STAGING_REFRESH_WEB_URL=http://127.0.0.1:8119/tempo/
export TEMPO_STAGING_REFRESH_TEST_MODE=1
export FAKE_PARTIAL_STOP_MARKER="$TMP_DIR/partial-stop.marker"

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
if TEMPO_STAGING_REFRESH_TEST_MODE=0 TEMPO_PRODUCTION_POSTGRES_CONTAINER=other bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: production Postgres container override was accepted\n' >&2
    exit 1
fi
if FAKE_BAD_POLICY=1 bash "$SCRIPT" validate >/dev/null 2>&1; then
    printf 'FAIL: unsafe rendered staging policy was accepted\n' >&2
    exit 1
fi

bash "$SCRIPT" refresh --confirm-production-backup-refresh

if find "$TMP_DIR/state" -type f -name '*.dump' -print -quit | grep -q .; then
    printf 'FAIL: temporary production dump remains\n' >&2
    exit 1
fi
grep -F 'exec prodpg' "$FAKE_DOCKER_LOG" >/dev/null || { printf 'FAIL: production pg_dump was not invoked\n' >&2; exit 1; }
grep -F 'pg_dump --format=custom' "$FAKE_DOCKER_LOG" >/dev/null || { printf 'FAIL: dump was not custom format\n' >&2; exit 1; }
grep -F 'pg_restore' "$FAKE_DOCKER_LOG" >/dev/null || { printf 'FAIL: staging pg_restore was not invoked\n' >&2; exit 1; }
grep -F 'redisid' "$FAKE_DOCKER_LOG" | grep -F 'FLUSHALL' >/dev/null || { printf 'FAIL: staging Redis was not flushed\n' >&2; exit 1; }
if grep -E 'prod(redis|_redis|Redis)' "$FAKE_DOCKER_LOG" >/dev/null; then
    printf 'FAIL: production Redis was touched\n' >&2
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
