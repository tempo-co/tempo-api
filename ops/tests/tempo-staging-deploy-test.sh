#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
staging_env=$(mktemp)
config_json=$(mktemp)
trap 'rm -f "$staging_env" "$config_json"' EXIT

cat >"$staging_env" <<'EOF'
TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
TEMPO_WEB_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
STAGING_PUBLIC_URL=https://staging.example.test/staging
PRODUCTION_PUBLIC_URL=https://production.example.test/tempo
STAGING_WEB_HOST_PORT=18119
STAGING_DB_USERNAME=tempo_staging
STAGING_DB_PASSWORD=synthetic-staging-password
STAGING_DB_NAME=tempo_staging
DB_USERNAME=tempo_staging
DB_PASSWORD=synthetic-staging-password
DB_NAME=tempo_staging
SESSION_SECRET=synthetic-session-secret
SESSION_EXPIRATION=30d
SESSION_REDIS_KEY=tempo-staging-session
BANKING_SESSION_ENCRYPTION_KEY_B64=c3ludGhldGljLWJhbmtpbmcta2V5
EMAIL_VERIFICATION_EXPIRATION=1d
EMAIL_VERIFICATION_REDIS_KEY=tempo-staging-email-verification
PASSWORD_RESET_EXPIRATION=1h
PASSWORD_RESET_REDIS_KEY=tempo-staging-password-reset
THROTTLE_TTL=1m
THROTTLE_LIMIT=100
EOF
chmod 600 "$staging_env"

TEMPO_STAGING_ENV_FILE="$staging_env" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate

TEMPO_STAGING_ENV_FILE="$staging_env" docker compose -p tempo-staging-test -f "$repo_root/ops/staging/docker-compose.yml" --env-file "$staging_env" config --format json >"$config_json"

python3 - "$config_json" <<'PY'
import json
import sys
from pathlib import Path

with open(sys.argv[1], encoding='utf-8') as handle:
    config = json.load(handle)

services = config['services']
assert set(services) == {'postgres', 'redis', 'mailpit', 'api', 'web'}
assert services['postgres']['image'].startswith('postgres@sha256:')
assert services['redis']['image'].startswith('redis@sha256:')
assert services['mailpit']['image'].startswith('axllent/mailpit@sha256:')
assert services['api']['image'].startswith('ghcr.io/tempo-co/tempo-api@sha256:')
assert services['web']['image'].startswith('ghcr.io/tempo-co/tempo-web@sha256:')
assert services['api']['environment']['BANKING_INTEGRATION_ENABLED'] in (False, 'false')
assert services['api']['environment']['AI_CATEGORIZATION_ENABLED'] in (False, 'false')
assert services['api']['environment']['AI_CATEGORIZATION_WEB_SEARCH_ENABLED'] in (False, 'false')
assert services['api']['environment']['REDIS_URL'] == 'redis://redis:6379'
assert services['api']['environment']['EMAIL_SECURE'] in (False, 'false')
assert services['api']['environment']['DB_SYNCHRONIZE'] in (False, 'false')
assert services['api']['environment']['SESSION_COOKIE_NAME'] == 'tempo_staging_session'
assert services['api']['environment']['SESSION_COOKIE_PATH'] == '/staging'
assert 'env_file' not in services['api']
assert 'OPENAI_API_KEY' not in services['api']['environment']

for service_name in ('postgres', 'redis', 'mailpit', 'api'):
    assert not services[service_name].get('ports'), service_name

web_ports = services['web']['ports']
assert len(web_ports) == 1
assert web_ports[0]['host_ip'] == '127.0.0.1'
assert web_ports[0]['target'] == 8080

for service_name, service in services.items():
    for volume in service.get('volumes', []):
        text = json.dumps(volume).lower()
        assert 'tempo_production' not in text
        assert '/var/lib/docker' not in text
        assert 'enable-banking.private' not in text

assert config['volumes']['tempo_staging_postgres_data']['name'] == 'tempo-staging-postgres-data'
assert config['networks']['backend']['internal'] is True
assert 'nginx -s reload' in Path('ops/staging/tempo-staging-deploy.sh').read_text(encoding='utf-8')
assert 'require_existing_healthy api' in Path('ops/staging/tempo-staging-deploy.sh').read_text(encoding='utf-8')
assert "fail \"$service component must be deployed before web\"" in Path('ops/staging/tempo-staging-deploy.sh').read_text(encoding='utf-8')
PY

if TEMPO_STAGING_ENV_FILE="$staging_env" TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api:latest bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'mutable API image unexpectedly accepted' >&2
    exit 1
fi

if TEMPO_STAGING_ENV_FILE="$staging_env" TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:bad bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'malformed API digest unexpectedly accepted' >&2
    exit 1
fi

if TEMPO_STAGING_ENV_FILE="$staging_env" TEMPO_STAGING_DOCKER_HOST=unix:///var/run/docker.sock bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'rootful Docker socket unexpectedly accepted' >&2
    exit 1
fi

bad_env=$(mktemp)
duplicate_env=$(mktemp)
export_duplicate_env=$(mktemp)
same_origin_env=$(mktemp)
trap 'rm -f "$staging_env" "$config_json" "$bad_env" "$duplicate_env" "$export_duplicate_env" "$same_origin_env"' EXIT
python3 - "$staging_env" "$bad_env" <<'PY'
import sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
target.write_text(source.read_text().replace('ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'ghcr.io/untrusted/project@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
PY
chmod 600 "$bad_env"
if TEMPO_STAGING_ENV_FILE="$bad_env" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'untrusted API image unexpectedly accepted' >&2
    exit 1
fi

python3 - "$staging_env" "$same_origin_env" <<'PY'
import sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
target.write_text(source.read_text().replace('https://production.example.test/tempo', 'https://staging.example.test/tempo'))
PY
chmod 600 "$same_origin_env"
if TEMPO_STAGING_ENV_FILE="$same_origin_env" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'shared staging/production hostname unexpectedly accepted' >&2
    exit 1
fi

cp "$staging_env" "$duplicate_env"
printf '%s\n' 'STAGING_DB_NAME=other_staging' >> "$duplicate_env"
if TEMPO_STAGING_ENV_FILE="$duplicate_env" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'duplicate staging environment key unexpectedly accepted' >&2
    exit 1
fi

cp "$staging_env" "$export_duplicate_env"
printf '%s\n' 'export STAGING_DB_NAME=other_staging' >> "$export_duplicate_env"
if TEMPO_STAGING_ENV_FILE="$export_duplicate_env" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'export staging environment key unexpectedly accepted' >&2
    exit 1
fi

chmod 644 "$staging_env"
if TEMPO_STAGING_ENV_FILE="$staging_env" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'world-readable staging environment unexpectedly accepted' >&2
    exit 1
fi
chmod 1600 "$staging_env"
if TEMPO_STAGING_ENV_FILE="$staging_env" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" validate; then
    echo 'special-bit staging environment unexpectedly accepted' >&2
    exit 1
fi
chmod 600 "$staging_env"

(
    set -euo pipefail
    deploy_tmp=$(mktemp -d)
    cleanup() {
        kill "${socket_pid:-}" 2>/dev/null || true
        rm -rf "$deploy_tmp"
    }
    trap cleanup EXIT
    mkdir -p "$deploy_tmp/bin" "$deploy_tmp/runtime/tempo-staging" "$deploy_tmp/state"
    python3 - "$deploy_tmp/runtime/tempo-staging/docker.sock" <<'PY' &
import socket
import sys
import time
server = socket.socket(socket.AF_UNIX)
server.bind(sys.argv[1])
server.listen(1)
time.sleep(120)
PY
    socket_pid=$!
    for _ in $(seq 1 20); do
        [[ -S "$deploy_tmp/runtime/tempo-staging/docker.sock" ]] && break
        sleep 0.1
    done
    real_docker=$(command -v docker)
    cat >"$deploy_tmp/bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$1" == compose && "$*" == *' config --format json' ]]; then
    exec "$REAL_DOCKER" "$@"
fi
if [[ "$1" == info && "$2" == --format ]]; then
    case "$3" in
        '{{json .SecurityOptions}}') printf '["name=rootless"]\n' ;;
        '{{.DockerRootDir}}') printf '%s\n' "$HOME/.local/share/tempo-staging/docker" ;;
        *) exit 1 ;;
    esac
    exit 0
fi
if [[ "$1" == inspect ]]; then
    printf 'healthy\n'
    exit 0
fi
if [[ "$1" == compose ]]; then
    case "$*" in
        *' ps -q api')
            [[ "${FAKE_API_PRESENT:-1}" == 1 ]] && printf 'api-container\n'
            ;;
        *' ps -q web') printf 'web-container\n' ;;
        *' pull web'|*' up -d --no-deps web') ;;
        *) exit 1 ;;
    esac
    exit 0
fi
exit 1
SH
    chmod 700 "$deploy_tmp/bin/docker"
    if TEMPO_STAGING_ENV_FILE="$staging_env" TEMPO_STAGING_STATE_DIR="$deploy_tmp/state" XDG_RUNTIME_DIR="$deploy_tmp/runtime" REAL_DOCKER="$real_docker" FAKE_DOCKER_LOG="$deploy_tmp/docker.log" FAKE_API_PRESENT=0 PATH="$deploy_tmp/bin:$PATH" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" deploy web >"$deploy_tmp/missing-api.out" 2>&1; then
        echo 'web deployment unexpectedly accepted without a healthy API' >&2
        exit 1
    fi
    grep -Fq 'api component must be deployed before web' "$deploy_tmp/missing-api.out"
    TEMPO_STAGING_ENV_FILE="$staging_env" TEMPO_STAGING_STATE_DIR="$deploy_tmp/state" XDG_RUNTIME_DIR="$deploy_tmp/runtime" REAL_DOCKER="$real_docker" FAKE_DOCKER_LOG="$deploy_tmp/docker.log" FAKE_API_PRESENT=1 PATH="$deploy_tmp/bin:$PATH" bash "$repo_root/ops/staging/tempo-staging-deploy.sh" deploy web
    python3 - "$deploy_tmp/docker.log" <<'PY'
import sys
lines = open(sys.argv[1], encoding='utf-8').read().splitlines()
api_probe = next(i for i, line in enumerate(lines) if ' ps -q api' in line)
pull = next(i for i, line in enumerate(lines) if ' pull web' in line)
replace = next(i for i, line in enumerate(lines) if ' up -d --no-deps web' in line)
assert api_probe < pull < replace
print('tempo staging web promotion ordering: PASS')
PY
)

printf '%s\n' 'tempo staging deployment contract: PASS'
