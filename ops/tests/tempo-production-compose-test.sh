#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
RENDERED=$(mktemp)
ENV_FILE=$(mktemp)
trap 'rm -f "$RENDERED" "$ENV_FILE"' EXIT

cat > "$ENV_FILE" <<'EOF'
EMAIL_USERNAME=mailer@example.test
EMAIL_PASSWORD=synthetic-test-only-password
EMAIL_FROM="Tempo <mailer@example.test>"
EOF

env \
    DB_USERNAME=tempo-test \
    DB_PASSWORD=synthetic-db-password \
    DB_NAME=tempo_test \
    TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api:synthetic \
    TEMPO_WEB_IMAGE=ghcr.io/tempo-co/tempo-web:synthetic \
    TEMPO_PRODUCTION_ENV_FILE="$ENV_FILE" \
    ENABLE_BANKING_PRIVATE_KEY_HOST_PATH=/tmp/tempo-test-private-key \
    docker compose --project-name tempo-api-production \
        --file "$REPO_ROOT/docker-compose.production.yml" config --format json > "$RENDERED"

python3 - "$RENDERED" <<'PY'
import json
import sys
from pathlib import Path

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
services = config.get('services', {})
expected_services = {'postgres', 'redis', 'api', 'web'}
if set(services) != expected_services:
    raise SystemExit('production Compose must contain only postgres, redis, api, and web')

api = services['api']
api_environment = api.get('environment', {})
expected_email = {
    'EMAIL_HOST': 'smtp.gmail.com',
    'EMAIL_PORT': '587',
    'EMAIL_SECURE': 'false',
    'EMAIL_REQUIRE_TLS': 'true',
    'EMAIL_USERNAME': 'mailer@example.test',
    'EMAIL_PASSWORD': 'synthetic-test-only-password',
    'EMAIL_FROM': 'Tempo <mailer@example.test>',
}
for key, expected in expected_email.items():
    if str(api_environment.get(key)) != expected:
        raise SystemExit(f'production API email configuration is incorrect: {key}')
if 'mailpit' in api.get('depends_on', {}):
    raise SystemExit('production API must not depend on Mailpit')


def network_names(service_name):
    attached = services[service_name].get('networks', {})
    return set(attached) if isinstance(attached, dict) else set(attached)


expected_service_networks = {
    'postgres': {'default'},
    'redis': {'default'},
    'api': {'default', 'frontend'},
    'web': {'frontend', 'ingress'},
}
for service_name, expected in expected_service_networks.items():
    if network_names(service_name) != expected:
        raise SystemExit(f'{service_name} must attach to networks {sorted(expected)}')

networks = config.get('networks', {})
if not networks.get('frontend', {}).get('internal'):
    raise SystemExit('production frontend network must be internal')
if networks.get('default', {}).get('internal'):
    raise SystemExit('production default network must remain non-internal for API egress')
if networks.get('ingress', {}).get('internal'):
    raise SystemExit('production web ingress network must remain non-internal')

for service_name in ('postgres', 'redis', 'api'):
    if services[service_name].get('ports'):
        raise SystemExit(f'{service_name} must not publish host ports')
web_ports = services['web'].get('ports', [])
expected_web_port = {
    'mode': 'ingress',
    'host_ip': '127.0.0.1',
    'target': 8080,
    'published': '8080',
    'protocol': 'tcp',
}
if web_ports != [expected_web_port]:
    raise SystemExit('production web must publish only loopback:8080 to container port 8080/tcp')

print('tempo production Compose email, Mailpit, and network isolation contracts: PASS')
PY
