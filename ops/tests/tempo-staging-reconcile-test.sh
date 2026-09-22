#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$SCRIPT_DIR/../tempo-deploy.sh
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

SHA_OLD=$(printf 'a%.0s' {1..40})
SHA_API=$(printf 'b%.0s' {1..40})
SHA_WEB=$(printf 'c%.0s' {1..40})
DISPATCH_API_SHA=$(printf 'd%.0s' {1..40})
DISPATCH_WEB_SHA=$(printf 'e%.0s' {1..40})
API_OLD_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:$(printf '1%.0s' {1..64})
WEB_OLD_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:$(printf '2%.0s' {1..64})
API_NEW_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:$(printf '3%.0s' {1..64})
WEB_NEW_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:$(printf '4%.0s' {1..64})
API_NEW_TAG=ghcr.io/tempo-co/tempo-api:staging-456-$SHA_API
WEB_NEW_TAG=ghcr.io/tempo-co/tempo-web:staging-789-$SHA_WEB

fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

assert_contains() {
    local actual=$1 expected=$2
    [[ $actual == *"$expected"* ]] || fail "expected output to contain: $expected"
}

assert_no_docker_mutation() {
    if grep -Eq '(^| )(pull|up|down|rm|restart|stop|start|exec)( |$)' "$DOCKER_LOG"; then
        fail "$1"
    fi
}

assert_file_contains() {
    local file=$1 expected=$2 actual
    [[ -f $file ]] || fail "missing expected file: $file"
    actual=$(<"$file")
    [[ $actual == *"$expected"* ]] || fail "expected $file to contain: $expected"
}

assert_exact() {
    local file=$1 expected=$2
    [[ -f $file ]] || fail "missing expected file: $file"
    [[ $(<"$file") == "$expected" ]] || fail "unexpected content in $file"
}

setup_fixture() {
    local name=$1
    FIXTURE=$TMP_DIR/$name
    BIN=$FIXTURE/bin
    INTENTS=$FIXTURE/intents
    STATE_DIR=$FIXTURE/state
    mkdir -p "$BIN" "$INTENTS" "$STATE_DIR"
    unset FAIL_PULL FAIL_COMPOSE_ONCE

    cat > "$BIN/fake" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
command=${0##*/}
case $command in
    curl)
        printf '%s\n' "$*" >> "$CURL_LOG"
        ;;
    docker)
        printf '%s\n' "$*" >> "$DOCKER_LOG"
        if [[ ${1:-} == info ]]; then
            if [[ ${*: -1} == *SecurityOptions* ]]; then
                printf '["name=rootless"]\n'
            else
                printf '%s\n' "$STAGING_DOCKER_ROOT"
            fi
            exit 0
        fi
        if [[ ${1:-} == pull ]]; then
            [[ ${FAIL_PULL:-} != "$2" ]]
            exit $?
        fi
        if [[ ${1:-} == inspect ]]; then
            case ${@: -1} in
                tempo-staging-api-1)
                    [[ -s $RUNTIME_API_FILE ]] && cat "$RUNTIME_API_FILE" || printf '%s\n' "$CURRENT_API_IMAGE"
                    ;;
                tempo-staging-web-1)
                    [[ -s $RUNTIME_WEB_FILE ]] && cat "$RUNTIME_WEB_FILE" || printf '%s\n' "$CURRENT_WEB_IMAGE"
                    ;;
                tempo-staging-postgres-1) printf 'postgres-id\n' ;;
                tempo-staging-redis-1) printf 'redis-id\n' ;;
                tempo-staging-mailpit-1) printf 'mailpit-id\n' ;;
                *) printf 'unknown-id\n' ;;
            esac
            exit 0
        fi
        if [[ ${1:-} == image && ${2:-} == inspect ]]; then
            image=${@: -1}
            if grep -Fxq "$image" "$REMOVED_IMAGE_REFS"; then
                exit 1
            fi
            case $image in
                "$API_NEW_TAG") printf '%s\n' "$API_NEW_IMAGE" ;;
                "$WEB_NEW_TAG") printf '%s\n' "$WEB_NEW_IMAGE" ;;
                *) printf '%s\n' "$image" ;;
            esac
            exit 0
        fi
        if [[ ${1:-} == compose ]]; then
            service=${@: -1}
            args=("$@")
            candidate=''
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
                : > "$COMPOSE_FAILURE_MARKER"
                exit 1
            fi
            [[ $service != api ]] || printf '%s\n' "$api_image" > "$RUNTIME_API_FILE"
            [[ $service != web ]] || printf '%s\n' "$web_image" > "$RUNTIME_WEB_FILE"
            exit 0
        fi
        if [[ ${1:-} == image && ${2:-} == rm ]]; then
            printf '%s\n' "${@: -1}" >> "$REMOVED_IMAGE_REFS"
            exit 0
        fi
        ;;
esac
EOF
    ln -s fake "$BIN/curl"
    ln -s fake "$BIN/docker"
    chmod +x "$BIN/fake"

    : > "$FIXTURE/docker.log"
    : > "$FIXTURE/curl.log"
    : > "$FIXTURE/runtime-api"
    : > "$FIXTURE/runtime-web"
: > "$FIXTURE/removed-image-refs"
    touch "$FIXTURE/staging.compose.yml" "$FIXTURE/staging.env"
    printf 'STAGING_PUBLIC_URL=https://staging.example.invalid/tempo\n' > "$FIXTURE/staging.env"
    printf 'TEMPO_API_SHA=%s\nTEMPO_WEB_SHA=%s\nTEMPO_API_IMAGE=%s\nTEMPO_WEB_IMAGE=%s\n' \
        "$SHA_OLD" "$SHA_OLD" "$API_OLD_IMAGE" "$WEB_OLD_IMAGE" > "$STATE_DIR/images.env"
    cp "$STATE_DIR/images.env" "$STATE_DIR/images.env.rollback"

    export PATH="$BIN:$PATH"
    export DOCKER_LOG="$FIXTURE/docker.log" CURL_LOG="$FIXTURE/curl.log"
    export RUNTIME_API_FILE="$FIXTURE/runtime-api" RUNTIME_WEB_FILE="$FIXTURE/runtime-web"
    export REMOVED_IMAGE_REFS="$FIXTURE/removed-image-refs"
    export CURRENT_API_IMAGE="$API_OLD_IMAGE" CURRENT_WEB_IMAGE="$WEB_OLD_IMAGE"
    export API_NEW_TAG WEB_NEW_TAG API_NEW_IMAGE WEB_NEW_IMAGE
    export STAGING_DOCKER_ROOT="$FIXTURE/docker-root"
    export COMPOSE_FAILURE_MARKER="$FIXTURE/compose-failed"
    export TEMPO_DEPLOY_TEST_MODE=1 TEMPO_DEPLOY_TEST_ROOT="$FIXTURE"
    export TEMPO_DEPLOY_TEST_INTENT_DIR="$INTENTS"
    export TEMPO_DEPLOY_STATE_FILE="$STATE_DIR/images.env"
}

write_intents() {
    cat > "$INTENTS/api.json" <<EOF
{
  "schema_version": 1,
  "repository": "tempo-co/tempo-api",
  "component": "api",
  "environment": "staging",
  "pr_number": 123,
  "head_sha": "$SHA_API",
  "image": "$API_NEW_IMAGE",
  "image_tag": "$API_NEW_TAG",
  "workflow": {"path": ".github/workflows/staging-promote.yml", "ref": "refs/heads/main", "event": "workflow_dispatch", "run_id": 456, "dispatch_sha": "$DISPATCH_API_SHA"}
}
EOF
    cat > "$INTENTS/web.json" <<EOF
{
  "schema_version": 1,
  "repository": "tempo-co/tempo-web",
  "component": "web",
  "environment": "staging",
  "pr_number": 123,
  "head_sha": "$SHA_WEB",
  "image": "$WEB_NEW_IMAGE",
  "image_tag": "$WEB_NEW_TAG",
  "workflow": {"path": ".github/workflows/staging-promote.yml", "ref": "refs/heads/main", "event": "workflow_dispatch", "run_id": 789, "dispatch_sha": "$DISPATCH_WEB_SHA"}
}
EOF
}

run_success_test() {
    setup_fixture success
    write_intents
    bash "$SCRIPT" --target staging
    assert_contains "$(<"$DOCKER_LOG")" "pull $API_NEW_IMAGE"
    assert_contains "$(<"$DOCKER_LOG")" "pull $WEB_NEW_IMAGE"
    assert_contains "$(<"$DOCKER_LOG")" 'up -d --no-deps --force-recreate --wait api'
    assert_contains "$(<"$DOCKER_LOG")" 'up -d --no-deps --force-recreate --wait web'
    assert_contains "$(<"$CURL_LOG")" '/tempo/api/health'
    assert_contains "$(<"$CURL_LOG")" '/tempo/'
    assert_contains "$(<"$DOCKER_LOG")" "image rm $API_NEW_TAG"
    assert_contains "$(<"$DOCKER_LOG")" "image rm $WEB_NEW_TAG"
    assert_file_contains "$TEMPO_DEPLOY_STATE_FILE" "TEMPO_API_SHA=$SHA_API"
    assert_file_contains "$TEMPO_DEPLOY_STATE_FILE" "TEMPO_WEB_SHA=$SHA_WEB"
    assert_file_contains "$TEMPO_DEPLOY_STATE_FILE" "TEMPO_API_IMAGE=$API_NEW_IMAGE"
    assert_file_contains "$TEMPO_DEPLOY_STATE_FILE" "TEMPO_WEB_IMAGE=$WEB_NEW_IMAGE"
    assert_file_contains "$FIXTURE/staging.env" "TEMPO_API_IMAGE=$API_NEW_IMAGE"
    assert_file_contains "$FIXTURE/staging.env" "TEMPO_WEB_IMAGE=$WEB_NEW_IMAGE"
    assert_exact "$RUNTIME_API_FILE" "$API_NEW_IMAGE"
    assert_exact "$RUNTIME_WEB_FILE" "$WEB_NEW_IMAGE"
    local log
    log=$(<"$DOCKER_LOG")
    [[ $log != *' postgres'* && $log != *' redis'* && $log != *' mailpit'* ]] || fail 'stateful service was targeted'
}

run_resolution_failure_test() {
    setup_fixture resolution-failure
    write_intents
    export FAIL_PULL="$API_NEW_TAG"
    if bash "$SCRIPT" --target staging > "$FIXTURE/output" 2>&1; then
        fail 'failed API image resolution unexpectedly succeeded'
    fi
    assert_contains "$(<"$DOCKER_LOG")" "image rm $API_NEW_TAG"
}

run_noop_test() {
    setup_fixture noop
    cat > "$INTENTS/api.json" <<EOF
{"schema_version":1,"repository":"tempo-co/tempo-api","component":"api","environment":"staging","pr_number":123,"head_sha":"$SHA_OLD","image":"$API_OLD_IMAGE","image_tag":"ghcr.io/tempo-co/tempo-api:staging-456-$SHA_OLD","workflow":{"path":".github/workflows/staging-promote.yml","ref":"refs/heads/main","event":"workflow_dispatch","run_id":456,"dispatch_sha":"$DISPATCH_API_SHA"}}
EOF
    cat > "$INTENTS/web.json" <<EOF
{"schema_version":1,"repository":"tempo-co/tempo-web","component":"web","environment":"staging","pr_number":123,"head_sha":"$SHA_OLD","image":"$WEB_OLD_IMAGE","image_tag":"ghcr.io/tempo-co/tempo-web:staging-789-$SHA_OLD","workflow":{"path":".github/workflows/staging-promote.yml","ref":"refs/heads/main","event":"workflow_dispatch","run_id":789,"dispatch_sha":"$DISPATCH_WEB_SHA"}}
EOF
    bash "$SCRIPT" --target staging
    assert_no_docker_mutation 'staging no-op performed a Docker mutation'
    [[ ! -s $CURL_LOG ]] || fail 'staging no-op invoked route checks'
}

run_failed_intent_test() {
    setup_fixture rejected
    write_intents
    python3 - "$INTENTS/web.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding='utf-8'))
data['environment'] = 'production'
path.write_text(json.dumps(data), encoding='utf-8')
PY
    if bash "$SCRIPT" --target staging > "$FIXTURE/output" 2>&1; then
        fail 'invalid staging intent unexpectedly succeeded'
    fi
    assert_no_docker_mutation 'invalid intent reached a Docker mutation'
}

run_success_test
run_resolution_failure_test
run_noop_test
run_failed_intent_test
printf 'PASS: tempo staging image reconciliation\n'
