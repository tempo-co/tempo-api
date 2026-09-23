#!/usr/bin/env bash
set -Eeuo pipefail

readonly API_REPOSITORY='https://github.com/tempo-co/tempo-api.git'
readonly WEB_REPOSITORY='https://github.com/tempo-co/tempo-web.git'
readonly API_REPOSITORY_NAME='tempo-co/tempo-api'
readonly WEB_REPOSITORY_NAME='tempo-co/tempo-web'
readonly API_IMAGE_REPOSITORY='ghcr.io/tempo-co/tempo-api'
readonly WEB_IMAGE_REPOSITORY='ghcr.io/tempo-co/tempo-web'
readonly INTENT_WORKFLOW_PATH='.github/workflows/staging-promote.yml'
readonly GITHUB_API_ROOT='https://api.github.com'

TARGET=''
COMPOSE_PROJECT=''
DOCKER_HOST_VALUE=''
DOCKER_CONFIG_VALUE=''
STATE_SCOPE=''
COMPOSE_FILE=''
ENV_FILE=''
STATE_FILE=''
REFRESH_STATE_FILE=''
STAGING_REFRESH_SCRIPT=''
ROLLBACK_FILE=''
LOCK_FILE=''
API_CONTAINER=''
WEB_CONTAINER=''
POSTGRES_CONTAINER=''
REDIS_CONTAINER=''
MAILPIT_CONTAINER=''
API_ROUTE_URL=''
WEB_ROUTE_URL=''
TEST_INTENT_DIR=''

API_SHA=''
WEB_SHA=''
API_IMAGE=''
WEB_IMAGE=''
CANDIDATE_API_TAG=''
CANDIDATE_WEB_TAG=''
REFRESH_API_SHA=''
REFRESH_WEB_SHA=''
REFRESH_API_IMAGE=''
REFRESH_WEB_IMAGE=''
CLEANUP_FAILURE=0
declare -A STATEFUL_IDS=()

log() {
    printf 'tempo-%s-deploy: %s\n' "$TARGET" "$*"
}

die() {
    log "ERROR: $*" >&2
    exit 1
}

usage() {
    cat >&2 <<'EOF'
usage:
  tempo-deploy.sh --target production|staging --print-config
  tempo-deploy.sh --target production|staging [--initialize]
  tempo-deploy.sh --validate-intent INTENT_FILE REPOSITORY COMPONENT
EOF
    exit 2
}

configure_target() {
    TARGET=$1
    local runtime_dir test_root
    runtime_dir=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
    test_root=${TEMPO_DEPLOY_TEST_ROOT:-}

    case "$TARGET" in
        production)
            COMPOSE_PROJECT='tempo-api-production'
            DOCKER_HOST_VALUE='unix:///var/run/docker.sock'
            DOCKER_CONFIG_VALUE=''
            STATE_SCOPE='production'
            API_CONTAINER='tempo-api-production-api-1'
            WEB_CONTAINER='tempo-api-production-web-1'
            POSTGRES_CONTAINER='tempo-api-production-postgres-1'
            REDIS_CONTAINER='tempo-api-production-redis-1'
            MAILPIT_CONTAINER='tempo-api-production-mailpit-1'
            API_ROUTE_URL='http://127.0.0.1:8080/tempo/api/health'
            WEB_ROUTE_URL='http://127.0.0.1:8080/tempo/'
            if [[ ${TEMPO_DEPLOY_TEST_MODE:-0} == 1 ]]; then
                [[ -n $test_root ]] || die 'test mode requires TEMPO_DEPLOY_TEST_ROOT'
                COMPOSE_FILE="$test_root/production.compose.yml"
                ENV_FILE="$test_root/production.env"
                STATE_FILE="${TEMPO_DEPLOY_STATE_FILE:-$test_root/production/images.env}"
                LOCK_FILE="$test_root/production/deploy.lock"
            else
                COMPOSE_FILE='/etc/tempo/production.compose.yml'
                ENV_FILE='/etc/tempo/production.env'
                STATE_FILE='/var/lib/tempo-deploy/images.env'
                LOCK_FILE='/var/lib/tempo-deploy/deploy.lock'
            fi
            ;;
        staging)
            COMPOSE_PROJECT='tempo-staging'
            DOCKER_HOST_VALUE="unix://$runtime_dir/tempo-staging/docker.sock"
            DOCKER_CONFIG_VALUE="$HOME/.config/tempo-staging/docker-config"
            STATE_SCOPE='staging'
            API_CONTAINER='tempo-staging-api-1'
            WEB_CONTAINER='tempo-staging-web-1'
            POSTGRES_CONTAINER='tempo-staging-postgres-1'
            REDIS_CONTAINER='tempo-staging-redis-1'
            MAILPIT_CONTAINER='tempo-staging-mailpit-1'
            API_ROUTE_URL='http://127.0.0.1:8119/tempo/api/health'
            WEB_ROUTE_URL='http://127.0.0.1:8119/tempo/'
            if [[ ${TEMPO_DEPLOY_TEST_MODE:-0} == 1 ]]; then
                [[ -n $test_root ]] || die 'test mode requires TEMPO_DEPLOY_TEST_ROOT'
                COMPOSE_FILE="$test_root/staging.compose.yml"
                ENV_FILE="$test_root/staging.env"
                PRODUCTION_ORIGIN_HOST_FILE="$HOME/.config/tempo-staging/production-origin-host"
                STATE_FILE="${TEMPO_DEPLOY_STATE_FILE:-$test_root/staging/images.env}"
                REFRESH_STATE_FILE="${TEMPO_DEPLOY_TEST_REFRESH_STATE_FILE:-$test_root/staging/refresh-images.env}"
                STAGING_REFRESH_SCRIPT="${TEMPO_DEPLOY_TEST_REFRESH_SCRIPT:-$test_root/staging-refresh.sh}"
                LOCK_FILE="$test_root/staging/deploy.lock"
                TEST_INTENT_DIR=${TEMPO_DEPLOY_TEST_INTENT_DIR:-$test_root/intents}
            else
                COMPOSE_FILE="$HOME/.config/tempo-staging/staging.compose.yml"
                ENV_FILE="$HOME/.config/tempo-staging/staging.env"
                PRODUCTION_ORIGIN_HOST_FILE="$HOME/.config/tempo-staging/production-origin-host"
                STATE_FILE="$HOME/.local/state/tempo-staging/images.env"
                REFRESH_STATE_FILE="$HOME/.local/state/tempo-staging/refresh-images.env"
                STAGING_REFRESH_SCRIPT="$HOME/.config/tempo-staging/tempo-staging-refresh.sh"
                LOCK_FILE="$HOME/.local/state/tempo-staging/deploy.lock"
                TEST_INTENT_DIR=''
            fi
            ;;
        *)
            die "unknown deployment target: $TARGET"
            ;;
    esac

    ROLLBACK_FILE="${STATE_FILE}.rollback"
}

print_config() {
    printf 'TARGET=%s\n' "$TARGET"
    printf 'COMPOSE_PROJECT=%s\n' "$COMPOSE_PROJECT"
    printf 'DOCKER_HOST=%s\n' "$DOCKER_HOST_VALUE"
    printf 'DOCKER_CONFIG=%s\n' "$DOCKER_CONFIG_VALUE"
    printf 'STATE_SCOPE=%s\n' "$STATE_SCOPE"
    printf 'COMPOSE_FILE=%s\n' "$COMPOSE_FILE"
    printf 'ENV_FILE=%s\n' "$ENV_FILE"
    printf 'STATE_FILE=%s\n' "$STATE_FILE"
    printf 'REFRESH_STATE_FILE=%s\n' "$REFRESH_STATE_FILE"
    printf 'STAGING_REFRESH_SCRIPT=%s\n' "$STAGING_REFRESH_SCRIPT"
    printf 'LOCK_FILE=%s\n' "$LOCK_FILE"
}

require_staging_registry_auth() {
    [[ $TARGET == staging ]] || return 0
    [[ ${TEMPO_DEPLOY_TEST_MODE:-0} == 1 ]] && return 0
    local config="$DOCKER_CONFIG_VALUE/config.json"
    [[ -f $config && ! -L $config ]] || die 'staging GHCR Docker credential config is missing'
    [[ $(stat -c '%a' "$config") == 600 ]] || die 'staging GHCR Docker credential config must be mode 600'
    python3 - "$config" <<'PY'
import json
import sys
from pathlib import Path

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
if 'ghcr.io' not in config.get('auths', {}) and 'ghcr.io' not in config.get('credHelpers', {}):
    raise SystemExit('staging Docker config has no dedicated ghcr.io credential')
PY
}

need_commands() {
    local command
    for command in curl docker flock mktemp awk cp chmod mv rm mkdir dirname python3; do
        command -v "$command" >/dev/null 2>&1 || die "required command is missing: $command"
    done
    if [[ $TARGET == production ]]; then
        command -v git >/dev/null 2>&1 || die 'required command is missing: git'
    fi
    require_staging_registry_auth
}

valid_sha() {
    [[ $1 == bootstrap || $1 =~ ^[0-9a-f]{40}$ ]]
}

valid_image() {
    local repository=$1 reference=$2
    if [[ $reference == "$repository"@sha256:* ]]; then
        [[ ${reference#*@sha256:} =~ ^[0-9a-f]{64}$ ]]
    elif [[ $TARGET == production && $reference == "$repository":* ]]; then
        [[ ${reference#*:} =~ ^[[:alnum:]_.-]+$ ]]
    elif [[ $TARGET == production && $repository == "$WEB_IMAGE_REPOSITORY" && $reference == tempo-api-production-web:latest ]]; then
        true
    else
        false
    fi
}

canonical_image() {
    case $1 in
        "$API_IMAGE_REPOSITORY"|"$WEB_IMAGE_REPOSITORY"|tempo-api-production-web)
            printf '%s:latest\n' "$1" ;;
        *)
            printf '%s\n' "$1" ;;
    esac
}

read_intent_values() {
    local intent_file=$1 expected_repository=$2 expected_component=$3
    python3 - "$intent_file" "$expected_repository" "$expected_component" "$API_IMAGE_REPOSITORY" "$WEB_IMAGE_REPOSITORY" "$INTENT_WORKFLOW_PATH" <<'PY'
import json
import re
import sys

path, expected_repository, expected_component, api_repository, web_repository, workflow_path = sys.argv[1:]
try:
    with open(path, encoding='utf-8') as handle:
        intent = json.load(handle)
except (OSError, json.JSONDecodeError) as error:
    raise SystemExit(f'invalid intent JSON: {error}')

if not isinstance(intent, dict):
    raise SystemExit('intent must be a JSON object')
if set(intent) != {'schema_version', 'repository', 'component', 'environment', 'pr_number', 'head_sha', 'image', 'image_tag', 'workflow'}:
    raise SystemExit('intent contains unexpected or missing top-level fields')
if intent['schema_version'] != 1:
    raise SystemExit('unsupported intent schema version')
if intent['repository'] != expected_repository:
    raise SystemExit('intent repository does not match the requested repository')
if intent['component'] != expected_component:
    raise SystemExit('intent component does not match the requested component')
if intent['environment'] != 'staging':
    raise SystemExit('intent environment is not staging')
if not isinstance(intent['pr_number'], int) or isinstance(intent['pr_number'], bool) or intent['pr_number'] <= 0:
    raise SystemExit('intent PR number is invalid')
head_sha = intent['head_sha']
if not isinstance(head_sha, str) or not re.fullmatch(r'[0-9a-f]{40}', head_sha):
    raise SystemExit('intent head SHA is invalid')

repository_by_component = {'api': api_repository, 'web': web_repository}
repository = repository_by_component.get(expected_component)
if repository is None:
    raise SystemExit('intent component is invalid')
image = intent['image']
if not isinstance(image, str) or not re.fullmatch(rf'{re.escape(repository)}@sha256:[0-9a-f]{{64}}', image):
    raise SystemExit('intent image is not an immutable digest for the requested component')

workflow = intent['workflow']
if not isinstance(workflow, dict) or set(workflow) != {'path', 'ref', 'event', 'run_id', 'dispatch_sha'}:
    raise SystemExit('intent workflow metadata is incomplete or contains unexpected fields')
if workflow['path'] != workflow_path:
    raise SystemExit('intent workflow path is not trusted')
if workflow['ref'] != 'refs/heads/main':
    raise SystemExit('intent workflow ref is not trusted')
if workflow['event'] != 'workflow_dispatch':
    raise SystemExit('intent workflow event is not trusted')
if not isinstance(workflow['run_id'], int) or isinstance(workflow['run_id'], bool) or workflow['run_id'] <= 0:
    raise SystemExit('intent workflow run ID is invalid')
if not isinstance(workflow['dispatch_sha'], str) or not re.fullmatch(r'[0-9a-f]{40}', workflow['dispatch_sha']):
    raise SystemExit('intent dispatch workflow SHA is invalid')
image_tag = intent['image_tag']
expected_image_tag = f'{repository}:staging-{workflow["run_id"]}-{head_sha}'
if image_tag != expected_image_tag:
    raise SystemExit('intent image tag is not bound to the workflow run and selected head')

print(head_sha)
print(image)
print(image_tag)
PY
}

validate_intent() {
    local intent_file=$1 expected_repository=$2 expected_component=$3
    local values=()
    mapfile -t values < <(read_intent_values "$intent_file" "$expected_repository" "$expected_component")
    [[ ${#values[@]} -eq 3 ]] || die 'intent did not produce exactly one SHA, image, and publication tag'
    printf 'VALID intent repository=%s component=%s head_sha=%s image=%s image_tag=%s\n' \
        "$expected_repository" "$expected_component" "${values[0]}" "${values[1]}" "${values[2]}"
}

read_state() {
    local file=$1 line
    [[ -r $file ]] || die "deployment state is missing or unreadable: $file"
    API_SHA=''; WEB_SHA=''; API_IMAGE=''; WEB_IMAGE=''
    while IFS= read -r line || [[ -n $line ]]; do
        case $line in
            TEMPO_API_SHA=*) API_SHA=${line#*=} ;;
            TEMPO_WEB_SHA=*) WEB_SHA=${line#*=} ;;
            TEMPO_API_IMAGE=*) API_IMAGE=${line#*=} ;;
            TEMPO_WEB_IMAGE=*) WEB_IMAGE=${line#*=} ;;
            ''|'# '*) ;;
            *) die 'unexpected deployment state entry' ;;
        esac
    done < "$file"
    valid_sha "$API_SHA" || die 'invalid API SHA in deployment state'
    valid_sha "$WEB_SHA" || die 'invalid web SHA in deployment state'
    valid_image "$API_IMAGE_REPOSITORY" "$API_IMAGE" || die 'invalid API image in deployment state'
    valid_image "$WEB_IMAGE_REPOSITORY" "$WEB_IMAGE" || die 'invalid web image in deployment state'
}

write_state() {
    local api_sha=$1 web_sha=$2 api_image=$3 web_image=$4 state_file=${5:-$STATE_FILE} temporary_file
    valid_sha "$api_sha" && valid_sha "$web_sha" && \
        valid_image "$API_IMAGE_REPOSITORY" "$api_image" && \
        valid_image "$WEB_IMAGE_REPOSITORY" "$web_image" || return 1
    mkdir -p "$(dirname "$state_file")"
    temporary_file=$(mktemp "${state_file}.tmp.XXXXXX") || return 1
    umask 077
    if ! printf 'TEMPO_API_SHA=%s\nTEMPO_WEB_SHA=%s\nTEMPO_API_IMAGE=%s\nTEMPO_WEB_IMAGE=%s\n' \
        "$api_sha" "$web_sha" "$api_image" "$web_image" > "$temporary_file"; then
        rm -f "$temporary_file"
        return 1
    fi
    chmod 600 "$temporary_file" && mv -f "$temporary_file" "$state_file" || {
        rm -f "$temporary_file"
        return 1
    }
}

load_refresh_state() {
    local current_api_sha=$1 current_web_sha=$2 current_api_image=$3 current_web_image=$4
    [[ $TARGET == staging ]] || return 0
    [[ -n $REFRESH_STATE_FILE ]] || die 'staging refresh state path is not configured'
    [[ ! -L $REFRESH_STATE_FILE ]] || die 'staging refresh state must not be a symlink'
    if [[ ! -e $REFRESH_STATE_FILE ]]; then
        write_state "$current_api_sha" "$current_web_sha" "$current_api_image" "$current_web_image" "$REFRESH_STATE_FILE" || \
            die 'could not initialize staging refresh state'
        REFRESH_API_SHA=$current_api_sha
        REFRESH_WEB_SHA=$current_web_sha
        REFRESH_API_IMAGE=$current_api_image
        REFRESH_WEB_IMAGE=$current_web_image
        return 0
    fi
    [[ -f $REFRESH_STATE_FILE && -O $REFRESH_STATE_FILE ]] || die 'staging refresh state is missing or not owner-controlled'
    [[ $(stat -c '%a' "$REFRESH_STATE_FILE") == 600 ]] || die 'staging refresh state must be mode 600'
    read_state "$REFRESH_STATE_FILE"
    REFRESH_API_SHA=$API_SHA
    REFRESH_WEB_SHA=$WEB_SHA
    REFRESH_API_IMAGE=$API_IMAGE
    REFRESH_WEB_IMAGE=$WEB_IMAGE
    API_SHA=$current_api_sha
    WEB_SHA=$current_web_sha
    API_IMAGE=$current_api_image
    WEB_IMAGE=$current_web_image
}

docker_cli() {
    if [[ $TARGET == staging ]]; then
        env -u DOCKER_CONTEXT DOCKER_CONFIG="$DOCKER_CONFIG_VALUE" DOCKER_HOST="$DOCKER_HOST_VALUE" docker "$@"
    else
        env -u DOCKER_CONTEXT -u DOCKER_CONFIG DOCKER_HOST="$DOCKER_HOST_VALUE" docker "$@"
    fi
}

compose_cli() {
    docker_cli compose --project-name "$COMPOSE_PROJECT" --file "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

require_target_files() {
    [[ -r $COMPOSE_FILE ]] || die "Compose file is missing or unreadable: $COMPOSE_FILE"
    [[ ! -L $COMPOSE_FILE ]] || die 'Compose file must not be a symlink'
    [[ -O $COMPOSE_FILE ]] || die 'Compose file must be owned by the deployment user'
    [[ -r $ENV_FILE ]] || die "environment file is missing or unreadable: $ENV_FILE"
    [[ ! -L $ENV_FILE ]] || die 'environment file must not be a symlink'
    [[ -O $ENV_FILE ]] || die 'environment file must be owned by the deployment user'
    if [[ $TARGET == staging && ${TEMPO_DEPLOY_TEST_MODE:-0} != 1 ]]; then
        local config_dir
        config_dir=$(dirname -- "$ENV_FILE")
        [[ -d $config_dir && ! -L $config_dir && -O $config_dir ]] || die 'staging config directory must be owner-controlled'
        [[ $(stat -c '%a' "$config_dir") == 700 ]] || die 'staging config directory must be mode 700'
        [[ $(stat -c '%a' "$ENV_FILE") == 600 ]] || die 'staging environment file must be mode 600'
        [[ -r $PRODUCTION_ORIGIN_HOST_FILE && ! -L $PRODUCTION_ORIGIN_HOST_FILE && -O $PRODUCTION_ORIGIN_HOST_FILE ]] || die 'production origin host file is missing or not owner-controlled'
        [[ $(stat -c '%a' "$PRODUCTION_ORIGIN_HOST_FILE") == 600 ]] || die 'production origin host file must be mode 600'
    fi
}

production_web_host() {
    [[ -r $PRODUCTION_ORIGIN_HOST_FILE ]] || die "production origin host file is missing or unreadable: $PRODUCTION_ORIGIN_HOST_FILE"
    python3 - "$PRODUCTION_ORIGIN_HOST_FILE" <<'PY'
from pathlib import Path
import re
import sys

value = Path(sys.argv[1]).read_text(encoding='utf-8').strip().rstrip('.').lower()
if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', value):
    raise SystemExit('production origin host file contains an invalid hostname')
print(value)
PY
}

require_staging_daemon() {
    local socket_path="${DOCKER_HOST_VALUE#unix://}"
    local expected_root="$HOME/.local/share/tempo-staging/docker"
    if [[ ${TEMPO_DEPLOY_TEST_MODE:-0} == 1 ]]; then
        socket_path='test-mode'
        expected_root="$TEMPO_DEPLOY_TEST_ROOT/docker-root"
    else
        [[ -S $socket_path ]] || die "staging Docker socket is missing: $socket_path"
    fi
    local security_options docker_root
    security_options=$(docker_cli info --format '{{json .SecurityOptions}}' 2>/dev/null) || die 'staging Docker daemon is not reachable'
    docker_root=$(docker_cli info --format '{{.DockerRootDir}}' 2>/dev/null) || die 'staging Docker root cannot be inspected'
    [[ $security_options == *rootless* ]] || die 'staging Docker daemon is not rootless'
    [[ $docker_root == "$expected_root" ]] || die 'staging Docker root is outside the staging data root'
}

assert_staging_policy() {
    [[ $TARGET == staging ]] || return 0
    if [[ ${TEMPO_DEPLOY_TEST_MODE:-0} == 1 && ${TEMPO_DEPLOY_TEST_VALIDATE_POLICY:-0} != 1 ]]; then
        return 0
    fi
    local rendered_file
    rendered_file=$(mktemp) || die 'could not create rendered staging Compose file'
    chmod 600 "$rendered_file"
    if ! compose_cli config --format json > "$rendered_file"; then
        rm -f "$rendered_file"
        die 'could not render staging Compose configuration'
    fi
    local production_host
    production_host=$(production_web_host)
    if ! python3 - "$rendered_file" "$production_host" <<'PY'
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
production_host = sys.argv[2]
services = config.get('services', {})
required_services = {'postgres', 'redis', 'mailpit', 'api', 'web'}
if set(services) != required_services:
    raise SystemExit('staging Compose services are not the approved set')
for service_name, service in services.items():
    if service.get('network_mode') or service.get('links'):
        raise SystemExit(f'{service_name} uses forbidden network routing configuration')


def service_environment(name):
    environment = services.get(name, {}).get('environment', {})
    if isinstance(environment, list):
        environment = dict(item.split('=', 1) for item in environment if isinstance(item, str) and '=' in item)
    if not isinstance(environment, dict):
        raise SystemExit(f'staging {name} environment is invalid')
    return environment


api = services.get('api', {})
api_env = service_environment('api')
postgres_env = service_environment('postgres')

def false_value(value):
    return str(value).lower() == 'false'

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
    service = services.get(service_name, {})
    service_networks = service.get('networks', [])
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

if api_env.get('DB_HOST') != 'postgres':
    raise SystemExit('staging API database host must be the isolated Postgres service')
if api.get('extra_hosts') or api.get('links'):
    raise SystemExit('staging API must not override or link the Postgres hostname')
database_name = str(api_env.get('DB_NAME', ''))
if not database_name or database_name != str(postgres_env.get('POSTGRES_DB', '')):
    raise SystemExit('staging API and Postgres database names do not match')
if database_name in {
    'tempo_staging_refresh', 'tempo_staging_previous', 'tempo_staging_failed',
    'postgres', 'template0', 'template1',
}:
    raise SystemExit('staging database name conflicts with a reserved maintenance or refresh database')
if not false_value(api_env.get('AI_CATEGORIZATION_ENABLED')):
    raise SystemExit('staging AI categorization is not disabled')
if not false_value(api_env.get('AI_CATEGORIZATION_WEB_SEARCH_ENABLED')):
    raise SystemExit('staging AI web search is not disabled')
if not false_value(api_env.get('BANKING_INTEGRATION_ENABLED')):
    raise SystemExit('staging banking integration is not disabled')
if 'OPENAI_API_KEY' in api_env:
    raise SystemExit('staging Compose must not provide OPENAI_API_KEY')
web_base_url = api_env.get('WEB_BASE_URL')
try:
    parsed_url = urlsplit(str(web_base_url))
    staging_host = parsed_url.hostname.rstrip('.').lower() if parsed_url.hostname else ''
    parsed_url.port
except (AttributeError, ValueError):
    staging_host = ''
if parsed_url.scheme != 'https' or not staging_host or parsed_url.username or parsed_url.password or parsed_url.query or parsed_url.fragment:
    raise SystemExit('staging WEB_BASE_URL must be a credential-free HTTPS origin')
if staging_host == production_host:
    raise SystemExit('staging WEB_BASE_URL must use a hostname distinct from production')
if services.get('web', {}).get('ports') != [{'mode': 'ingress', 'host_ip': '127.0.0.1', 'target': 8080, 'published': '8119', 'protocol': 'tcp'}]:
    raise SystemExit('staging web port binding is not isolated')
if any('production' in str(value).lower() for value in config.get('volumes', {}).values()):
    raise SystemExit('staging Compose references a production volume')
PY
    then
        rm -f "$rendered_file"
        die 'staging Compose policy validation failed'
    fi
    rm -f "$rendered_file"
}

container_image() {
    docker_cli inspect --format '{{.Config.Image}}' "$1"
}

initialize_state() {
    require_target_files
    [[ ! -e $STATE_FILE ]] || die "deployment state already exists: $STATE_FILE"
    [[ $TARGET != staging ]] || { require_staging_daemon; assert_staging_policy; }
    local api_image web_image
    api_image=$(container_image "$API_CONTAINER") || die 'could not inspect the running API container'
    web_image=$(container_image "$WEB_CONTAINER") || die 'could not inspect the running web container'
    api_image=$(canonical_image "$api_image")
    web_image=$(canonical_image "$web_image")
    valid_image "$API_IMAGE_REPOSITORY" "$api_image" || die 'running API image is not an allowed reference'
    valid_image "$WEB_IMAGE_REPOSITORY" "$web_image" || die 'running web image is not an allowed reference'
    write_state bootstrap bootstrap "$api_image" "$web_image" || die 'could not write deployment state'
    if ! cp "$STATE_FILE" "$ROLLBACK_FILE" || ! chmod 600 "$ROLLBACK_FILE"; then
        rm -f "$STATE_FILE" "$ROLLBACK_FILE"
        die 'could not create initial rollback state'
    fi
    log 'initialized deployment state from running application containers'
}

main_sha() {
    local repository=$1 line
    line=$(git ls-remote "$repository" refs/heads/main) || die "could not resolve main from $repository"
    [[ $line =~ ^[0-9a-f]{40}[[:space:]]+refs/heads/main$ ]] || die "invalid main ref from $repository"
    printf '%s\n' "${BASH_REMATCH[0]%%[[:space:]]*}"
}

digest_for() {
    local repository=$1 sha=$2 reference
    reference=$(docker_cli image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' \
        "$repository:$sha" | awk -v prefix="$repository@sha256:" 'index($0, prefix) == 1 { print; exit }') || return 1
    valid_image "$repository" "$reference" || die "could not resolve immutable digest for $repository:$sha"
    printf '%s\n' "$reference"
}

resolve_production_image() {
    local repository=$1 target_sha=$2 current_sha=$3 current_image=$4
    if [[ $target_sha == "$current_sha" ]]; then
        printf '%s\n' "$current_image"
    else
        docker_cli pull "$repository:$target_sha" >/dev/null || return 1
        digest_for "$repository" "$target_sha"
    fi
}

cleanup_failed_staging_resolution() {
    local repository=$1 target_sha=$2 target_image=$3 target_tag=$4 current_image=$5
    if [[ $TARGET == staging && $target_tag == "$repository":staging-* ]]; then
        remove_image_ref "$target_tag"
    fi
    cleanup_candidate_image "$repository" "$target_sha" "$target_image" "$current_image" ''
    return 1
}

resolve_staging_image() {
    local repository=$1 target_sha=$2 target_image=$3 target_tag=$4 current_sha=$5 current_image=$6
    if [[ $target_sha == "$current_sha" && $target_image == "$current_image" ]]; then
        printf '%s\n' "$current_image"
        return 0
    fi
    [[ -n $target_tag ]] || return 1
    if ! docker_cli pull "$target_tag" >/dev/null; then
        cleanup_failed_staging_resolution "$repository" "$target_sha" "$target_image" "$target_tag" "$current_image"
        return 1
    fi
    local tag_repo_digests
    if ! tag_repo_digests=$(docker_cli image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$target_tag"); then
        cleanup_failed_staging_resolution "$repository" "$target_sha" "$target_image" "$target_tag" "$current_image"
        return 1
    fi
    if ! printf '%s\n' "$tag_repo_digests" | grep -Fx -- "$target_image" >/dev/null; then
        cleanup_failed_staging_resolution "$repository" "$target_sha" "$target_image" "$target_tag" "$current_image"
        return 1
    fi
    if ! docker_cli pull "$target_image" >/dev/null; then
        cleanup_failed_staging_resolution "$repository" "$target_sha" "$target_image" "$target_tag" "$current_image"
        return 1
    fi
    local repo_digests
    if ! repo_digests=$(docker_cli image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$target_image"); then
        cleanup_failed_staging_resolution "$repository" "$target_sha" "$target_image" "$target_tag" "$current_image"
        return 1
    fi
    if ! printf '%s\n' "$repo_digests" | grep -Fx -- "$target_image" >/dev/null; then
        cleanup_failed_staging_resolution "$repository" "$target_sha" "$target_image" "$target_tag" "$current_image"
        return 1
    fi
    printf '%s\n' "$target_image"
}

github_get_to_file() {
    local url=$1 output=$2 token_file token config token_mode
    token_file="$HOME/.config/tempo-staging/github-readonly-token"
    [[ -f $token_file && ! -L $token_file ]] || return 1
    token_mode=$(stat -c '%a' "$token_file")
    [[ $token_mode == 600 ]] || return 1
    token=$(<"$token_file")
    [[ -n $token && $token != *$'\n'* && $token != *$'\r'* ]] || return 1
    config=$(mktemp)
    chmod 600 "$config"
    printf '%s\n' \
        'header = "Accept: application/vnd.github+json"' \
        'header = "X-GitHub-Api-Version: 2022-11-28"' \
        "header = \"Authorization: Bearer $token\"" \
        'fail' \
        'location' \
        'silent' \
        'show-error' > "$config"
    if ! curl --config "$config" --max-time 20 --retry 2 --retry-delay 1 "$url" > "$output"; then
        rm -f "$config"
        return 1
    fi
    rm -f "$config"
}

remote_deployment_ids() {
    local file=$1 component=$2
    python3 - "$file" "$component" <<'PY'
import json
import sys

path, component = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    deployments = json.load(handle)
if not isinstance(deployments, list):
    raise SystemExit('deployment list is not an array')
for deployment in sorted(deployments, key=lambda item: item.get('id', 0), reverse=True):
    if deployment.get('environment') != 'staging':
        continue
    payload = deployment.get('payload')
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            continue
    if isinstance(payload, dict) and payload.get('component') == component:
        print(deployment.get('id', ''))
PY
}

extract_deployment_payload() {
    local deployment_file=$1 payload_file=$2 expected_component=$3
    python3 - "$deployment_file" "$payload_file" "$expected_component" <<'PY'
import json
import sys

path, output, component = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    deployment = json.load(handle)
payload = deployment.get('payload')
if isinstance(payload, str):
    payload = json.loads(payload)
if deployment.get('environment') != 'staging' or deployment.get('creator', {}).get('login') != 'github-actions[bot]' or not isinstance(payload, dict) or payload.get('component') != component:
    raise SystemExit(1)
with open(output, 'w', encoding='utf-8') as handle:
    json.dump(payload, handle)
PY
}

status_is_success() {
    local status_file=$1
    python3 - "$status_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding='utf-8') as handle:
    statuses = json.load(handle)
if not isinstance(statuses, list) or not statuses:
    raise SystemExit(1)
latest = statuses[0]
checks = (
    latest.get('state') == 'success'
    and latest.get('creator', {}).get('login') == 'github-actions[bot]'
    and latest.get('description') == 'Immutable staging image published and ready for host reconciliation'
)
raise SystemExit(0 if checks else 1)
PY
}

workflow_run_is_trusted() {
    local run_file=$1 payload_file=$2
    python3 - "$run_file" "$payload_file" "$INTENT_WORKFLOW_PATH" <<'PY'
import json
import re
import sys

run_path, payload_path, workflow_path = sys.argv[1:]
with open(run_path, encoding='utf-8') as handle:
    run = json.load(handle)
with open(payload_path, encoding='utf-8') as handle:
    payload = json.load(handle)
workflow = payload.get('workflow', {})
dispatch_sha = workflow.get('dispatch_sha')
selected_sha = payload.get('head_sha')
checks = {
    run.get('status') == 'completed',
    run.get('conclusion') == 'success',
    run.get('event') == 'workflow_dispatch',
    run.get('head_branch') == 'main',
    run.get('path') == workflow_path,
    workflow.get('ref') == 'refs/heads/main',
    isinstance(dispatch_sha, str) and re.fullmatch(r'[0-9a-f]{40}', dispatch_sha) is not None,
    isinstance(selected_sha, str) and re.fullmatch(r'[0-9a-f]{40}', selected_sha) is not None,
    run.get('head_sha') == dispatch_sha,
    str(run.get('id')) == str(workflow.get('run_id')),
}
raise SystemExit(0 if all(checks) else 1)
PY
}

fetch_staging_intent() {
    local repository=$1 component=$2 intent_file deployments_file deployment_file payload_file status_file run_file
    if [[ ${TEMPO_DEPLOY_TEST_MODE:-0} == 1 ]]; then
        intent_file="$TEST_INTENT_DIR/$component.json"
        [[ -f $intent_file ]] || return 10
        if ! read_intent_values "$intent_file" "$repository" "$component" >/dev/null; then
            return 11
        fi
        cat "$intent_file"
        return 0
    fi

    deployments_file=$(mktemp)
    if ! github_get_to_file "$GITHUB_API_ROOT/repos/$repository/deployments?environment=staging&per_page=100" "$deployments_file"; then
        rm -f "$deployments_file"
        return 11
    fi
    local saw_candidate=0 deployment_id
    while IFS= read -r deployment_id; do
        [[ $deployment_id =~ ^[0-9]+$ ]] || continue
        saw_candidate=1
        deployment_file=$(mktemp)
        payload_file=$(mktemp)
        status_file=$(mktemp)
        run_file=$(mktemp)
        if ! github_get_to_file "$GITHUB_API_ROOT/repos/$repository/deployments/$deployment_id" "$deployment_file" || \
            ! extract_deployment_payload "$deployment_file" "$payload_file" "$component" || \
            ! read_intent_values "$payload_file" "$repository" "$component" >/dev/null; then
            rm -f "$deployment_file" "$payload_file" "$status_file" "$run_file"
            continue
        fi
        if ! github_get_to_file "$GITHUB_API_ROOT/repos/$repository/deployments/$deployment_id/statuses?per_page=10" "$status_file" || \
            ! status_is_success "$status_file"; then
            rm -f "$deployment_file" "$payload_file" "$status_file" "$run_file"
            continue
        fi
        run_id=$(python3 - "$payload_file" <<'PY'
import json
import sys
with open(sys.argv[1], encoding='utf-8') as handle:
    payload = json.load(handle)
print(payload['workflow']['run_id'])
PY
)
        if ! [[ $run_id =~ ^[0-9]+$ ]] || \
            ! github_get_to_file "$GITHUB_API_ROOT/repos/$repository/actions/runs/$run_id" "$run_file" || \
            ! workflow_run_is_trusted "$run_file" "$payload_file"; then
            rm -f "$deployment_file" "$payload_file" "$status_file" "$run_file"
            continue
        fi
        cat "$payload_file"
        rm -f "$deployments_file" "$deployment_file" "$payload_file" "$status_file" "$run_file"
        return 0
    done < <(remote_deployment_ids "$deployments_file" "$component")
    rm -f "$deployments_file"
    [[ $saw_candidate == 1 ]] && return 11
    return 10
}

resolve_staging_component() {
    local repository=$1 component=$2 current_sha=$3 current_image=$4
    local intent_json status values
    if intent_json=$(fetch_staging_intent "$repository" "$component"); then
        local intent_file
        intent_file=$(mktemp)
        printf '%s\n' "$intent_json" > "$intent_file"
        mapfile -t values < <(read_intent_values "$intent_file" "$repository" "$component")
        rm -f "$intent_file"
        [[ ${#values[@]} -eq 3 ]] || die "staging $component intent did not contain exactly one SHA, image, and publication tag"
        printf '%s\n' "${values[0]}" "${values[1]}" "${values[2]}"
        return 0
    else
        status=$?
        case $status in
            10)
                printf '%s\n' "$current_sha" "$current_image" ''
                return 0
                ;;
            *)
                die "could not validate the latest staging $component deployment intent"
                ;;
        esac
    fi
}

compose_up() {
    local api_image=$1 web_image=$2 service=$3 candidate_env status
    candidate_env=$(mktemp) || return 1
    umask 077
    {
        printf 'TEMPO_API_IMAGE=%s\nTEMPO_WEB_IMAGE=%s\n' "$api_image" "$web_image"
        [[ $TARGET == production ]] && printf 'TEMPO_PRODUCTION_ENV_FILE=%s\n' "$ENV_FILE"
    } > "$candidate_env"
    if compose_cli --env-file "$candidate_env" up -d --no-deps --force-recreate --wait "$service"; then
        status=0
    else
        status=$?
    fi
    rm -f "$candidate_env"
    return "$status"
}

persist_staging_images() {
    local api_image=$1 web_image=$2
    [[ $TARGET == staging ]] || return 0
    python3 - "$ENV_FILE" "$api_image" "$web_image" <<'PY'
import os
import stat
import sys
import tempfile
from pathlib import Path

path = Path(sys.argv[1])
api_image, web_image = sys.argv[2:]
lines = path.read_text(encoding='utf-8').splitlines(keepends=True)
values = {'TEMPO_API_IMAGE': api_image, 'TEMPO_WEB_IMAGE': web_image}
found = set()
for index, line in enumerate(lines):
    for key, value in values.items():
        if line.startswith(f'{key}='):
            lines[index] = f'{key}={value}\n'
            found.add(key)
for key, value in values.items():
    if key not in found:
        lines.append(f'{key}={value}\n')

mode = stat.S_IMODE(path.stat().st_mode)
fd, temporary = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
os.close(fd)
try:
    temporary_path = Path(temporary)
    temporary_path.write_text(''.join(lines), encoding='utf-8')
    os.chmod(temporary_path, mode)
    os.replace(temporary_path, path)
except BaseException:
    try:
        Path(temporary).unlink()
    except FileNotFoundError:
        pass
    raise
PY
}

snapshot_stateful() {
    local container
    for container in "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" "$MAILPIT_CONTAINER"; do
        STATEFUL_IDS[$container]=$(docker_cli inspect --format '{{.Id}}' "$container") || return 1
    done
}

stateful_unchanged() {
    local container
    for container in "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" "$MAILPIT_CONTAINER"; do
        [[ $(docker_cli inspect --format '{{.Id}}' "$container") == "${STATEFUL_IDS[$container]}" ]] || {
            log "ERROR: stateful container changed: $container" >&2
            return 1
        }
    done
}

verify_rollout() {
    [[ $(container_image "$API_CONTAINER") == "$1" ]] || return 1
    [[ $(container_image "$WEB_CONTAINER") == "$2" ]] || return 1
    curl --fail --silent --show-error --max-time 15 --retry 2 --retry-delay 1 --output /dev/null "$API_ROUTE_URL" && \
        curl --fail --silent --show-error --max-time 15 --retry 2 --retry-delay 1 --output /dev/null "$WEB_ROUTE_URL" && \
        stateful_unchanged
}

run_staging_refresh() {
    local api_sha=$1 web_sha=$2 api_image=$3 web_image=$4
    [[ $TARGET == staging ]] || return 0
    [[ -f $STAGING_REFRESH_SCRIPT && ! -L $STAGING_REFRESH_SCRIPT && -O $STAGING_REFRESH_SCRIPT && -x $STAGING_REFRESH_SCRIPT ]] || \
        die 'staging refresh script is missing or not owner-controlled and executable'
    "$STAGING_REFRESH_SCRIPT" refresh --confirm-production-backup-refresh || {
        log 'ERROR: staging deployment is healthy but the production-backup refresh failed' >&2
        return 1
    }
    if ! write_state "$api_sha" "$web_sha" "$api_image" "$web_image" "$REFRESH_STATE_FILE"; then
        log 'ERROR: staging database refresh succeeded but refresh state could not be recorded' >&2
        return 1
    fi
    REFRESH_API_SHA=$api_sha
    REFRESH_WEB_SHA=$web_sha
    REFRESH_API_IMAGE=$api_image
    REFRESH_WEB_IMAGE=$web_image
    log 'staging PostgreSQL backup refresh completed after healthy image deployment'
}

retry_pending_staging_refresh() {
    local api_sha=$1 web_sha=$2 api_image=$3 web_image=$4
    [[ $TARGET == staging ]] || return 0
    [[ $REFRESH_API_SHA == "$api_sha" && $REFRESH_WEB_SHA == "$web_sha" && \
        $REFRESH_API_IMAGE == "$api_image" && $REFRESH_WEB_IMAGE == "$web_image" ]] && return 0
    log 'retrying pending staging PostgreSQL backup refresh'
    snapshot_stateful || die 'could not snapshot staging state before pending refresh retry'
    verify_rollout "$api_image" "$web_image" || die 'staging is not healthy; pending database refresh will wait'
    run_staging_refresh "$api_sha" "$web_sha" "$api_image" "$web_image"
}

rollout() {
    [[ $3 != 1 ]] || compose_up "$1" "$2" api || return 1
    [[ $4 != 1 ]] || compose_up "$1" "$2" web || return 1
    verify_rollout "$1" "$2"
}

rollback() {
    log 'attempting application-only rollback'
    rollout "$1" "$2" "$3" "$4" && log 'application-only rollback completed'
}

remove_image_ref() {
    local reference=$1 output
    if output=$(docker_cli image rm "$reference" 2>&1); then
        if docker_cli image inspect "$reference" >/dev/null 2>&1; then
            CLEANUP_FAILURE=1
            log "image reference remains after cleanup: $reference" >&2
        fi
        return 0
    fi
    CLEANUP_FAILURE=1
    log "could not remove old image $reference: ${output:-unknown error}" >&2
}

cleanup_candidate_image() {
    local repository=$1 sha=$2 image=$3 protected_one=$4 protected_two=$5
    [[ $sha =~ ^[0-9a-f]{40}$ && $image == "$repository"@sha256:* ]] || return 0
    [[ $image != "$protected_one" && $image != "$protected_two" ]] || return 0
    remove_image_ref "$repository:$sha"
    remove_image_ref "$image"
}

cleanup_candidate_images() {
    local api_changed=$1 web_changed=$2 api_sha=$3 api_image=$4 web_sha=$5 web_image=$6
    local current_api_image=$7 current_web_image=$8 stale_api_image=$9 stale_web_image=${10}
    [[ $api_changed != 1 ]] || cleanup_candidate_image \
        "$API_IMAGE_REPOSITORY" "$api_sha" "$api_image" "$current_api_image" "$stale_api_image"
    [[ $web_changed != 1 ]] || cleanup_candidate_image \
        "$WEB_IMAGE_REPOSITORY" "$web_sha" "$web_image" "$current_web_image" "$stale_web_image"
    cleanup_staging_tags "$CANDIDATE_API_TAG" "$CANDIDATE_WEB_TAG"
}

cleanup_staging_tags() {
    local api_tag=$1 web_tag=$2
    [[ $TARGET == staging ]] || return 0
    [[ -z $api_tag || $api_tag == "$API_IMAGE_REPOSITORY":staging-* ]] || return 0
    [[ -z $web_tag || $web_tag == "$WEB_IMAGE_REPOSITORY":staging-* ]] || return 0
    [[ -z $api_tag ]] || remove_image_ref "$api_tag"
    [[ -z $web_tag ]] || remove_image_ref "$web_tag"
}

prune_old_image() {
    local repository=$1 sha=$2 image=$3 protected_one=$4 protected_two=$5 bootstrap_prunable=$6
    [[ $image != "$protected_one" && $image != "$protected_two" ]] || return 0
    if [[ $image == "$repository"@sha256:* ]]; then
        [[ $sha != bootstrap || $bootstrap_prunable == 1 ]] || return 0
        remove_image_ref "$repository:$sha"
        remove_image_ref "$image"
    elif [[ $TARGET == production && ($image == "$repository":* || ($repository == "$WEB_IMAGE_REPOSITORY" && $image == tempo-api-production-web:latest)) ]]; then
        [[ $sha != bootstrap || $bootstrap_prunable == 1 ]] || return 0
        remove_image_ref "$image"
    fi
}

deploy() {
    require_target_files
    [[ $TARGET != staging ]] || {
        require_staging_daemon
        assert_staging_policy
    }
    read_state "$STATE_FILE"
    local current_api_sha=$API_SHA current_web_sha=$WEB_SHA
    local current_api_image=$API_IMAGE current_web_image=$WEB_IMAGE
    [[ $TARGET != staging ]] || load_refresh_state "$current_api_sha" "$current_web_sha" "$current_api_image" "$current_web_image"
    local stale_api_sha='' stale_web_sha='' stale_api_image='' stale_web_image=''
    local target_api_sha='' target_web_sha='' target_api_image='' target_web_image='' target_api_tag='' target_web_tag=''
    local api_changed=0 web_changed=0 web_recreate=0
    local api_bootstrap_prunable=0 web_bootstrap_prunable=0 staging_env_updated=0
    CANDIDATE_API_TAG=''
    CANDIDATE_WEB_TAG=''
    CLEANUP_FAILURE=0

    if [[ -f $ROLLBACK_FILE ]]; then
        read_state "$ROLLBACK_FILE"
        stale_api_sha=$API_SHA; stale_web_sha=$WEB_SHA
        stale_api_image=$API_IMAGE; stale_web_image=$WEB_IMAGE
    fi

    if [[ $TARGET == production ]]; then
        target_api_sha=$(main_sha "$API_REPOSITORY")
        target_web_sha=$(main_sha "$WEB_REPOSITORY")
        target_api_image=$(resolve_production_image "$API_IMAGE_REPOSITORY" "$target_api_sha" "$current_api_sha" "$current_api_image") || die 'could not prepare API image'
        if ! target_web_image=$(resolve_production_image "$WEB_IMAGE_REPOSITORY" "$target_web_sha" "$current_web_sha" "$current_web_image"); then
            cleanup_candidate_images 1 0 "$target_api_sha" "$target_api_image" "$target_web_sha" '' \
                "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
            die 'could not prepare web image'
        fi
    else
        local api_values web_values
        mapfile -t api_values < <(resolve_staging_component "$API_REPOSITORY_NAME" api "$current_api_sha" "$current_api_image")
        mapfile -t web_values < <(resolve_staging_component "$WEB_REPOSITORY_NAME" web "$current_web_sha" "$current_web_image")
        [[ ${#api_values[@]} -eq 3 && ${#web_values[@]} -eq 3 ]] || die 'staging intent resolution returned an invalid shape'
        target_api_sha=${api_values[0]}; target_api_image=${api_values[1]}; target_api_tag=${api_values[2]}
        target_web_sha=${web_values[0]}; target_web_image=${web_values[1]}; target_web_tag=${web_values[2]}
        CANDIDATE_API_TAG=$target_api_tag
        CANDIDATE_WEB_TAG=$target_web_tag
        target_api_image=$(resolve_staging_image "$API_IMAGE_REPOSITORY" "$target_api_sha" "$target_api_image" "$target_api_tag" "$current_api_sha" "$current_api_image") || die 'could not prepare API staging image'
        target_web_image=$(resolve_staging_image "$WEB_IMAGE_REPOSITORY" "$target_web_sha" "$target_web_image" "$target_web_tag" "$current_web_sha" "$current_web_image") || {
            cleanup_candidate_images 1 0 "$target_api_sha" "$target_api_image" "$target_web_sha" '' \
                "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
            die 'could not prepare web staging image'
        }
    fi

    [[ $target_api_sha == "$current_api_sha" && $target_api_image == "$current_api_image" ]] || api_changed=1
    [[ $target_web_sha == "$current_web_sha" && $target_web_image == "$current_web_image" ]] || web_changed=1
    if (( api_changed == 0 && web_changed == 0 )); then
        if [[ $TARGET == staging ]]; then
            retry_pending_staging_refresh "$current_api_sha" "$current_web_sha" "$current_api_image" "$current_web_image" || return 1
        fi
        log "no change: API $current_api_sha, web $current_web_sha"
        return 0
    fi
    if [[ $current_api_sha != bootstrap ]]; then api_bootstrap_prunable=1; fi
    if [[ $current_web_sha != bootstrap ]]; then web_bootstrap_prunable=1; fi
    web_recreate=$((api_changed || web_changed))
    log "new target refs: API $target_api_sha, web $target_web_sha"

    if ! snapshot_stateful; then
        cleanup_candidate_images "$api_changed" "$web_changed" "$target_api_sha" "$target_api_image" "$target_web_sha" "$target_web_image" \
            "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
        die 'could not snapshot target stateful containers'
    fi
    if ! cp "$STATE_FILE" "$ROLLBACK_FILE" || ! chmod 600 "$ROLLBACK_FILE"; then
        cleanup_candidate_images "$api_changed" "$web_changed" "$target_api_sha" "$target_api_image" "$target_web_sha" "$target_web_image" \
            "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
        die 'could not save rollback state'
    fi

    if ! rollout "$target_api_image" "$target_web_image" "$api_changed" "$web_recreate"; then
        if rollback "$current_api_image" "$current_web_image" "$api_changed" "$web_recreate"; then
            cleanup_candidate_images "$api_changed" "$web_changed" "$target_api_sha" "$target_api_image" "$target_web_sha" "$target_web_image" \
                "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
        else
            log 'ERROR: rollback did not complete' >&2
        fi
        return 1
    fi
    if [[ $TARGET == staging ]]; then
        if ! persist_staging_images "$target_api_image" "$target_web_image"; then
            if rollback "$current_api_image" "$current_web_image" "$api_changed" "$web_recreate"; then
                cleanup_candidate_images "$api_changed" "$web_changed" "$target_api_sha" "$target_api_image" "$target_web_sha" "$target_web_image" \
                    "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
            fi
            return 1
        fi
        staging_env_updated=1
    fi
    if ! write_state "$target_api_sha" "$target_web_sha" "$target_api_image" "$target_web_image"; then
        if (( staging_env_updated )); then
            persist_staging_images "$current_api_image" "$current_web_image" || log 'ERROR: could not restore staging image environment'
        fi
        if rollback "$current_api_image" "$current_web_image" "$api_changed" "$web_recreate"; then
            cleanup_candidate_images "$api_changed" "$web_changed" "$target_api_sha" "$target_api_image" "$target_web_sha" "$target_web_image" \
                "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
        else
            log 'ERROR: rollback did not complete after state write failure' >&2
        fi
        return 1
    fi
    if [[ $TARGET == staging ]]; then
        if ! run_staging_refresh "$target_api_sha" "$target_web_sha" "$target_api_image" "$target_web_image"; then
            cleanup_staging_tags "$target_api_tag" "$target_web_tag"
            return 1
        fi
    fi
    cleanup_staging_tags "$target_api_tag" "$target_web_tag"
    prune_old_image "$API_IMAGE_REPOSITORY" "$stale_api_sha" "$stale_api_image" "$target_api_image" "$target_web_image" "$api_bootstrap_prunable"
    prune_old_image "$WEB_IMAGE_REPOSITORY" "$stale_web_sha" "$stale_web_image" "$target_api_image" "$target_web_image" "$web_bootstrap_prunable"
    if (( CLEANUP_FAILURE )); then
        log 'WARNING: one or more candidate image references need manual cleanup' >&2
    fi
    log "deployed API $target_api_sha and web $target_web_sha"
}

run_target() {
    local action=${1-}
    need_commands
    mkdir -p "$(dirname "$LOCK_FILE")"
    exec 9>"$LOCK_FILE"
    flock -n 9 || { log 'another deployment is already running'; return 0; }
    case $action in
        --initialize)
            [[ $# -eq 1 ]] || usage
            initialize_state
            ;;
        '')
            deploy
            ;;
        *)
            usage
            ;;
    esac
}

main() {
    case ${1:-} in
        --validate-intent)
            [[ $# -eq 4 ]] || usage
            validate_intent "$2" "$3" "$4"
            ;;
        --target)
            [[ $# -ge 2 ]] || usage
            configure_target "$2"
            shift 2
            if [[ ${1:-} == --print-config ]]; then
                [[ $# -eq 1 ]] || usage
                print_config
            else
                run_target "${1:-}"
            fi
            ;;
        *)
            usage
            ;;
    esac
}

main "$@"
