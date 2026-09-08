#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$SCRIPT_DIR/../tempo-production-deploy.sh
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

SHA_A=$(printf 'a%.0s' {1..40}); SHA_B=$(printf 'b%.0s' {1..40})
SHA_C=$(printf 'c%.0s' {1..40}); SHA_D=$(printf 'd%.0s' {1..40})
API_OLD_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:1111111111111111111111111111111111111111111111111111111111111111
WEB_OLD_IMAGE=tempo-api-production-web:latest
WEB_RUNNING_IMAGE=tempo-api-production-web
API_NEW_DIGEST=$(printf '3%.0s' {1..64})
WEB_NEW_DIGEST=$(printf '4%.0s' {1..64})

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
    unset FAIL_PULL FAIL_COMPOSE_ONCE
    mkdir -p "$BIN" "$STATE_DIR"
    cat > "$BIN/fake" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
command=${0##*/}
case $command in
    git)
        if [[ $* == *tempo-api* ]]; then printf '%s\trefs/heads/main\n' "$TEST_API_SHA"
        else printf '%s\trefs/heads/main\n' "$TEST_WEB_SHA"; fi ;;
    curl) printf '%s\n' "$*" >> "$CURL_LOG" ;;
    docker)
        printf '%s\n' "$*" >> "$DOCKER_LOG"
        if [[ ${1:-} == pull ]]; then [[ ${FAIL_PULL:-} != "$2" ]]; exit $?; fi
        if [[ ${1:-} == image && ${2:-} == inspect ]]; then
            if [[ ${@: -1} == *tempo-api* ]]; then printf 'ghcr.io/tempo-co/tempo-api@sha256:%s\n' "$TEST_API_DIGEST"
            else printf 'ghcr.io/tempo-co/tempo-web@sha256:%s\n' "$TEST_WEB_DIGEST"; fi
            exit 0
        fi
        if [[ ${1:-} == inspect ]]; then
            case ${@: -1} in
                tempo-api-production-api-1) [[ -s $RUNTIME_API_FILE ]] && printf '%s\n' "$(<"$RUNTIME_API_FILE")" || printf '%s\n' "$TEST_CURRENT_API_IMAGE" ;;
                tempo-api-production-web-1) [[ -s $RUNTIME_WEB_FILE ]] && printf '%s\n' "$(<"$RUNTIME_WEB_FILE")" || printf '%s\n' "$TEST_CURRENT_WEB_IMAGE" ;;
                tempo-api-production-postgres-1) printf 'postgres-id\n' ;;
                tempo-api-production-redis-1) printf 'redis-id\n' ;;
                tempo-api-production-mailpit-1) printf 'mailpit-id\n' ;;
                *) printf 'unknown-id\n' ;;
            esac
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
        [[ ${1:-} == image && ${2:-} == rm ]] || exit 0 ;;
esac
EOF
    ln -s fake "$BIN/git"; ln -s fake "$BIN/curl"; ln -s fake "$BIN/docker"
    chmod +x "$BIN/fake"
    : > "$FIXTURE/docker.log"; : > "$FIXTURE/curl.log"
    : > "$FIXTURE/runtime-api"; : > "$FIXTURE/runtime-web"
    touch "$FIXTURE/production.compose.yml" "$FIXTURE/production.env"
    export PATH="$BIN:$PATH" DOCKER_LOG="$FIXTURE/docker.log" CURL_LOG="$FIXTURE/curl.log"
    export RUNTIME_API_FILE="$FIXTURE/runtime-api" RUNTIME_WEB_FILE="$FIXTURE/runtime-web"
    export COMPOSE_FAILURE_MARKER="$FIXTURE/compose-failed"
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

run_initialize_test() {
    setup_fixture initialize
    TEST_CURRENT_API_IMAGE=ghcr.io/tempo-co/tempo-api:latest; TEST_CURRENT_WEB_IMAGE=$WEB_RUNNING_IMAGE
    export TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
    bash "$SCRIPT" --initialize
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
    bash "$SCRIPT" --initialize

    set_target; bash "$SCRIPT"
    TEST_API_SHA=$SHA_A; TEST_WEB_SHA=$SHA_D; TEST_API_DIGEST=$(printf '5%.0s' {1..64})
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST
    bash "$SCRIPT"

    assert_contains "$DOCKER_LOG" 'image rm ghcr.io/tempo-co/tempo-api:latest'
    assert_contains "$DOCKER_LOG" 'image rm tempo-api-production-web:latest'
    assert_no_stateful_compose
}

run_noop_test() {
    setup_fixture noop; TEST_API_SHA=$SHA_A; TEST_WEB_SHA=$SHA_B; export TEST_API_SHA TEST_WEB_SHA
    write_active_state; bash "$SCRIPT"
    [[ ! -s $DOCKER_LOG ]] || fail 'no-op invoked Docker'
}

run_failed_pull_test() {
    setup_fixture failed-pull; set_target; write_active_state
    export FAIL_PULL=ghcr.io/tempo-co/tempo-web:$TEST_WEB_SHA
    if bash "$SCRIPT"; then fail 'failed web pull unexpectedly succeeded'; fi
    [[ ! -s $CURL_LOG ]] || fail 'failed pull reached health checks'
    assert_no_stateful_compose
}

run_success_test() {
    setup_fixture success; set_target; write_active_state; cp "$TEMPO_DEPLOY_STATE_FILE" "$TEMPO_DEPLOY_STATE_FILE.rollback"; bash "$SCRIPT"
    assert_contains "$DOCKER_LOG" '--env-file'; assert_contains "$CURL_LOG" '/tempo/'
    assert_contains "$CURL_LOG" '/tempo/api/health'
    assert_contains "$TEMPO_DEPLOY_STATE_FILE" "TEMPO_API_SHA=$TEST_API_SHA"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE.rollback" "TEMPO_API_IMAGE=$API_OLD_IMAGE"
    assert_contains "$DOCKER_LOG" "image rm ghcr.io/tempo-co/tempo-api:$SHA_A"
    assert_contains "$DOCKER_LOG" "image rm $API_OLD_IMAGE"
    assert_no_stateful_compose
}

run_api_only_test() {
    setup_fixture api-only
    TEST_API_SHA=$SHA_C; TEST_WEB_SHA=$SHA_B
    TEST_API_DIGEST=$API_NEW_DIGEST; TEST_WEB_DIGEST=$WEB_NEW_DIGEST
    TEST_CURRENT_API_IMAGE=$API_OLD_IMAGE; TEST_CURRENT_WEB_IMAGE=$WEB_OLD_IMAGE
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST TEST_WEB_DIGEST TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
    write_active_state; bash "$SCRIPT"
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
    if bash "$SCRIPT"; then fail 'API-only web failure unexpectedly succeeded'; fi
    assert_exact "$RUNTIME_API_FILE" "$API_OLD_IMAGE"
    assert_exact "$RUNTIME_WEB_FILE" "$WEB_OLD_IMAGE"
    assert_no_stateful_compose
}

run_web_only_test() {
    setup_fixture web-only; TEST_API_SHA=$SHA_A; TEST_WEB_SHA=$SHA_D
    TEST_API_DIGEST=$API_NEW_DIGEST; TEST_WEB_DIGEST=$WEB_NEW_DIGEST
    TEST_CURRENT_API_IMAGE=$API_OLD_IMAGE; TEST_CURRENT_WEB_IMAGE=$WEB_OLD_IMAGE
    export TEST_API_SHA TEST_WEB_SHA TEST_API_DIGEST TEST_WEB_DIGEST TEST_CURRENT_API_IMAGE TEST_CURRENT_WEB_IMAGE
    write_active_state; bash "$SCRIPT"
    local log; log=$(<"$DOCKER_LOG")
    [[ $log == *' up -d --no-deps --force-recreate --wait web'* ]] || fail 'web-only update did not invoke web Compose service'
    [[ $log != *' up -d --no-deps --force-recreate --wait api'* ]] || fail 'web-only update invoked API Compose service'
    assert_no_stateful_compose
}

run_rollback_test() {
    setup_fixture rollback; set_target; write_active_state; export FAIL_COMPOSE_ONCE=web
    if bash "$SCRIPT"; then fail 'failed web rollout unexpectedly succeeded'; fi
    assert_exact "$RUNTIME_API_FILE" "$API_OLD_IMAGE"; assert_exact "$RUNTIME_WEB_FILE" "$WEB_OLD_IMAGE"
    assert_contains "$TEMPO_DEPLOY_STATE_FILE" "TEMPO_API_SHA=$SHA_A"
    assert_no_stateful_compose
}

run_initialize_test; run_bootstrap_cleanup_test; run_noop_test; run_failed_pull_test; run_success_test; run_api_only_test; run_api_only_rollback_test; run_web_only_test; run_rollback_test
printf 'PASS: tempo production deploy script tests\n'
