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

printf '%s\n' 'tempo staging deployment contract: PASS'
