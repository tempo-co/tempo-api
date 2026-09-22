#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$SCRIPT_DIR/../tempo-deploy.sh
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

SHA=$(printf 'a%.0s' {1..40})
DIGEST=$(printf 'b%.0s' {1..64})
DISPATCH_SHA=$(printf 'c%.0s' {1..40})

fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

assert_contains() {
    local actual=$1 expected=$2
    [[ $actual == *"$expected"* ]] || fail "expected output to contain: $expected"
}

assert_rejected() {
    local description=$1
    shift
    if "$@" >/dev/null 2>&1; then
        fail "$description was accepted"
    fi
}

intent_file="$TMP_DIR/intent.json"
cat > "$intent_file" <<EOF
{
  "schema_version": 1,
  "repository": "tempo-co/tempo-api",
  "component": "api",
  "environment": "staging",
  "pr_number": 123,
  "head_sha": "$SHA",
  "image": "ghcr.io/tempo-co/tempo-api@sha256:$DIGEST",
  "image_tag": "ghcr.io/tempo-co/tempo-api:staging-456-$SHA",
  "workflow": {
    "path": ".github/workflows/staging-promote.yml",
    "ref": "refs/heads/main",
    "event": "workflow_dispatch",
    "run_id": 456,
    "dispatch_sha": "$DISPATCH_SHA"
  }
}
EOF

[[ -x "$SCRIPT" ]] || fail 'tempo-deploy.sh is missing; target contract cannot be exercised'

run_target_config_test() {
    local output
    output=$(
        TEMPO_DEPLOY_TEST_MODE=1 \
        TEMPO_DEPLOY_TEST_ROOT="$TMP_DIR/staging-root" \
        bash "$SCRIPT" --target staging --print-config
    )
    assert_contains "$output" 'TARGET=staging'
    assert_contains "$output" 'COMPOSE_PROJECT=tempo-staging'
    assert_contains "$output" 'DOCKER_HOST=unix://'
    assert_contains "$output" '/tempo-staging/docker.sock'
    assert_contains "$output" 'STATE_SCOPE=staging'
    assert_contains "$output" 'DOCKER_CONFIG='"$HOME"'/.config/tempo-staging/docker-config'
    output=$(
        TEMPO_DEPLOY_TEST_MODE=1 \
        TEMPO_DEPLOY_TEST_ROOT="$TMP_DIR/production-root" \
        bash "$SCRIPT" --target production --print-config
    )
    assert_contains "$output" 'TARGET=production'
    assert_contains "$output" 'COMPOSE_PROJECT=tempo-api-production'
    assert_contains "$output" 'STATE_SCOPE=production'
    [[ $output != *'tempo-staging/docker.sock'* ]] || fail 'production selected the staging Docker socket'

    assert_rejected 'unknown target' \
        env TEMPO_DEPLOY_TEST_MODE=1 TEMPO_DEPLOY_TEST_ROOT="$TMP_DIR/invalid-root" \
        bash "$SCRIPT" --target review --print-config
}

write_variant() {
    local source=$1 target=$2 field=$3 value=$4
    python3 - "$source" "$target" "$field" "$value" <<'PY'
import json
import sys
from pathlib import Path

source, target, field, value = sys.argv[1:]
data = json.loads(Path(source).read_text(encoding='utf-8'))
if field == 'environment':
    data[field] = value
elif field == 'image':
    data[field] = value
else:
    data['workflow'][field] = value
Path(target).write_text(json.dumps(data), encoding='utf-8')
PY
}

run_intent_validation_test() {
    local output
    output=$(bash "$SCRIPT" --validate-intent "$intent_file" tempo-co/tempo-api api)
    assert_contains "$output" "VALID intent repository=tempo-co/tempo-api component=api head_sha=$SHA"
    assert_contains "$output" "image=ghcr.io/tempo-co/tempo-api@sha256:$DIGEST"

    assert_rejected 'wrong repository intent' \
        bash "$SCRIPT" --validate-intent "$intent_file" tempo-co/tempo-web api

    write_variant "$intent_file" "$TMP_DIR/wrong-environment.json" environment production
    assert_rejected 'wrong environment intent' \
        bash "$SCRIPT" --validate-intent "$TMP_DIR/wrong-environment.json" tempo-co/tempo-api api

    write_variant "$intent_file" "$TMP_DIR/mutable-image.json" image "ghcr.io/tempo-co/tempo-api:mutable"
    assert_rejected 'mutable image intent' \
        bash "$SCRIPT" --validate-intent "$TMP_DIR/mutable-image.json" tempo-co/tempo-api api

    write_variant "$intent_file" "$TMP_DIR/untrusted-ref.json" ref refs/heads/feature
    assert_rejected 'untrusted workflow ref intent' \
        bash "$SCRIPT" --validate-intent "$TMP_DIR/untrusted-ref.json" tempo-co/tempo-api api
}

run_systemd_isolation_test() {
    local unit_file="$SCRIPT_DIR/../systemd/tempo-staging-docker.service"
    local unit_contents
    unit_contents=$(<"$unit_file")
    assert_contains "$unit_contents" 'UMask=0077'
    assert_contains "$unit_contents" 'chmod 700'
}

run_systemd_target_test() {
    local unit_file="$SCRIPT_DIR/../systemd/tempo-staging-deploy.service"
    local unit_contents
    unit_contents=$(<"$unit_file")
    assert_contains "$unit_contents" 'ExecStart=%h/.local/bin/tempo-deploy.sh --target staging'
    [[ $unit_contents != *'ExecStart=%h/.local/bin/tempo-deploy --target staging'* ]] || \
        fail 'staging systemd unit targets the unreviewed duplicate poller'
}

run_target_config_test
run_intent_validation_test
run_systemd_target_test
run_systemd_isolation_test
printf 'PASS: tempo staging poller target and intent contracts\n'
