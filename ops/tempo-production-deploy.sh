#!/usr/bin/env bash
set -Eeuo pipefail

readonly API_REPOSITORY='https://github.com/tempo-co/tempo-api.git'
readonly WEB_REPOSITORY='https://github.com/tempo-co/tempo-web.git'
readonly API_IMAGE_REPOSITORY='ghcr.io/tempo-co/tempo-api'
readonly WEB_IMAGE_REPOSITORY='ghcr.io/tempo-co/tempo-web'
readonly COMPOSE_PROJECT='tempo-api-production'

COMPOSE_FILE=${TEMPO_DEPLOY_COMPOSE_FILE:-/etc/tempo/production.compose.yml}
STATE_FILE=${TEMPO_DEPLOY_STATE_FILE:-/var/lib/tempo-deploy/images.env}
ROLLBACK_FILE=${STATE_FILE}.rollback
LOCK_FILE=${TEMPO_DEPLOY_LOCK_FILE:-/var/lib/tempo-deploy/deploy.lock}
PRODUCTION_ENV_FILE=${TEMPO_PRODUCTION_ENV_FILE:-/etc/tempo/production.env}
API_CONTAINER=${TEMPO_DEPLOY_API_CONTAINER:-tempo-api-production-api-1}
WEB_CONTAINER=${TEMPO_DEPLOY_WEB_CONTAINER:-tempo-api-production-web-1}
POSTGRES_CONTAINER=${TEMPO_DEPLOY_POSTGRES_CONTAINER:-tempo-api-production-postgres-1}
REDIS_CONTAINER=${TEMPO_DEPLOY_REDIS_CONTAINER:-tempo-api-production-redis-1}
MAILPIT_CONTAINER=${TEMPO_DEPLOY_MAILPIT_CONTAINER:-tempo-api-production-mailpit-1}
API_ROUTE_URL=${TEMPO_DEPLOY_API_ROUTE_URL:-http://127.0.0.1:8080/tempo/api/health}
WEB_ROUTE_URL=${TEMPO_DEPLOY_WEB_ROUTE_URL:-http://127.0.0.1:8080/tempo/}

API_SHA=''
WEB_SHA=''
API_IMAGE=''
WEB_IMAGE=''
declare -A STATEFUL_IDS=()

log() { printf 'tempo-production-deploy: %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

need_commands() {
    local command
    for command in git docker curl flock mktemp awk cp chmod mv rm mkdir dirname; do
        command -v "$command" >/dev/null 2>&1 || die "required command is missing: $command"
    done
}

valid_sha() { [[ $1 == bootstrap || $1 =~ ^[0-9a-f]{40}$ ]]; }

valid_image() {
    local repository=$1 reference=$2
    if [[ $reference == "$repository"@sha256:* ]]; then
        [[ ${reference#*@sha256:} =~ ^[0-9a-f]{64}$ ]]
    elif [[ $reference == "$repository":* ]]; then
        [[ ${reference#*:} =~ ^[[:alnum:]_.-]+$ ]]
    else
        [[ $reference == tempo-api-production-web:latest ]]
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

main_sha() {
    local repository=$1 line
    line=$(git ls-remote "$repository" refs/heads/main) || die "could not resolve main from $repository"
    [[ $line =~ ^[0-9a-f]{40}[[:space:]]+refs/heads/main$ ]] || die "invalid main ref from $repository"
    printf '%s\n' "${BASH_REMATCH[0]%%[[:space:]]*}"
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
    local api_sha=$1 web_sha=$2 api_image=$3 web_image=$4 temporary_file
    valid_sha "$api_sha" && valid_sha "$web_sha" && \
        valid_image "$API_IMAGE_REPOSITORY" "$api_image" && \
        valid_image "$WEB_IMAGE_REPOSITORY" "$web_image" || return 1
    mkdir -p "$(dirname "$STATE_FILE")"
    temporary_file=$(mktemp "${STATE_FILE}.tmp.XXXXXX") || return 1
    umask 077
    if ! printf 'TEMPO_API_SHA=%s\nTEMPO_WEB_SHA=%s\nTEMPO_API_IMAGE=%s\nTEMPO_WEB_IMAGE=%s\n' \
        "$api_sha" "$web_sha" "$api_image" "$web_image" > "$temporary_file"; then
        rm -f "$temporary_file"
        return 1
    fi
    chmod 600 "$temporary_file" && mv -f "$temporary_file" "$STATE_FILE" || {
        rm -f "$temporary_file"
        return 1
    }
}

container_image() { docker inspect --format '{{.Config.Image}}' "$1"; }

initialize_state() {
    [[ ! -e $STATE_FILE ]] || die "deployment state already exists: $STATE_FILE"
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

digest_for() {
    local repository=$1 sha=$2 reference
    reference=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' \
        "$repository:$sha" | awk -v prefix="$repository@sha256:" 'index($0, prefix) == 1 { print; exit }') || return 1
    valid_image "$repository" "$reference" || die "could not resolve immutable digest for $repository:$sha"
    printf '%s\n' "$reference"
}

resolve_image() {
    local repository=$1 target_sha=$2 current_sha=$3 current_image=$4
    if [[ $target_sha == "$current_sha" ]]; then
        printf '%s\n' "$current_image"
    else
        docker pull "$repository:$target_sha" >/dev/null || return 1
        digest_for "$repository" "$target_sha"
    fi
}

compose_up() {
    local api_image=$1 web_image=$2 service=$3 candidate_env status
    candidate_env=$(mktemp) || return 1
    umask 077
    printf 'TEMPO_API_IMAGE=%s\nTEMPO_WEB_IMAGE=%s\nTEMPO_PRODUCTION_ENV_FILE=%s\n' \
        "$api_image" "$web_image" "$PRODUCTION_ENV_FILE" > "$candidate_env"
    # Compose env_file supplies container variables; this file supplies interpolation.
    if docker compose --project-name "$COMPOSE_PROJECT" --file "$COMPOSE_FILE" \
        --env-file "$PRODUCTION_ENV_FILE" --env-file "$candidate_env" \
        up -d --no-deps --force-recreate --wait "$service"; then
        status=0
    else
        status=$?
    fi
    rm -f "$candidate_env"
    return "$status"
}

snapshot_stateful() {
    local container
    for container in "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" "$MAILPIT_CONTAINER"; do
        STATEFUL_IDS[$container]=$(docker inspect --format '{{.Id}}' "$container") || return 1
    done
}

stateful_unchanged() {
    local container
    for container in "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" "$MAILPIT_CONTAINER"; do
        [[ $(docker inspect --format '{{.Id}}' "$container") == "${STATEFUL_IDS[$container]}" ]] || {
            log "ERROR: production stateful container changed: $container" >&2
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
    if output=$(docker image rm "$reference" 2>&1); then
        return 0
    fi
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
}

prune_old_image() {
    local repository=$1 sha=$2 image=$3 protected_one=$4 protected_two=$5 bootstrap_prunable=$6
    [[ $image != "$protected_one" && $image != "$protected_two" ]] || return 0
    if [[ $image == "$repository"@sha256:* ]]; then
        [[ $sha != bootstrap || $bootstrap_prunable == 1 ]] || return 0
        remove_image_ref "$repository:$sha"
        remove_image_ref "$image"
    elif [[ $image == "$repository":* || ($repository == "$WEB_IMAGE_REPOSITORY" && $image == tempo-api-production-web:latest) ]]; then
        [[ $sha != bootstrap || $bootstrap_prunable == 1 ]] || return 0
        remove_image_ref "$image"
    fi
}

deploy() {
    [[ -r $COMPOSE_FILE ]] || die "Compose file is missing or unreadable: $COMPOSE_FILE"
    [[ -r $PRODUCTION_ENV_FILE ]] || die "production env file is missing or unreadable: $PRODUCTION_ENV_FILE"
    read_state "$STATE_FILE"
    local current_api_sha=$API_SHA current_web_sha=$WEB_SHA
    local current_api_image=$API_IMAGE current_web_image=$WEB_IMAGE
    local stale_api_sha='' stale_web_sha='' stale_api_image='' stale_web_image=''
    local target_api_sha target_web_sha target_api_image target_web_image
    local api_changed=0 web_changed=0 web_recreate=0
    local api_bootstrap_prunable=0 web_bootstrap_prunable=0

    if [[ -f $ROLLBACK_FILE ]]; then
        read_state "$ROLLBACK_FILE"
        stale_api_sha=$API_SHA; stale_web_sha=$WEB_SHA
        stale_api_image=$API_IMAGE; stale_web_image=$WEB_IMAGE
    fi
    target_api_sha=$(main_sha "$API_REPOSITORY")
    target_web_sha=$(main_sha "$WEB_REPOSITORY")
    if [[ $target_api_sha == "$current_api_sha" && $target_web_sha == "$current_web_sha" ]]; then
        log "no change: API $current_api_sha, web $current_web_sha"
        return 0
    fi
    [[ $target_api_sha == "$current_api_sha" ]] || api_changed=1
    [[ $target_web_sha == "$current_web_sha" ]] || web_changed=1
    if [[ $current_api_sha != bootstrap ]]; then api_bootstrap_prunable=1; fi
    if [[ $current_web_sha != bootstrap ]]; then web_bootstrap_prunable=1; fi
    # Nginx resolves the API service name when the web container starts.
    web_recreate=$((api_changed || web_changed))
    log "new main refs: API $target_api_sha, web $target_web_sha"
    target_api_image=$(resolve_image "$API_IMAGE_REPOSITORY" "$target_api_sha" "$current_api_sha" "$current_api_image") || die 'could not prepare API image'
    if ! target_web_image=$(resolve_image "$WEB_IMAGE_REPOSITORY" "$target_web_sha" "$current_web_sha" "$current_web_image"); then
        cleanup_candidate_images "$api_changed" 0 "$target_api_sha" "$target_api_image" "$target_web_sha" '' \
            "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
        die 'could not prepare web image'
    fi
    if ! snapshot_stateful; then
        cleanup_candidate_images "$api_changed" "$web_changed" "$target_api_sha" "$target_api_image" "$target_web_sha" "$target_web_image" \
            "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
        die 'could not snapshot production stateful containers'
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
    if ! write_state "$target_api_sha" "$target_web_sha" "$target_api_image" "$target_web_image"; then
        if rollback "$current_api_image" "$current_web_image" "$api_changed" "$web_recreate"; then
            cleanup_candidate_images "$api_changed" "$web_changed" "$target_api_sha" "$target_api_image" "$target_web_sha" "$target_web_image" \
                "$current_api_image" "$current_web_image" "$stale_api_image" "$stale_web_image"
        else
            log 'ERROR: rollback did not complete after state write failure' >&2
        fi
        return 1
    fi
    prune_old_image "$API_IMAGE_REPOSITORY" "$stale_api_sha" "$stale_api_image" "$target_api_image" "$target_web_image" "$api_bootstrap_prunable"
    prune_old_image "$WEB_IMAGE_REPOSITORY" "$stale_web_sha" "$stale_web_image" "$target_api_image" "$target_web_image" "$web_bootstrap_prunable"
    log "deployed API $target_api_sha and web $target_web_sha"
}

main() {
    need_commands
    mkdir -p "$(dirname "$LOCK_FILE")"
    exec 9>"$LOCK_FILE"
    flock -n 9 || { log 'another deployment is already running'; return 0; }
    case ${1:-} in
        --initialize) [[ $# -eq 1 ]] || die 'unknown argument'; initialize_state ;;
        '') deploy ;;
        *) die "unknown argument: $1" ;;
    esac
}

main "$@"
