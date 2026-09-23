#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$SCRIPT_DIR/../tempo-deploy.sh
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

SHA_A=$(printf 'a%.0s' {1..40}); SHA_B=$(printf 'b%.0s' {1..40})
SHA_C=$(printf 'c%.0s' {1..40}); SHA_D=$(printf 'd%.0s' {1..40})
SHA_E=$(printf 'e%.0s' {1..40}); SHA_F=$(printf 'f%.0s' {1..40})
API_OLD_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:1111111111111111111111111111111111111111111111111111111111111111
WEB_OLD_IMAGE=tempo-api-production-web:latest
API_STALE_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:7777777777777777777777777777777777777777777777777777777777777777
WEB_STALE_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:8888888888888888888888888888888888888888888888888888888888888888
API_IMAGE_REPOSITORY=ghcr.io/tempo-co/tempo-api
WEB_IMAGE_REPOSITORY=ghcr.io/tempo-co/tempo-web
WEB_LOCAL_ALIAS=tempo-api-production-web:latest
WEB_RUNNING_IMAGE=tempo-api-production-web
PROD_STAGING_API_TAG=ghcr.io/tempo-co/tempo-api:staging-123-$SHA_E
PROD_ARBITRARY_API_TAG=ghcr.io/tempo-co/tempo-api:release-candidate
export SHA_A SHA_B SHA_C SHA_D SHA_E SHA_F API_IMAGE_REPOSITORY WEB_IMAGE_REPOSITORY WEB_LOCAL_ALIAS
PROD_STALE_API_TAG=ghcr.io/tempo-co/tempo-api:$SHA_E
PROD_STALE_WEB_TAG=ghcr.io/tempo-co/tempo-web:$SHA_F
export API_OLD_IMAGE API_STALE_IMAGE WEB_STALE_IMAGE PROD_STALE_API_TAG PROD_STALE_WEB_TAG WEB_OLD_IMAGE
API_NEW_DIGEST=$(printf '3%.0s' {1..64})
WEB_NEW_DIGEST=$(printf '4%.0s' {1..64})
API_NEXT_DIGEST=$(printf '5%.0s' {1..64})
WEB_NEXT_DIGEST=$(printf '6%.0s' {1..64})

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

assert_contains() {
    local actual
    actual=$(<"$1")
    [[ $actual == *"$2"* ]] || fail "$1 does not contain: $2"
}

assert_exact() {
    local actual
    actual=$(<"$1")
    [[ $actual == "$2" ]] || fail "$1 contains an unexpected value"
}

assert_no_stateful_compose() {
    local log
    log=$(<"$DOCKER_LOG")
    [[ $log != *' postgres'* && $log != *' redis'* && $log != *' mailpit'* ]] || \
        fail 'stateful service was targeted'
}

setup_fixture() {
    FIXTURE=$TMP_DIR/fixture-$1; BIN=$FIXTURE/bin; STATE_DIR=$FIXTURE/state
    unset FAIL_PULL FAIL_COMPOSE_ONCE PRODUCTION_SWEEP_TEST EXTRA_IMAGE_REFS FAIL_IMAGE_RM_ONCE FAIL_IMAGE_RM_MARKER
    mkdir -p "$BIN" "$STATE_DIR"
    cat > "$BIN/fake" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
command=${0##*/}
image_id_for_ref() {
    case ${1-} in
        "$PROD_STALE_API_TAG"|"$API_STALE_IMAGE") printf 'stale-api-image-id\n' ;;
        "$PROD_STALE_WEB_TAG"|"$WEB_STALE_IMAGE") printf 'stale-web-image-id\n' ;;
        "$API_OLD_IMAGE"|"$API_IMAGE_REPOSITORY:latest") printf 'old-api-image-id\n' ;;
        "$WEB_OLD_IMAGE"|"$WEB_LOCAL_ALIAS") printf 'old-web-image-id\n' ;;
        "$API_IMAGE_REPOSITORY:$TEST_API_SHA"|"$API_IMAGE_REPOSITORY@sha256:${TEST_API_DIGEST:-}") printf 'candidate-api-image-id\n' ;;
        "$WEB_IMAGE_REPOSITORY:$TEST_WEB_SHA"|"$WEB_IMAGE_REPOSITORY@sha256:${TEST_WEB_DIGEST:-}") printf 'candidate-web-image-id\n' ;;
        *tempo-web*) printf 'active-web-image-id\n' ;;
        *tempo-api*) printf 'active-api-image-id\n' ;;
        *) printf 'unmanaged-image-id\n' ;;
    esac
}
case $command in
    git)
        if [[ $* == *tempo-api* ]]; then printf '%s\trefs/heads/main\n' "$TEST_API_SHA"
        else printf '%s\trefs/heads/main\n' "$TEST_WEB_SHA"; fi ;;
curl) printf '%s\n' "$*" >> "$CURL_LOG" ;;
docker)
    printf '%s\n' "$*" >> "$DOCKER_LOG"
    if [[ ${1:-} == ps ]]; then
        if [[ ${PRODUCTION_SWEEP_TEST:-0} == 1 ]]; then
            printf '%s\n' active-api-container active-web-container stopped-stale-web-container
        fi
        exit 0
    fi
    if [[ ${1:-} == pull ]]; then
        [[ ${FAIL_PULL:-} != "$2" ]] || exit 1
        python3 - "$REMOVED_IMAGE_REFS" "$2" <<'PY'
import sys
from pathlib import Path

path, reference = Path(sys.argv[1]), sys.argv[2]
items = path.read_text(encoding='utf-8').splitlines() if path.exists() else []
path.write_text(''.join(f'{item}\n' for item in items if item != reference), encoding='utf-8')
PY
        exit 0
    fi
    if [[ ${1:-} == image && ${2:-} == ls ]]; then
        if [[ -n ${EXTRA_IMAGE_REFS:-} ]]; then
            python3 - "$REMOVED_IMAGE_REFS" <<'PY'
import os
import sys
from pathlib import Path

removed = set(Path(sys.argv[1]).read_text(encoding='utf-8').splitlines())
api_repo = os.environ['API_IMAGE_REPOSITORY']
web_repo = os.environ['WEB_IMAGE_REPOSITORY']
images = {
    os.environ['PROD_STALE_API_TAG']: os.environ['API_STALE_IMAGE'],
    os.environ['PROD_STALE_WEB_TAG']: os.environ['WEB_STALE_IMAGE'],
    f"{api_repo}:latest": os.environ['API_OLD_IMAGE'],
    f"{api_repo}:{os.environ['SHA_A']}": os.environ['API_OLD_IMAGE'],
    os.environ['WEB_LOCAL_ALIAS']: '',
}
api_sha = os.environ.get('TEST_API_SHA')
api_digest = os.environ.get('TEST_API_DIGEST')
web_sha = os.environ.get('TEST_WEB_SHA')
web_digest = os.environ.get('TEST_WEB_DIGEST')
if api_sha and api_digest:
    images[f"{api_repo}:{api_sha}"] = f"{api_repo}@sha256:{api_digest}"
if web_sha and web_digest:
    images[f"{web_repo}:{web_sha}"] = f"{web_repo}@sha256:{web_digest}"
for reference in os.environ['EXTRA_IMAGE_REFS'].splitlines():
    if not reference:
        continue
    repository, tag = reference.rsplit(':', 1)
    digest = images.get(reference, '')
    if reference in removed:
        if digest and digest not in removed:
            print(f"{repository}|<none>|{digest.split('@', 1)[1]}")
    else:
        digest_value = digest.split('@', 1)[1] if digest else '<none>'
        print(f"{repository}|{tag}|{digest_value}")
PY
        fi
        exit 0
    fi
    if [[ ${1:-} == image && ${2:-} == inspect ]]; then
        target=${@: -1}; format=''; args=("$@")
        for ((index = 0; index < ${#args[@]}; index += 1)); do
            if [[ ${args[index]} == --format ]]; then format=${args[index + 1]}; fi
        done
        if [[ $format != '{{.Id}}' && -f $REMOVED_IMAGE_REFS ]] && grep -Fxq -- "$target" "$REMOVED_IMAGE_REFS"; then exit 1; fi
        case $format in
            '{{.Id}}') image_id_for_ref "$target" ;;
            *RepoDigests*)
                case $target in
                    "$PROD_STALE_API_TAG"|"$API_STALE_IMAGE") printf '%s\n' "$API_STALE_IMAGE" ;;
                    "$PROD_STALE_WEB_TAG"|"$WEB_STALE_IMAGE") printf '%s\n' "$WEB_STALE_IMAGE" ;;
                    "$API_OLD_IMAGE"|"$API_IMAGE_REPOSITORY:latest") printf '%s\n' "$API_OLD_IMAGE" ;;
                    "$WEB_OLD_IMAGE"|"$WEB_LOCAL_ALIAS") : ;;
                    "$API_IMAGE_REPOSITORY:$TEST_API_SHA") printf '%s\n' "$API_IMAGE_REPOSITORY@sha256:${TEST_API_DIGEST:-}" ;;
                    "$WEB_IMAGE_REPOSITORY:$TEST_WEB_SHA") printf '%s\n' "$WEB_IMAGE_REPOSITORY@sha256:${TEST_WEB_DIGEST:-}" ;;
                    *tempo-api*) printf 'ghcr.io/tempo-co/tempo-api@sha256:%s\n' "${TEST_API_DIGEST:-}" ;;
                    *) printf 'ghcr.io/tempo-co/tempo-web@sha256:%s\n' "${TEST_WEB_DIGEST:-}" ;;
                esac ;;
            *)
                if [[ $target == *tempo-api/tempo-api* ]]; then printf 'ghcr.io/tempo-co/tempo-api@sha256:%s\n' "$TEST_API_DIGEST"
                else printf 'ghcr.io/tempo-co/tempo-web@sha256:%s\n' "$TEST_WEB_DIGEST"; fi ;;
        esac
        exit 0
    fi
    if [[ ${1:-} == inspect ]]; then
            format=${3-}; target=${@: -1}
            if [[ $format == '{{.Image}}' ]]; then
                case $target in
                    active-api-container)
                        [[ -s $RUNTIME_API_FILE ]] && image_ref=$(<"$RUNTIME_API_FILE") || image_ref=$TEST_CURRENT_API_IMAGE
                        image_id_for_ref "$image_ref" ;;
                    active-web-container)
                        [[ -s $RUNTIME_WEB_FILE ]] && image_ref=$(<"$RUNTIME_WEB_FILE") || image_ref=$TEST_CURRENT_WEB_IMAGE
                        image_id_for_ref "$image_ref" ;;
                    stopped-stale-web-container) image_id_for_ref "$WEB_STALE_IMAGE" ;;
                    *) printf 'unknown-image-id\n' ;;
                esac
            else
                case $target in
                    tempo-api-production-api-1) [[ -s $RUNTIME_API_FILE ]] && printf '%s\n' "$(<"$RUNTIME_API_FILE")" || printf '%s\n' "$TEST_CURRENT_API_IMAGE" ;;
                    tempo-api-production-web-1) [[ -s $RUNTIME_WEB_FILE ]] && printf '%s\n' "$(<"$RUNTIME_WEB_FILE")" || printf '%s\n' "$TEST_CURRENT_WEB_IMAGE" ;;
                    tempo-api-production-postgres-1) printf 'postgres-id\n' ;;
                    tempo-api-production-redis-1) printf 'redis-id\n' ;;
                    tempo-api-production-mailpit-1) printf 'mailpit-id\n' ;;
                    *) printf 'unknown-id\n' ;;
                esac
            fi
            exit 0
    fi
        if [[ ${1:-} == compose ]]; then
            [[ -z ${TEMPO_API_IMAGE+x} && -z ${TEMPO_WEB_IMAGE+x} ]] || exit 2
            service=${@: -1}; args=("$@"); candidate=''
            for ((i=0; i<${#args[@]}; i++)); do
                [[ ${args[i]} == --env-file ]] && candidate=${args[i+1]}
            done
            api_image=''; web_image=''
            while IFS= read -r line; do
                case $line in
                    TEMPO_API_IMAGE=*) api_image=${line#*=} ;;
                    TEMPO_WEB_IMAGE=*) web_image=${line#*=} ;;
                esac
            done < "$candidate"
            if [[ $service == web && ${FAIL_COMPOSE_ONCE:-} == web && ! -e $COMPOSE_FAILURE_MARKER ]]; then
                : > "$COMPOSE_FAILURE_MARKER"; exit 1
            fi
            [[ $service != api ]] || printf '%s\n' "$api_image" > "$RUNTIME_API_FILE"
            [[ $service != web ]] || printf '%s\n' "$web_image" > "$RUNTIME_WEB_FILE"
            exit 0
        fi
        if [[ ${1:-} == image && ${2:-} == rm ]]; then
            reference=${3:-}
            if [[ ${FAIL_IMAGE_RM_ONCE:-} == "$reference" && ! -e $FAIL_IMAGE_RM_MARKER ]]; then
                : > "$FAIL_IMAGE_RM_MARKER"
                printf 'synthetic one-time image removal failure: %s\n' "$reference" >&2
                exit 1
            fi
            printf '%s\n' "$reference" >> "$REMOVED_IMAGE_REFS"
            exit 0
        fi
        exit 0 ;;
esac
EOF
    ln -s fake "$BIN/git"; ln -s fake "$BIN/curl"; ln -s fake "$BIN/docker"
    chmod +x "$BIN/fake"
    : > "$FIXTURE/docker.log"; : > "$FIXTURE/curl.log"
    : > "$FIXTURE/removed-image-refs"
    : > "$FIXTURE/runtime-api"; : > "$FIXTURE/runtime-web"
    touch "$FIXTURE/production.compose.yml" "$FIXTURE/production.env"
    export PATH="$BIN:$PATH" DOCKER_LOG="$FIXTURE/docker.log" CURL_LOG="$FIXTURE/curl.log"
    export TEMPO_DEPLOY_TEST_MODE=1 TEMPO_DEPLOY_TEST_ROOT="$FIXTURE"
    export RUNTIME_API_FILE="$FIXTURE/runtime-api" RUNTIME_WEB_FILE="$FIXTURE/runtime-web"
    export COMPOSE_FAILURE_MARKER="$FIXTURE/compose-failed"
    export REMOVED_IMAGE_REFS="$FIXTURE/removed-image-refs"
    export TEMPO_DEPLOY_COMPOSE_FILE="$FIXTURE/production.compose.yml"
    export TEMPO_DEPLOY_STATE_FILE="$STATE_DIR/images.env" TEMPO_DEPLOY_LOCK_FILE="$STATE_DIR/deploy.lock"
    export TEMPO_PRODUCTION_ENV_FILE="$FIXTURE/production.env"
    export TEMPO_DEPLOY_API_CONTAINER=tempo-api-production-api-1 TEMPO_DEPLOY_WEB_CONTAINER=tempo-api-production-web-1
    export TEMPO_DEPLOY_POSTGRES_CONTAINER=tempo-api-production-postgres-1 TEMPO_DEPLOY_REDIS_CONTAINER=tempo-api-production-redis-1
    export TEMPO_DEPLOY_MAILPIT_CONTAINER=tempo-api-production-mailpit-1
}

write_active_state() {
    printf 'TEMPO_API_SHA=%s\nTEMPO_WEB_SHA=%s\nTEMPO_API_IMAGE=%s\nTEMPO_WEB_IMAGE=%s\n' \
        "$SHA_A" "$SHA_B" "$API_OLD_IMAGE" "$WEB_OLD_IMAGE" > "$TEMPO_DEPLOY_STATE_FILE"
}

set_target() {
    TEST_API_SHA=$SHA_C; TEST_WEB_SHA=$SHA_D
    TEST_API_DIGEST=$API_NEW_DIGEST; TEST_WEB_DIGEST=$WEB_NEW_DIGEST
    TEST_CURRENT_API_IMAGE=$API_OLD_IMAGE; TEST_CURRENT_WEB_IMAGE=$WEB_OLD_IMAGE
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST TEST_WEB_DIGEST TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
}

run_deploy() {
    bash "$SCRIPT" --target production "$@"
}

run_initialize_test() {
    setup_fixture initialize
    TEST_CURRENT_API_IMAGE=ghcr.io/tempo-co/tempo-api:latest; TEST_CURRENT_WEB_IMAGE=$WEB_RUNNING_IMAGE
    export TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
    run_deploy --initialize
    assert_contains "$TEMPO_DEPLOY_STATE_FILE" 'TEMPO_API_SHA=bootstrap'
    assert_contains "$TEMPO_DEPLOY_STATE_FILE" 'TEMPO_WEB_IMAGE=tempo-api-production-web:latest'
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" 'TEMPO_WEB_SHA=bootstrap'
    local log; log=$(<"$DOCKER_LOG")
    [[ $log != *' pull '* && $log != *compose* ]] || fail 'initialization changed application containers'
}

run_bootstrap_cleanup_test() {
    setup_fixture bootstrap-cleanup
    TEST_CURRENT_API_IMAGE=ghcr.io/tempo-co/tempo-api:latest; TEST_CURRENT_WEB_IMAGE=$WEB_RUNNING_IMAGE
    export TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
    run_deploy --initialize
    export EXTRA_IMAGE_REFS="$(printf '%s\n%s' "$API_IMAGE_REPOSITORY:latest" "$WEB_LOCAL_ALIAS")"

    set_target; run_deploy
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" 'TEMPO_API_SHA=bootstrap'
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" 'TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api:latest'
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" 'TEMPO_WEB_IMAGE=tempo-api-production-web:latest'
    local first_log; first_log=$(<"$DOCKER_LOG")
    [[ $first_log != *'image rm ghcr.io/tempo-co/tempo-api:latest'* ]] || fail 'first deployment removed API bootstrap rollback image'
    [[ $first_log != *'image rm tempo-api-production-web:latest'* ]] || fail 'first deployment removed web bootstrap rollback image'
    TEST_API_SHA=$SHA_A; TEST_WEB_SHA=$SHA_D; TEST_API_DIGEST=$(printf '5%.0s' {1..64})
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST
    run_deploy

    assert_contains "$DOCKER_LOG" 'image rm ghcr.io/tempo-co/tempo-api:latest'
    assert_contains "$DOCKER_LOG" 'image rm tempo-api-production-web:latest'
    assert_no_stateful_compose
}

run_noop_test() {
    setup_fixture noop; TEST_API_SHA=$SHA_A; TEST_WEB_SHA=$SHA_B; export TEST_API_SHA TEST_WEB_SHA
    write_active_state; run_deploy
    if grep -Eq '(^| )(pull|up|down|rm|tag|restart|stop|start|exec)( |$)' "$DOCKER_LOG"; then
        fail 'no-op polled and mutated Docker images or containers'
    fi
}

run_production_cleanup_retry_test() {
    setup_fixture production-cleanup-retry
    TEST_API_SHA=$SHA_C; TEST_WEB_SHA=$SHA_D
    TEST_API_DIGEST=$API_NEW_DIGEST; TEST_WEB_DIGEST=$WEB_NEW_DIGEST
    TEST_CURRENT_API_IMAGE=$API_OLD_IMAGE; TEST_CURRENT_WEB_IMAGE=$WEB_OLD_IMAGE
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST TEST_WEB_DIGEST TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
    write_active_state
    cp "$TEMPO_DEPLOY_STATE_FILE" "$TEMPO_DEPLOY_STATE_FILE.rollback"
    export PRODUCTION_SWEEP_TEST=1
    export EXTRA_IMAGE_REFS="$(printf '%s\n' "$API_IMAGE_REPOSITORY:$SHA_C" "$WEB_IMAGE_REPOSITORY:$SHA_D" "$PROD_STALE_API_TAG" "$PROD_STALE_WEB_TAG" "$PROD_STAGING_API_TAG" "$PROD_ARBITRARY_API_TAG")"
    export FAIL_IMAGE_RM_ONCE="$API_STALE_IMAGE" FAIL_IMAGE_RM_MARKER="$FIXTURE/image-rm-failed"

    run_deploy
    [[ -e $FAIL_IMAGE_RM_MARKER ]] || fail 'production digest-removal failure was not injected'
    assert_contains "$REMOVED_IMAGE_REFS" "$PROD_STALE_API_TAG"
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$API_STALE_IMAGE"* ]] || fail 'failed production digest removal was marked successful'
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$PROD_STALE_WEB_TAG"* ]] || fail 'production cleanup removed a stopped-container image tag'
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$WEB_STALE_IMAGE"* ]] || fail 'production cleanup removed a stopped-container image digest'
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$PROD_STAGING_API_TAG"* ]] || fail 'production cleanup removed a staging-tagged image'
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$PROD_ARBITRARY_API_TAG"* ]] || fail 'production cleanup removed an unmanaged image tag'
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$API_IMAGE_REPOSITORY:$SHA_C"* ]] || fail 'production cleanup removed the active API image'
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$WEB_IMAGE_REPOSITORY:$SHA_D"* ]] || fail 'production cleanup removed the active web image'

    : > "$DOCKER_LOG"
    run_deploy
    assert_contains "$REMOVED_IMAGE_REFS" "$API_STALE_IMAGE"
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$PROD_STALE_WEB_TAG"* ]] || fail 'production retry removed a stopped-container image tag'
    [[ $(<"$REMOVED_IMAGE_REFS") != *"$WEB_STALE_IMAGE"* ]] || fail 'production retry removed a stopped-container image digest'
    assert_contains "$DOCKER_LOG" 'image ls --all --digests --no-trunc'
}

run_failed_pull_test() {
    setup_fixture failed-pull; set_target; write_active_state
    export FAIL_PULL=ghcr.io/tempo-co/tempo-web:$TEST_WEB_SHA
    if run_deploy; then fail 'failed web pull unexpectedly succeeded'; fi
    [[ ! -s $CURL_LOG ]] || fail 'failed pull reached health checks'
    assert_no_stateful_compose
}

run_failed_pull_cleanup_test() {
    setup_fixture failed-pull-cleanup; set_target; write_active_state
    export EXTRA_IMAGE_REFS="$API_IMAGE_REPOSITORY:$TEST_API_SHA"
    export FAIL_PULL=ghcr.io/tempo-co/tempo-web:$TEST_WEB_SHA
    if run_deploy; then fail 'failed web pull unexpectedly succeeded'; fi
    assert_contains "$DOCKER_LOG" "image rm ghcr.io/tempo-co/tempo-api:$TEST_API_SHA"
    assert_contains "$DOCKER_LOG" "image rm ghcr.io/tempo-co/tempo-api@sha256:$TEST_API_DIGEST"
    assert_no_stateful_compose
}

run_failed_rollout_cleanup_test() {
    setup_fixture failed-rollout-cleanup; set_target; write_active_state
    printf '%s\n' "TEMPO_API_SHA=$SHA_E" "TEMPO_WEB_SHA=$SHA_F" "TEMPO_API_IMAGE=$API_STALE_IMAGE" "TEMPO_WEB_IMAGE=$WEB_STALE_IMAGE" > "$TEMPO_DEPLOY_STATE_FILE.rollback"
    export EXTRA_IMAGE_REFS="$(printf '%s\n' "$API_IMAGE_REPOSITORY:$TEST_API_SHA" "$WEB_IMAGE_REPOSITORY:$TEST_WEB_SHA" "$PROD_STALE_API_TAG" "$PROD_STALE_WEB_TAG")"
    export FAIL_COMPOSE_ONCE=web
    if run_deploy; then fail 'failed rollout unexpectedly succeeded'; fi
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_API_SHA=$SHA_E"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_API_IMAGE=$API_STALE_IMAGE"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_WEB_SHA=$SHA_F"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_WEB_IMAGE=$WEB_STALE_IMAGE"
    assert_contains "$DOCKER_LOG" "image rm ghcr.io/tempo-co/tempo-api:$TEST_API_SHA"
    assert_contains "$DOCKER_LOG" "image rm ghcr.io/tempo-co/tempo-api@sha256:$TEST_API_DIGEST"
    assert_contains "$DOCKER_LOG" "image rm ghcr.io/tempo-co/tempo-web:$TEST_WEB_SHA"
    assert_contains "$DOCKER_LOG" "image rm ghcr.io/tempo-co/tempo-web@sha256:$TEST_WEB_DIGEST"
    assert_no_stateful_compose

    run_deploy
    assert_contains "$DOCKER_LOG" "image rm ghcr.io/tempo-co/tempo-api:$SHA_E"
    assert_contains "$DOCKER_LOG" "image rm $API_STALE_IMAGE"
    assert_contains "$DOCKER_LOG" "image rm $WEB_STALE_IMAGE"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_API_SHA=$SHA_A"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_API_IMAGE=$API_OLD_IMAGE"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_WEB_SHA=$SHA_B"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_WEB_IMAGE=$WEB_OLD_IMAGE"
}

run_success_test() {
    setup_fixture success; set_target; write_active_state; cp "$TEMPO_DEPLOY_STATE_FILE" "$TEMPO_DEPLOY_STATE_FILE.rollback"
    export EXTRA_IMAGE_REFS="$(printf '%s\n%s' "$API_IMAGE_REPOSITORY:latest" "$WEB_LOCAL_ALIAS")"
    run_deploy
    assert_contains "$DOCKER_LOG" '--env-file'; assert_contains "$CURL_LOG" '/tempo/'
    assert_contains "$CURL_LOG" '/tempo/api/health'
    assert_contains "$TEMPO_DEPLOY_STATE_FILE" "TEMPO_API_SHA=$TEST_API_SHA"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_API_IMAGE=$API_OLD_IMAGE"
    local first_log; first_log=$(<"$DOCKER_LOG")
    [[ $first_log != *"image rm ghcr.io/tempo-co/tempo-api:$SHA_A"* ]] || fail 'deployment removed the image retained as API rollback'
    [[ $first_log != *"image rm $API_OLD_IMAGE"* ]] || fail 'deployment removed the API image retained as rollback'
    [[ $first_log != *"image rm $WEB_OLD_IMAGE"* ]] || fail 'deployment removed the web image retained as rollback'

    TEST_API_SHA=$SHA_E; TEST_WEB_SHA=$SHA_F
    TEST_API_DIGEST=$API_NEXT_DIGEST; TEST_WEB_DIGEST=$WEB_NEXT_DIGEST
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST TEST_WEB_DIGEST
    run_deploy

    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_API_SHA=$SHA_C"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_WEB_SHA=$SHA_D"
    assert_contains "$DOCKER_LOG" "image rm $API_IMAGE_REPOSITORY:latest"
    assert_contains "$DOCKER_LOG" "image rm $API_OLD_IMAGE"
    assert_contains "$DOCKER_LOG" "image rm $WEB_OLD_IMAGE"
    assert_no_stateful_compose
}

run_api_only_test() {
    setup_fixture api-only
    TEST_API_SHA=$SHA_C; TEST_WEB_SHA=$SHA_B
    TEST_API_DIGEST=$API_NEW_DIGEST; TEST_WEB_DIGEST=$WEB_NEW_DIGEST
    TEST_CURRENT_API_IMAGE=$API_OLD_IMAGE; TEST_CURRENT_WEB_IMAGE=$WEB_OLD_IMAGE
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST TEST_WEB_DIGEST TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
    write_active_state; run_deploy
    local log; log=$(<"$DOCKER_LOG")
    [[ $log == *' up -d --no-deps --force-recreate --wait api'* ]] || fail 'API-only update did not invoke API Compose service'
    [[ $log == *' up -d --no-deps --force-recreate --wait web'* ]] || fail 'API-only update did not recreate web proxy'
    assert_no_stateful_compose
}

run_api_only_rollback_test() {
    setup_fixture api-only-rollback; set_target; TEST_WEB_SHA=$SHA_B
    TEST_CURRENT_WEB_IMAGE=$WEB_OLD_IMAGE
    export TEST_WEB_SHA TEST_CURRENT_WEB_IMAGE
    write_active_state; export FAIL_COMPOSE_ONCE=web
    if run_deploy; then fail 'API-only web failure unexpectedly succeeded'; fi
    assert_exact "$RUNTIME_API_FILE" "$API_OLD_IMAGE"
    assert_exact "$RUNTIME_WEB_FILE" "$WEB_OLD_IMAGE"
    assert_no_stateful_compose
}

run_web_only_test() {
    setup_fixture web-only; TEST_API_SHA=$SHA_A; TEST_WEB_SHA=$SHA_D
    TEST_API_DIGEST=$API_NEW_DIGEST; TEST_WEB_DIGEST=$WEB_NEW_DIGEST
    TEST_CURRENT_API_IMAGE=$API_OLD_IMAGE; TEST_CURRENT_WEB_IMAGE=$WEB_OLD_IMAGE
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST TEST_WEB_DIGEST TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
    write_active_state; run_deploy
    local log; log=$(<"$DOCKER_LOG")
    [[ $log == *' up -d --no-deps --force-recreate --wait web'* ]] || fail 'web-only update did not invoke web Compose service'
    [[ $log != *' up -d --no-deps --force-recreate --wait api'* ]] || fail 'web-only update invoked API Compose service'
    assert_no_stateful_compose
}

run_rollback_test() {
    setup_fixture rollback; set_target; write_active_state; export FAIL_COMPOSE_ONCE=web
    if run_deploy; then fail 'failed web rollout unexpectedly succeeded'; fi
    assert_exact "$RUNTIME_API_FILE" "$API_OLD_IMAGE"; assert_exact "$RUNTIME_WEB_FILE" "$WEB_OLD_IMAGE"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE" "TEMPO_API_SHA=$SHA_A"
    assert_no_stateful_compose
}

run_initialize_test; run_bootstrap_cleanup_test; run_noop_test; run_production_cleanup_retry_test; run_failed_pull_test; run_failed_pull_cleanup_test; run_failed_rollout_cleanup_test; run_success_test; run_api_only_test; run_api_only_rollback_test; run_web_only_test; run_rollback_test
printf 'PASS: tempo production deploy script tests\n'
