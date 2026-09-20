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
trap 'rm -f "$staging_env" "$config_json" "$bad_env"' EXIT
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

printf '%s\n' 'tempo staging deployment contract: PASS'
