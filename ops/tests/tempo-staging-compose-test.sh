#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_FILE=$SCRIPT_DIR/../staging/docker-compose.yml
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

[[ -f "$COMPOSE_FILE" ]] || fail 'staging Compose file is missing'
command -v docker >/dev/null 2>&1 || fail 'docker is required for the Compose contract'

env_file=$TMP_DIR/staging.env
rendered=$TMP_DIR/staging.json
cat > "$env_file" <<'EOF'
TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
TEMPO_WEB_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
STAGING_PUBLIC_URL=https://staging.example.invalid/tempo
STAGING_WEB_HOST_PORT=8119
STAGING_DB_USERNAME=tempo_staging
STAGING_DB_PASSWORD=synthetic-staging-password
STAGING_DB_NAME=tempo_staging
SESSION_SECRET=synthetic-session-secret
BANKING_SESSION_ENCRYPTION_KEY_B64=c3ludGhldGljLWtleQ==
EOF

docker compose --project-name tempo-staging --file "$COMPOSE_FILE" --env-file "$env_file" config --format json > "$rendered"
python3 - "$rendered" <<'PY'
import json
import sys

with open(sys.argv[1], encoding='utf-8') as handle:
    config = json.load(handle)

services = config.get('services', {})
if set(services) != {'postgres', 'redis', 'mailpit', 'api', 'web'}:
    raise SystemExit('unexpected staging service set')

if services['api'].get('image') != 'ghcr.io/tempo-co/tempo-api@sha256:' + 'a' * 64:
    raise SystemExit('API image is not the immutable fixture digest')
if services['web'].get('image') != 'ghcr.io/tempo-co/tempo-web@sha256:' + 'b' * 64:
    raise SystemExit('web image is not the immutable fixture digest')

for service_name in ('postgres', 'redis', 'mailpit', 'api'):
    if services[service_name].get('ports'):
        raise SystemExit(f'{service_name} must not publish a host port')

web_ports = services['web'].get('ports', [])
if len(web_ports) != 1 or web_ports[0] != {
    'mode': 'ingress',
    'host_ip': '127.0.0.1',
    'target': 8080,
    'published': '8119',
    'protocol': 'tcp',
}:
    raise SystemExit('web must publish only loopback:8119 to container port 8080')

api_environment = services['api'].get('environment', {})
expected_false = {
    'AI_CATEGORIZATION_ENABLED',
    'AI_CATEGORIZATION_WEB_SEARCH_ENABLED',
    'BANKING_INTEGRATION_ENABLED',
}
for key in expected_false:
    if str(api_environment.get(key)).lower() != 'false':
        raise SystemExit(f'{key} must be explicitly disabled in staging')
if 'OPENAI_API_KEY' in api_environment:
    raise SystemExit('OPENAI_API_KEY must not enter the staging API')
for key in ('ENABLE_BANKING_PRIVATE_KEY_B64', 'ENABLE_BANKING_PRIVATE_KEY_PATH'):
    if key in api_environment:
        raise SystemExit(f'{key} must not enter the staging API')
if 'SESSION_COOKIE_NAME' in api_environment or 'SESSION_COOKIE_PATH' in api_environment:
    raise SystemExit('staging must use the normal cookie contract on its separate hostname')

if api_environment.get('WEB_BASE_URL') != 'https://staging.example.invalid/tempo':
    raise SystemExit('staging API WEB_BASE_URL must use the distinct /tempo hostname contract')
if api_environment.get('EMAIL_UI_URL') != 'https://staging.example.invalid/tempo/mailpit/':
    raise SystemExit('staging Mailpit URL must use the /tempo contract')

web_healthcheck = json.dumps(services['web'].get('healthcheck', {}))
if '/tempo/' not in web_healthcheck or '/staging/' in web_healthcheck:
    raise SystemExit('staging web healthcheck must use /tempo, not /staging')
mailpit = json.dumps(services['mailpit'])
if '/tempo/mailpit/' not in mailpit or '/staging/' in mailpit:
    raise SystemExit('staging Mailpit must use /tempo/mailpit')

networks = config.get('networks', {})
if not networks.get('backend', {}).get('internal') or not networks.get('edge', {}).get('internal'):
    raise SystemExit('staging backend and edge networks must be internal')
if config.get('volumes', {}).get('tempo_staging_postgres_data', {}).get('name') != 'tempo-staging-postgres-data':
    raise SystemExit('staging database volume name is not isolated')

serialized = json.dumps(config).lower()
for forbidden in ('production.compose', '/var/lib/docker', 'tempo_production', 'enable-banking.private'):
    if forbidden in serialized:
        raise SystemExit(f'production boundary appears in staging Compose config: {forbidden}')
PY

printf 'PASS: tempo staging Compose isolation and disabled-provider contract\n'
