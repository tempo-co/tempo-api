#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly PROJECT_NAME='tempo-staging'
if [[ -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
    readonly DEFAULT_COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
else
    readonly DEFAULT_COMPOSE_FILE="$SCRIPT_DIR/staging.compose.yml"
fi
readonly DEFAULT_ENV_FILE="$SCRIPT_DIR/staging.env"
readonly DEFAULT_STATE_DIR="${HOME}/.local/state/tempo-staging"
readonly DEFAULT_DOCKER_SOCKET="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/tempo-staging/docker.sock"
readonly DEFAULT_DOCKER_CONFIG="$HOME/.config/tempo-staging/docker-config"
readonly DEFAULT_BACKUP_DIR="$HOME/backups/tempo"
readonly STAGING_POSTGRES_VOLUME='tempo-staging-postgres-data'
readonly REFRESH_DATABASE='tempo_staging_refresh'
readonly PREVIOUS_DATABASE='tempo_staging_previous'
readonly FAILED_DATABASE='tempo_staging_failed'

COMPOSE_FILE=${TEMPO_STAGING_REFRESH_COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}
ENV_FILE=${TEMPO_STAGING_REFRESH_ENV_FILE:-$DEFAULT_ENV_FILE}
STATE_DIR=${TEMPO_STAGING_REFRESH_STATE_DIR:-$DEFAULT_STATE_DIR}
BACKUP_DIR=${TEMPO_STAGING_REFRESH_BACKUP_DIR:-$DEFAULT_BACKUP_DIR}
DOCKER_HOST_VALUE=${TEMPO_STAGING_REFRESH_DOCKER_HOST:-unix://$DEFAULT_DOCKER_SOCKET}
DOCKER_CONFIG_VALUE=${TEMPO_STAGING_REFRESH_DOCKER_CONFIG:-$DEFAULT_DOCKER_CONFIG}
readonly STAGING_WEB_URL='http://127.0.0.1:8119/tempo/'
readonly STAGING_API_HEALTH_URL='http://127.0.0.1:8119/tempo/api/health'
PRODUCTION_ORIGIN_HOST_FILE="$HOME/.config/tempo-staging/production-origin-host"

STAGING_DB_USERNAME=''
STAGING_DB_PASSWORD=''
STAGING_DB_NAME=''
DUMP_FILE=''
DUMP_CONTAINER_PATH=''
STAGING_PGPASS_FILE=''
readonly STAGING_PGPASS_CONTAINER_PATH='/tmp/tempo-staging-refresh.pgpass'
STAGING_PGPASS_INSTALLED=0
SWAP_STARTED=0
ORIGINAL_DATABASE_MOVED=0
REFRESH_DATABASE_RENAMED=0
REFRESH_SUCCEEDED=0

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    return 1
}

usage() {
    cat >&2 <<'EOF'
usage:
  tempo-staging-refresh.sh validate
  tempo-staging-refresh.sh seed --confirm-seeded-reset
  tempo-staging-refresh.sh refresh --confirm-production-backup-refresh

The refresh operation is host-local and PostgreSQL-only. It never copies
production Redis and never deploys images.
EOF
    return 2
}

command_required() {
    command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
}

read_env_value() {
    local key=$1
    python3 - "$ENV_FILE" "$key" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
for raw in path.read_text(encoding='utf-8').splitlines():
    line = raw.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    name, value = line.split('=', 1)
    if name.strip() != key:
        continue
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        value = value[1:-1]
    print(value)
    break
PY
}

validate_env_file() {
    python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
seen = set()
for number, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), start=1):
    line = raw.strip()
    if not line or line.startswith('#'):
        continue
    if '=' not in line:
        raise SystemExit(f'invalid staging env entry on line {number}')
    key = line.split('=', 1)[0].strip()
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key):
        raise SystemExit(f'invalid staging env key on line {number}')
    if key in seen:
        raise SystemExit(f'duplicate staging env key: {key}')
    seen.add(key)
PY
}

validate_identifier() {
    local value=$1 label=$2
    [[ $value =~ ^[A-Za-z0-9_]+$ ]] || fail "$label must contain only letters, numbers, and underscores"
}

load_staging_database_config() {
    [[ -f $ENV_FILE ]] || fail "staging env file is missing: $ENV_FILE"
    validate_env_file
    STAGING_DB_USERNAME=$(read_env_value STAGING_DB_USERNAME)
    STAGING_DB_PASSWORD=$(read_env_value STAGING_DB_PASSWORD)
    STAGING_DB_NAME=$(read_env_value STAGING_DB_NAME)
    [[ -n $STAGING_DB_USERNAME && -n $STAGING_DB_PASSWORD && -n $STAGING_DB_NAME ]] || \
        fail 'staging database values are incomplete'
    validate_identifier "$STAGING_DB_USERNAME" STAGING_DB_USERNAME
    validate_identifier "$STAGING_DB_NAME" STAGING_DB_NAME
    if [[ $STAGING_DB_NAME == "$REFRESH_DATABASE" || $STAGING_DB_NAME == "$PREVIOUS_DATABASE" || $STAGING_DB_NAME == "$FAILED_DATABASE" ||
          $STAGING_DB_NAME == postgres || $STAGING_DB_NAME == template0 || $STAGING_DB_NAME == template1 ]]; then
        fail 'staging database name conflicts with a reserved maintenance, refresh, or rollback database'
        return 1
    fi
}

validate_staging_origin() {
    python3 - "$ENV_FILE" "$PRODUCTION_ORIGIN_HOST_FILE" <<'PY'
from pathlib import Path
from urllib.parse import urlsplit
import re
import sys

def staging_host(path):
    for raw in Path(path).read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        name, candidate = line.split('=', 1)
        if name.strip() == 'STAGING_PUBLIC_URL':
            try:
                parsed = urlsplit(candidate.strip().strip('"\''))
                hostname = parsed.hostname
                parsed.port
            except ValueError:
                hostname = None
                parsed = None
            if parsed is not None and parsed.scheme == 'https' and hostname and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment:
                return hostname.rstrip('.').lower()
            break
    raise SystemExit('STAGING_PUBLIC_URL must be a credential-free HTTPS origin')

production = Path(sys.argv[2]).read_text(encoding='utf-8').strip().rstrip('.').lower()
if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', production):
    raise SystemExit('production origin host metadata is invalid')
if staging_host(sys.argv[1]) == production:
    raise SystemExit('staging public hostname must be distinct from production')
PY
}

check_paths() {
    [[ -f $COMPOSE_FILE && ! -L $COMPOSE_FILE && -O $COMPOSE_FILE ]] || fail "staging Compose file is missing, symlinked, or not owner-controlled: $COMPOSE_FILE"
    [[ -f $ENV_FILE && ! -L $ENV_FILE && -O $ENV_FILE ]] || fail "staging env file is missing, symlinked, or not owner-controlled: $ENV_FILE"
    [[ $(stat -c '%a' "$ENV_FILE") == 600 ]] || fail 'staging env file must be mode 600'
    [[ $COMPOSE_FILE != /etc/tempo/production.compose.yml ]] || fail 'staging Compose path points at production'
    [[ $ENV_FILE != /etc/tempo/production.env ]] || fail 'staging env path points at production'
    [[ -f $PRODUCTION_ORIGIN_HOST_FILE && ! -L $PRODUCTION_ORIGIN_HOST_FILE && -O $PRODUCTION_ORIGIN_HOST_FILE ]] || fail 'production origin metadata must be owner-controlled'
    [[ $(stat -c '%a' "$PRODUCTION_ORIGIN_HOST_FILE") == 600 ]] || fail 'production origin metadata must be mode 600'
    if [[ ${TEMPO_STAGING_REFRESH_TEST_MODE:-0} != 1 ]]; then
        [[ $COMPOSE_FILE == "$DEFAULT_COMPOSE_FILE" ]] || fail 'staging Compose override is only allowed in test mode'
        [[ $ENV_FILE == "$DEFAULT_ENV_FILE" ]] || fail 'staging env override is only allowed in test mode'
        [[ $BACKUP_DIR == "$DEFAULT_BACKUP_DIR" ]] || fail 'production backup directory override is only allowed in test mode'
    fi
    mkdir -p "$STATE_DIR"
    chmod 700 "$STATE_DIR"
    if [[ ${TEMPO_STAGING_REFRESH_TEST_MODE:-0} != 1 ]]; then
        [[ -O $STATE_DIR && ! -L $STATE_DIR ]] || fail 'staging state directory must be owner-controlled'
    fi
}

assert_staging_policy() {
    local rendered_file status=0
    rendered_file=$(mktemp "$STATE_DIR/compose-config.XXXXXX.json")
    chmod 600 "$rendered_file"
    compose_cli config --format json > "$rendered_file" || status=$?
    if (( status != 0 )); then
        rm -f -- "$rendered_file"
        return "$status"
    fi
    python3 - "$rendered_file" "$STAGING_DB_NAME" <<'PY' || status=$?
import json
import re
import sys
from pathlib import Path

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
expected_database = sys.argv[2]
if config.get('name') != 'tempo-staging':
    raise SystemExit('staging Compose project name is not fixed')
services = config.get('services', {})
required_services = {'postgres', 'redis', 'mailpit', 'api', 'web'}
if set(services) != required_services:
    raise SystemExit('staging Compose services are not the approved set')

api = services['api']
environment = api.get('environment', {})
if isinstance(environment, list):
    environment = dict(item.split('=', 1) for item in environment if '=' in item)

def value(name):
    return str(environment.get(name, '')).lower()

if value('DB_HOST') != 'postgres':
    raise SystemExit('staging API database host must be the isolated Postgres service')
if api.get('extra_hosts') or api.get('links'):
    raise SystemExit('staging API must not override or link the Postgres hostname')
if str(environment.get('DB_NAME', '')) != expected_database:
    raise SystemExit('staging API database name does not match the configured staging database')
if value('AI_CATEGORIZATION_ENABLED') != 'false':
    raise SystemExit('staging AI categorization must be disabled')
if value('AI_CATEGORIZATION_WEB_SEARCH_ENABLED') != 'false':
    raise SystemExit('staging AI web search must be disabled')
if value('BANKING_INTEGRATION_ENABLED') != 'false':
    raise SystemExit('staging banking integration must be disabled')
if value('DB_SYNCHRONIZE') != 'false':
    raise SystemExit('staging schema synchronization must be disabled')
if 'OPENAI_API_KEY' in environment:
    raise SystemExit('staging must not pass OPENAI_API_KEY')

for service_name, repository in (
    ('api', 'ghcr.io/tempo-co/tempo-api'),
    ('web', 'ghcr.io/tempo-co/tempo-web'),
):
    image = str(services[service_name].get('image', ''))
    if not re.fullmatch(re.escape(repository) + r'@sha256:[0-9a-f]{64}', image):
        raise SystemExit(f'{service_name} image is not an approved immutable repository digest')
for service_name, service in services.items():
    image = str(service.get('image', ''))
    if '@sha256:' not in image:
        raise SystemExit(f'{service_name} image is not immutable')
    for key in ('privileged', 'network_mode', 'pid', 'ipc', 'uts', 'userns_mode', 'devices'):
        if service.get(key):
            raise SystemExit(f'{service_name} uses forbidden Compose option: {key}')
    if service.get('cap_add'):
        raise SystemExit(f'{service_name} adds Linux capabilities')
    for volume in service.get('volumes', []):
        if isinstance(volume, dict) and volume.get('type') == 'bind':
            raise SystemExit(f'{service_name} uses a host bind mount')
        if isinstance(volume, str) and not volume.startswith('tempo-staging-'):
            raise SystemExit(f'{service_name} uses an unapproved volume source')

volumes = config.get('volumes', {})
postgres_volume = volumes.get('tempo_staging_postgres_data', {})
if not str(postgres_volume.get('name', '')).startswith('tempo-staging-'):
    raise SystemExit('staging Postgres volume is not isolated')
expected_networks = {'backend', 'edge', 'ingress'}
networks = config.get('networks', {})
if set(networks) != expected_networks:
    raise SystemExit('staging Compose networks are not the approved set')
expected_internal = {'backend': True, 'edge': True, 'ingress': False}
for name, network in networks.items():
    if not isinstance(network, dict) or network.get('external'):
        raise SystemExit('staging Compose networks must be project-local')
    if not str(network.get('name', '')).startswith('tempo-staging-'):
        raise SystemExit(f'staging network is not isolated: {name}')
    if network.get('driver') not in (None, 'bridge') or network.get('driver_opts') or network.get('ipam'):
        raise SystemExit(f'staging network has unsupported routing options: {name}')
    if bool(network.get('internal', False)) != expected_internal[name]:
        raise SystemExit(f'staging network isolation is invalid: {name}')

expected_service_networks = {
    'api': {'backend', 'edge'},
    'postgres': {'backend'},
    'redis': {'backend'},
    'mailpit': {'backend', 'edge'},
    'web': {'edge', 'ingress'},
}
for service_name, expected in expected_service_networks.items():
    service_networks = services[service_name].get('networks', [])
    if isinstance(service_networks, dict):
        if any(isinstance(options, dict) and options.get('aliases') for options in service_networks.values()):
            raise SystemExit(f'{service_name} must not override staging service DNS aliases')
        actual = set(service_networks)
    elif isinstance(service_networks, list):
        actual = set(service_networks)
    else:
        raise SystemExit(f'{service_name} network configuration is invalid')
    if actual != expected:
        raise SystemExit(f'{service_name} network memberships are not the approved set')

ports = []
for service_name, service in services.items():
    for port in service.get('ports', []) or []:
        if service_name != 'web':
            raise SystemExit(f'{service_name} publishes a host port')
        host_ip = str(port.get('host_ip', '')) if isinstance(port, dict) else ''
        target = str(port.get('target', '')) if isinstance(port, dict) else ''
        published = str(port.get('published', '')) if isinstance(port, dict) else ''
        protocol = str(port.get('protocol', '')) if isinstance(port, dict) else ''
        if (host_ip, published, target, protocol) != ('127.0.0.1', '8119', '8080', 'tcp'):
            raise SystemExit('staging web port is not loopback-only 127.0.0.1:8119 -> 8080/tcp')
        ports.append(port)
if len(ports) != 1:
    raise SystemExit('staging must publish exactly one web port')
PY
    rm -f -- "$rendered_file"
    return "$status"
}

require_runtime() {
    command_required docker
    command_required flock
    command_required mktemp
    command_required python3
    command_required curl
    command_required grep
    [[ $DOCKER_HOST_VALUE == unix://* ]] || fail 'staging Docker host must be a Unix socket'
    if [[ ${TEMPO_STAGING_REFRESH_TEST_MODE:-0} != 1 ]]; then
        [[ $DOCKER_HOST_VALUE == "unix://$DEFAULT_DOCKER_SOCKET" ]] || fail 'staging refresh Docker host override is only allowed in test mode'
    fi
    local socket=${DOCKER_HOST_VALUE#unix://}
    [[ -S $socket ]] || fail "staging Docker socket is unavailable: $socket"
    local config="$DOCKER_CONFIG_VALUE/config.json" expected_root="$HOME/.local/share/tempo-staging/docker" docker_root
    [[ -f $config && ! -L $config ]] || fail 'dedicated staging Docker credential config is missing'
    [[ $(stat -c '%a' "$config") == 600 ]] || fail 'dedicated staging Docker credential config must be mode 600'
    python3 - "$config" <<'PY'
import json
import sys
from pathlib import Path

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
if not ({*config.get('auths', {}), *config.get('credHelpers', {})} & {'ghcr.io'}):
    raise SystemExit(1)
PY
    local security_options
    security_options=$(docker_cli info --format '{{json .SecurityOptions}}') || fail 'staging Docker security options cannot be inspected'
    [[ $security_options == *rootless* ]] || fail 'staging refresh Docker daemon is not rootless'
    docker_root=$(docker_cli info --format '{{.DockerRootDir}}') || fail 'staging Docker root cannot be inspected'
    [[ $docker_root == "$expected_root" ]] || fail 'staging Docker root is outside the staging data root'
}


docker_cli() {
    env -u DOCKER_CONTEXT DOCKER_CONFIG="$DOCKER_CONFIG_VALUE" DOCKER_HOST="$DOCKER_HOST_VALUE" docker "$@"
}

compose_cli() {
    docker_cli compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

pg_container() {
    local id
    id=$(compose_cli ps -q postgres)
    [[ -n $id ]] || fail 'staging Postgres container is not running'
    printf '%s\n' "$id"
}

staging_psql() {
    local database=$1
    local sql=$2
    local id
    [[ $STAGING_PGPASS_INSTALLED == 1 ]] || fail 'staging pgpass file is not installed'
    id=$(pg_container)
    docker_cli exec -i -e "PGPASSFILE=$STAGING_PGPASS_CONTAINER_PATH" "$id" \
        psql --no-psqlrc -v ON_ERROR_STOP=1 -U "$STAGING_DB_USERNAME" -d "$database" -c "$sql"
}

staging_psql_scalar() {
    local database=$1
    local sql=$2
    local id
    [[ $STAGING_PGPASS_INSTALLED == 1 ]] || fail 'staging pgpass file is not installed'
    id=$(pg_container)
    docker_cli exec -i -e "PGPASSFILE=$STAGING_PGPASS_CONTAINER_PATH" "$id" \
        psql --no-psqlrc -v ON_ERROR_STOP=1 -At -U "$STAGING_DB_USERNAME" -d "$database" -c "$sql"
}

install_staging_pgpass() {
    local id
    id=$(pg_container)
    STAGING_PGPASS_FILE=$(mktemp "$STATE_DIR/refresh-pgpass.XXXXXX")
    chmod 600 "$STAGING_PGPASS_FILE"
    printf '*:*:*:*:%s\n' "$STAGING_DB_PASSWORD" > "$STAGING_PGPASS_FILE"
    docker_cli cp "$STAGING_PGPASS_FILE" "$id:$STAGING_PGPASS_CONTAINER_PATH"
    STAGING_PGPASS_INSTALLED=1
    docker_cli exec "$id" chown postgres:postgres "$STAGING_PGPASS_CONTAINER_PATH"
    docker_cli exec "$id" chmod 600 "$STAGING_PGPASS_CONTAINER_PATH"
}

ensure_dependencies() {
    compose_cli up -d --wait postgres redis mailpit
    install_staging_pgpass
}

database_exists() {
    local database=$1
    [[ $(staging_psql_scalar postgres "SELECT 1 FROM pg_database WHERE datname = '$database';") == 1 ]]
}

drop_database() {
    local database=$1
    if database_exists "$database"; then
        staging_psql postgres "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$database' AND pid <> pg_backend_pid();"
        staging_psql postgres "DROP DATABASE \"$database\";"
    fi
}

create_database() {
    local database=$1
    validate_identifier "$database" database
    drop_database "$database"
    staging_psql postgres "CREATE DATABASE \"$database\" OWNER \"$STAGING_DB_USERNAME\";"
}

run_api_command() {
    local database=$1
    shift
    compose_cli run --rm --no-deps -T \
        -e "DB_NAME=$database" \
        -e 'DB_SYNCHRONIZE=false' \
        api "$@"
}

copy_dump_into_staging() {
    local id
    id=$(pg_container)
    DUMP_CONTAINER_PATH="/tmp/tempo-staging-refresh.dump"
    docker_cli cp "$DUMP_FILE" "$id:$DUMP_CONTAINER_PATH"
}

restore_dump() {
    local id
    [[ $STAGING_PGPASS_INSTALLED == 1 ]] || fail 'staging pgpass file is not installed'
    id=$(pg_container)
    docker_cli exec -e "PGPASSFILE=$STAGING_PGPASS_CONTAINER_PATH" "$id" \
        pg_restore --exit-on-error --no-owner --no-privileges \
        -U "$STAGING_DB_USERNAME" -d "$REFRESH_DATABASE" "$DUMP_CONTAINER_PATH"
}

sanitize_database() {
    local sql
    sql=$(cat <<'SQL'
BEGIN;
DELETE FROM bank_sync_runs;
UPDATE bank_connections
SET "providerSessionId" = NULL,
    "authorizationStateHash" = NULL,
    status = 'FAILED',
    "consentValidUntil" = NULL,
    "lastSyncedAt" = NULL,
    "lastSyncError" = NULL,
    "nextSyncAt" = NULL,
    "syncStartedAt" = NULL,
    "syncStatus" = 'IDLE',
    "syncFailureCount" = 0,
    "updatedAt" = NOW();
COMMIT;
SQL
)
    staging_psql "$REFRESH_DATABASE" "$sql"
}

assert_sanitized() {
    local result
    result=$(staging_psql_scalar "$REFRESH_DATABASE" \
        'SELECT (SELECT COUNT(*) FROM bank_connections WHERE "providerSessionId" IS NOT NULL) || '"'|'"' || (SELECT COUNT(*) FROM bank_connections WHERE "authorizationStateHash" IS NOT NULL);')
    [[ $result == '0|0' ]] || fail 'sanitization left provider authorization state in the temporary database'
    [[ $(staging_psql_scalar "$REFRESH_DATABASE" 'SELECT COUNT(*) FROM bank_sync_runs;') == 0 ]] || \
        fail 'sanitization left bank sync runs in the temporary database'
}

clear_staging_redis() {
    local redis_id
    redis_id=$(compose_cli ps -q redis)
    [[ -n $redis_id ]] || fail 'staging Redis container is not running'
    docker_cli exec "$redis_id" redis-cli FLUSHALL >/dev/null
}

validate_refresh_inputs() {
    [[ -d $BACKUP_DIR && ! -L $BACKUP_DIR && -O $BACKUP_DIR ]] || fail 'production backup directory must be an owner-controlled directory'
    [[ $(stat -c '%a' "$BACKUP_DIR") == 700 ]] || fail 'production backup directory must be mode 700'
}

select_local_production_backup() {
    DUMP_FILE=$(python3 - "$BACKUP_DIR" <<'PY'
import os
import re
import stat
import sys
from pathlib import Path

root = Path(sys.argv[1])
if root.is_symlink() or not root.is_dir():
    raise SystemExit('production backup directory is missing or unsafe')
root_stat = root.stat()
if root_stat.st_uid != os.geteuid() or stat.S_IMODE(root_stat.st_mode) != 0o700:
    raise SystemExit('production backup directory is not owner-controlled with mode 700')
pattern = re.compile(r'tempo-\d{8}-\d{6}\.dump')
candidates = sorted((path for path in root.iterdir() if pattern.fullmatch(path.name)), key=lambda path: path.name)
if not candidates:
    raise SystemExit('no custom-format production backup is available')
latest = candidates[-1]
latest_stat = latest.lstat()
if not stat.S_ISREG(latest_stat.st_mode) or latest_stat.st_uid != os.geteuid() or stat.S_IMODE(latest_stat.st_mode) != 0o600 or latest_stat.st_size == 0:
    raise SystemExit('latest custom-format production backup is not owner-controlled with mode 600')
print(latest)
PY
) || fail 'could not select the latest local custom-format production backup'
    [[ -n $DUMP_FILE ]] || fail 'latest local custom-format production backup was not selected'
}

prepare_refresh_database() {
    create_database "$REFRESH_DATABASE"
    copy_dump_into_staging
    local id
    id=$(pg_container)
    docker_cli exec "$id" pg_restore --list "$DUMP_CONTAINER_PATH" >/dev/null
    restore_dump
    run_api_command "$REFRESH_DATABASE" node dist/scripts/schema.js
    sanitize_database
    assert_sanitized
}

prepare_seed_database() {
    create_database "$REFRESH_DATABASE"
    run_api_command "$REFRESH_DATABASE" node dist/scripts/schema.js
    run_api_command "$REFRESH_DATABASE" node dist/scripts/seed.js
}

rename_database() {
    local from=$1 to=$2
    staging_psql postgres "ALTER DATABASE \"$from\" RENAME TO \"$to\";"
}

rollback_database_swap() {
    local status=0
    if ! compose_cli stop api web >/dev/null 2>&1; then
        if ! compose_cli stop api web >/dev/null 2>&1; then status=1; fi
    fi
    if (( status == 0 && REFRESH_DATABASE_RENAMED == 1 )); then
        if ! drop_database "$STAGING_DB_NAME"; then status=1; fi
    fi
    if (( status == 0 && ORIGINAL_DATABASE_MOVED == 1 )); then
        if ! database_exists "$PREVIOUS_DATABASE" || ! rename_database "$PREVIOUS_DATABASE" "$STAGING_DB_NAME"; then
            status=1
        fi
    fi
    if (( status == 0 )); then
        if ! clear_staging_redis; then status=1; fi
    fi
    if (( status == 0 )); then
        if ! compose_cli up -d --wait api web; then status=1; fi
    fi
    if (( status == 0 )); then
        if ! health_check_staging --rollback; then status=1; fi
    fi
    if (( status != 0 )); then
        compose_cli stop api web >/dev/null 2>&1 || true
    fi
    return "$status"
}

health_check_staging() {
    local mode=${1:-normal}
    [[ $mode == normal || $mode == --rollback ]] || fail 'invalid staging health-check mode'
    compose_cli ps --status running api web >/dev/null || return 1
    curl --fail --silent --show-error --max-time 15 "$STAGING_WEB_URL" >/dev/null || return 1
    if [[ $mode == normal ]]; then
        local api_health_response
        api_health_response=$(curl --fail --silent --show-error --max-time 15 "$STAGING_API_HEALTH_URL") || return 1
        python3 -c 'import json, sys; payload = json.load(sys.stdin); raise SystemExit(0 if payload.get("status") == "ok" else 1)' <<<"$api_health_response" || {
            fail 'host-facing staging API health route did not return healthy JSON'
            return 1
        }
    fi
    local api_id
    api_id=$(compose_cli ps -q api) || return 1
    docker_cli exec "$api_id" curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/health >/dev/null || return 1
}

swap_database_and_verify() {
    drop_database "$PREVIOUS_DATABASE"
    drop_database "$FAILED_DATABASE"
    SWAP_STARTED=1
    compose_cli stop api web
    if database_exists "$STAGING_DB_NAME"; then
        rename_database "$STAGING_DB_NAME" "$PREVIOUS_DATABASE"
        ORIGINAL_DATABASE_MOVED=1
    fi
    rename_database "$REFRESH_DATABASE" "$STAGING_DB_NAME"
    REFRESH_DATABASE_RENAMED=1
    clear_staging_redis
    compose_cli up -d --wait api web
    health_check_staging
    drop_database "$PREVIOUS_DATABASE"
}

cleanup_refresh_artifacts() {
    local status=0
    if [[ -n $DUMP_CONTAINER_PATH ]]; then
        local id
        id=$(pg_container 2>/dev/null || true)
        if [[ -n $id ]] && ! docker_cli exec "$id" rm -f "$DUMP_CONTAINER_PATH" >/dev/null 2>&1; then
            status=1
        fi
    fi
    if [[ $REFRESH_SUCCEEDED != 1 ]] && database_exists "$REFRESH_DATABASE"; then
        if ! drop_database "$REFRESH_DATABASE" >/dev/null 2>&1 || database_exists "$REFRESH_DATABASE"; then
            status=1
        fi
    fi
    if [[ $STAGING_PGPASS_INSTALLED == 1 ]]; then
        local id
        id=$(pg_container 2>/dev/null || true)
        if [[ -n $id ]] && ! docker_cli exec "$id" rm -f "$STAGING_PGPASS_CONTAINER_PATH" >/dev/null 2>&1; then
            status=1
        fi
        STAGING_PGPASS_INSTALLED=0
    fi
    if [[ -n $STAGING_PGPASS_FILE && -e $STAGING_PGPASS_FILE ]]; then
        if ! rm -f -- "$STAGING_PGPASS_FILE"; then status=1; fi
    fi
    return "$status"
}

on_exit() {
    local status=$?
    if [[ $status -ne 0 && $SWAP_STARTED == 1 ]]; then
        if ! rollback_database_swap; then
            printf 'ERROR: database rollback was not verified; API and web remain stopped\n' >&2
            status=1
        fi
    fi
    if ! cleanup_refresh_artifacts; then
        printf 'ERROR: refresh artifact cleanup was not verified\n' >&2
        status=1
    fi
    exit "$status"
}

validate_common() {
    command_required python3
    check_paths
    load_staging_database_config
    [[ -r $PRODUCTION_ORIGIN_HOST_FILE ]] || fail "production origin metadata is missing or unreadable: $PRODUCTION_ORIGIN_HOST_FILE"
    validate_staging_origin
    assert_staging_policy
}

run_refresh() {
    validate_common
    validate_refresh_inputs
    select_local_production_backup
    require_runtime
    exec {lock_fd}>"$STATE_DIR/refresh.lock"
    flock -n "$lock_fd" || fail 'another staging refresh is already running'
    trap on_exit EXIT
    ensure_dependencies
    prepare_refresh_database
    swap_database_and_verify
    REFRESH_SUCCEEDED=1
}

run_seed() {
    validate_common
    require_runtime
    exec {lock_fd}>"$STATE_DIR/refresh.lock"
    flock -n "$lock_fd" || fail 'another staging refresh is already running'
    trap on_exit EXIT
    ensure_dependencies
    prepare_seed_database
    swap_database_and_verify
    REFRESH_SUCCEEDED=1
}

main() {
    local action=${1-}
    case "$action" in
        validate)
            [[ ${2-} == '' ]] || usage
            validate_common
            ;;
        seed)
            [[ ${2-} == --confirm-seeded-reset ]] || { usage; return 2; }
            run_seed
            ;;
        refresh)
            [[ ${2-} == --confirm-production-backup-refresh ]] || { usage; return 2; }
            run_refresh
            ;;
        -h|--help)
            usage
            ;;
        *)
            usage
            ;;
    esac
}

main "$@"
