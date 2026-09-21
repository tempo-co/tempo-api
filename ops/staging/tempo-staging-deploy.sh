#!/usr/bin/env bash
set -euo pipefail

readonly project_name='tempo-staging'
readonly script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly compose_file="$script_dir/docker-compose.yml"
readonly env_file="${TEMPO_STAGING_ENV_FILE:-$HOME/.config/tempo-staging/staging.env}"
readonly runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
readonly expected_docker_host="unix://$runtime_dir/tempo-staging/docker.sock"
readonly docker_host="${TEMPO_STAGING_DOCKER_HOST:-$expected_docker_host}"
readonly state_dir="${TEMPO_STAGING_STATE_DIR:-$HOME/.local/state/tempo-staging}"

fail() {
  printf 'tempo staging: %s\n' "$1" >&2
  exit 1
}

[[ -f "$compose_file" ]] || fail "missing Compose file: $compose_file"
[[ -f "$env_file" ]] || fail "missing environment file: $env_file"
[[ "$docker_host" == "$expected_docker_host" ]] || fail "staging Docker host must be $expected_docker_host"
[[ ! -L "$env_file" ]] || fail 'staging environment file must not be a symlink'

mode=$(stat -c '%a' "$env_file")
mode_value=$((8#$mode))
(( mode_value == 0600 )) || fail 'staging environment file must have mode 600'

validate_unique_env_keys() {
  python3 - "$env_file" <<'PY'
import sys

path = sys.argv[1]
seen = {}
with open(path, encoding='utf-8') as handle:
    for line_number, raw_line in enumerate(handle, 1):
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        if line.split(None, 1)[0] == 'export':
            raise SystemExit(f'export syntax is not supported in staging environment files (line {line_number})')
        key, separator, _ = line.partition('=')
        if not separator:
            continue
        key = key.strip()
        if key in seen:
            raise SystemExit(f'duplicate staging environment key: {key} (lines {seen[key]} and {line_number})')
        seen[key] = line_number
PY
}

validate_unique_env_keys || fail 'staging environment file contains duplicate keys'

read_env_value() {
  python3 - "$env_file" "$1" <<'PY'
import sys

path, wanted = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    for raw_line in handle:
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if separator and key.strip() == wanted:
            print(value.strip().strip('"').strip("'"))
            break
    else:
        raise SystemExit(1)
PY
}

for forbidden in \
  ENABLE_BANKING_PRIVATE_KEY_B64 \
  ENABLE_BANKING_PRIVATE_KEY_PATH \
  TEMPO_PRODUCTION_ENV_FILE \
  TEMPO_PRODUCTION_COMPOSE_FILE \
  OPENAI_API_KEY; do
  if python3 - "$env_file" "$forbidden" <<'PY'
import sys

path, forbidden = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    for raw_line in handle:
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        key = line.split('=', 1)[0].strip()
        if key == forbidden:
            raise SystemExit(0)
raise SystemExit(1)
PY
  then
    fail "forbidden production/provider key is present: $forbidden"
  fi
done

for ambient in TEMPO_API_IMAGE TEMPO_WEB_IMAGE STAGING_PUBLIC_URL STAGING_WEB_HOST_PORT STAGING_DB_USERNAME STAGING_DB_PASSWORD STAGING_DB_NAME; do
  [[ -v "$ambient" ]] && fail "$ambient must be supplied only by the staging environment file"
done

staging_db_name=$(read_env_value STAGING_DB_NAME) || fail 'STAGING_DB_NAME is missing'
[[ "$staging_db_name" =~ ^[a-z_][a-z0-9_]{0,38}$ ]] || fail 'STAGING_DB_NAME is not a safe PostgreSQL identifier'
[[ "$staging_db_name" != postgres && "$staging_db_name" != template0 && "$staging_db_name" != template1 ]] || fail 'STAGING_DB_NAME is reserved by PostgreSQL'

api_image=$(read_env_value TEMPO_API_IMAGE) || fail 'TEMPO_API_IMAGE is missing'
web_image=$(read_env_value TEMPO_WEB_IMAGE) || fail 'TEMPO_WEB_IMAGE is missing'
public_url=$(read_env_value STAGING_PUBLIC_URL) || fail 'STAGING_PUBLIC_URL is missing'
web_port=$(read_env_value STAGING_WEB_HOST_PORT) || fail 'STAGING_WEB_HOST_PORT is missing'

api_image_prefix='ghcr.io/tempo-co/tempo-api@sha256:'
web_image_prefix='ghcr.io/tempo-co/tempo-web@sha256:'
[[ "$api_image" == "$api_image_prefix"* ]] || fail 'TEMPO_API_IMAGE must use the official API image repository'
[[ "$web_image" == "$web_image_prefix"* ]] || fail 'TEMPO_WEB_IMAGE must use the official web image repository'
api_digest="${api_image#"$api_image_prefix"}"
web_digest="${web_image#"$web_image_prefix"}"
[[ "$api_digest" =~ ^[0-9a-f]{64}$ ]] || fail 'TEMPO_API_IMAGE must be an immutable digest reference'
[[ "$web_digest" =~ ^[0-9a-f]{64}$ ]] || fail 'TEMPO_WEB_IMAGE must be an immutable digest reference'
[[ "$api_image" != *production* && "$web_image" != *production* ]] || fail 'production image references are not allowed'
[[ "$public_url" =~ ^https://[^/]+/staging/?$ ]] || fail 'STAGING_PUBLIC_URL must be the tailnet HTTPS /staging URL'
[[ "$web_port" =~ ^[0-9]+$ ]] || fail 'STAGING_WEB_HOST_PORT must be numeric'
(( web_port >= 1024 && web_port <= 65535 )) || fail 'STAGING_WEB_HOST_PORT is outside the unprivileged port range'

docker_cli() {
  env -u DOCKER_CONTEXT DOCKER_HOST="$docker_host" docker "$@"
}

compose() {
  env -u TEMPO_API_IMAGE \
    -u TEMPO_WEB_IMAGE \
    -u STAGING_PUBLIC_URL \
    -u STAGING_WEB_HOST_PORT \
    -u STAGING_DB_USERNAME \
    -u STAGING_DB_PASSWORD \
    -u STAGING_DB_NAME \
    -u SESSION_SECRET \
    -u BANKING_SESSION_ENCRYPTION_KEY_B64 \
    -u DOCKER_CONTEXT \
    TEMPO_STAGING_ENV_FILE="$env_file" \
    DOCKER_HOST="$docker_host" \
    docker compose \
      --project-name "$project_name" \
      --file "$compose_file" \
      --env-file "$env_file" \
      "$@"
}

acquire_mutation_lock() {
  [[ "${TEMPO_STAGING_LOCK_HELD:-0}" == 1 ]] && return 0
  [[ ! -L "$state_dir" ]] || fail 'staging state directory must not be a symlink'
  mkdir -p "$state_dir"
  chmod 700 "$state_dir"
  exec 9>"$state_dir/deploy.lock"
  chmod 600 "$state_dir/deploy.lock"
  flock -x 9
}

validate_compose() {
  local rendered
  rendered=$(mktemp)
  trap 'rm -f "$rendered"' RETURN

  compose config --format json >"$rendered" || fail 'Compose configuration is invalid'

  local status
  if python3 - "$rendered" "$api_image" "$web_image" <<'PY'
import json
import re
import sys

path, api_image, web_image = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    config = json.load(handle)

services = config.get('services', {})
if set(services) != {'postgres', 'redis', 'mailpit', 'api', 'web'}:
    raise SystemExit('unexpected staging service set')

for service_name, expected in {
    'api': api_image,
    'web': web_image,
}.items():
    if services[service_name].get('image') != expected:
        raise SystemExit(f'{service_name} image does not match the env file')
    expected_prefix = f'ghcr.io/tempo-co/tempo-{"api" if service_name == "api" else "web"}@sha256:'
    if not services[service_name]['image'].startswith(expected_prefix):
        raise SystemExit(f'{service_name} image is not from the official repository')
    if not re.fullmatch(r'ghcr.io/tempo-co/tempo-(?:api|web)@sha256:[0-9a-f]{64}', services[service_name]['image']):
        raise SystemExit(f'{service_name} image is not an immutable official digest')

for service_name in ('postgres', 'redis', 'mailpit', 'api'):
    if services[service_name].get('ports'):
        raise SystemExit(f'{service_name} must not publish a host port')

web_ports = json.dumps(services['web'].get('ports', []))
if '127.0.0.1' not in web_ports or '8080' not in web_ports:
    raise SystemExit('web must publish only loopback:8080')

api_environment = services['api'].get('environment', {})
if str(api_environment.get('BANKING_INTEGRATION_ENABLED')).lower() != 'false':
    raise SystemExit('banking integration is not disabled')
if str(api_environment.get('AI_CATEGORIZATION_ENABLED')).lower() != 'false':
    raise SystemExit('AI categorization is not disabled')
if str(api_environment.get('AI_CATEGORIZATION_WEB_SEARCH_ENABLED')).lower() != 'false':
    raise SystemExit('AI web search is not disabled')
if api_environment.get('REDIS_URL') != 'redis://redis:6379':
    raise SystemExit('API does not use the staging Redis service')
for key in ('ENABLE_BANKING_PRIVATE_KEY_B64', 'ENABLE_BANKING_PRIVATE_KEY_PATH'):
    if key in api_environment:
        raise SystemExit(f'{key} must not enter the staging API')

if not config.get('networks', {}).get('backend', {}).get('internal'):
    raise SystemExit('staging backend network must be internal')
if not config.get('networks', {}).get('edge', {}).get('internal'):
    raise SystemExit('staging edge network must be internal')
if config.get('volumes', {}).get('tempo_staging_postgres_data', {}).get('name') != 'tempo-staging-postgres-data':
    raise SystemExit('unexpected staging database volume name')

serialized = json.dumps(config).lower()
for forbidden in ('production.compose', '/var/lib/docker', 'tempo_production', 'enable-banking.private'):
    if forbidden in serialized:
        raise SystemExit(f'forbidden production boundary appears in Compose config: {forbidden}')
PY
  then
    status=0
  else
    status=$?
  fi
  rm -f "$rendered"
  trap - RETURN
  return "$status"
}

validate() {
  validate_compose
}

require_daemon() {
  local socket_path="${docker_host#unix://}"
  local security_options docker_root
  [[ -S "$socket_path" ]] || fail "staging Docker socket is missing: $socket_path"
  security_options=$(docker_cli info --format '{{json .SecurityOptions}}' 2>/dev/null) || fail 'staging Docker daemon is not reachable'
  docker_root=$(docker_cli info --format '{{.DockerRootDir}}' 2>/dev/null) || fail 'staging Docker root cannot be inspected'
  [[ "$security_options" == *rootless* ]] || fail 'staging Docker daemon is not rootless'
  [[ "$docker_root" == "$HOME/.local/share/tempo-staging/docker" ]] || fail 'staging Docker root is outside the staging data root'
}

wait_for_healthy() {
  local service="$1"
  local container status
  for _ in $(seq 1 60); do
    container=$(compose ps -q "$service" 2>/dev/null || true)
    if [[ -n "$container" ]]; then
      status=$(docker_cli inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)
      case "$status" in
        healthy) return 0 ;;
        exited|dead) fail "$service container is $status" ;;
      esac
    fi
    sleep 2
done
fail "$service did not become healthy"
}

require_existing_healthy() {
  local service="$1"
  local container
  container=$(compose ps -q "$service" 2>/dev/null || true)
  [[ -n "$container" ]] || fail "$service component must be deployed before web"
  wait_for_healthy "$service"
}

up() {
  acquire_mutation_lock
  validate_compose
  require_daemon
  compose up -d --remove-orphans postgres redis mailpit api web
  wait_for_healthy postgres
  wait_for_healthy redis
  wait_for_healthy mailpit
  wait_for_healthy api
  wait_for_healthy web
}

reload_web_proxy() {
  local web_container
  web_container=$(compose ps -q web 2>/dev/null || true)
  [[ -n "$web_container" ]] || return 0
  compose exec -T web nginx -s reload
}

deploy_component() {
  local service="$1"
  [[ "$service" == api || "$service" == web ]] || fail 'component must be api or web'
  acquire_mutation_lock
  validate_compose
  require_daemon
  if [[ "$service" == web ]]; then
    require_existing_healthy api
  fi
  compose pull "$service"
  compose up -d --no-deps "$service"
  wait_for_healthy "$service"
  if [[ "$service" == api ]]; then
    reload_web_proxy
  else
    wait_for_healthy api
  fi
}

case "${1:-validate}" in
  validate) validate ;;
  up) up ;;
  deploy) [[ $# == 2 ]] || fail 'usage: deploy api|web'; deploy_component "$2" ;;
  status) validate_compose; require_daemon; compose ps ;;
  down)
    acquire_mutation_lock
    validate_compose
    require_daemon
    compose down --remove-orphans
    ;;
  *) fail 'usage: validate|up|deploy api|deploy web|status|down' ;;
esac
