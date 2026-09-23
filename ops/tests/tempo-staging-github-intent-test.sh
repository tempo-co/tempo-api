#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$SCRIPT_DIR/../tempo-deploy.sh
TMP_DIR=$(mktemp -d)
trap 'kill "${SOCKET_PID:-}" 2>/dev/null || true; rm -rf "$TMP_DIR"' EXIT

HOME_FIXTURE=$TMP_DIR/home
RUNTIME_DIR=$TMP_DIR/runtime
BIN=$TMP_DIR/bin
mkdir -p "$HOME_FIXTURE/.config/tempo-staging" "$HOME_FIXTURE/.local/state/tempo-staging" "$RUNTIME_DIR/tempo-staging" "$BIN"
chmod 700 "$HOME_FIXTURE/.config/tempo-staging"
python3 - "$RUNTIME_DIR/tempo-staging/docker.sock" <<'PY' &
import socket
import sys
s=socket.socket(socket.AF_UNIX)
s.bind(sys.argv[1])
s.listen(1)
while True:
    connection, _ = s.accept()
    connection.close()
PY
SOCKET_PID=$!
printf 'synthetic-read-only-token\n' > "$HOME_FIXTURE/.config/tempo-staging/github-readonly-token"
chmod 600 "$HOME_FIXTURE/.config/tempo-staging/github-readonly-token"
mkdir -p "$HOME_FIXTURE/.config/tempo-staging/docker-config"
printf '%s\n' '{"auths":{"ghcr.io":{"auth":"synthetic"}}}' > "$HOME_FIXTURE/.config/tempo-staging/docker-config/config.json"
chmod 600 "$HOME_FIXTURE/.config/tempo-staging/docker-config/config.json"
touch "$HOME_FIXTURE/.config/tempo-staging/staging.compose.yml" "$HOME_FIXTURE/.config/tempo-staging/staging.env"
chmod 600 "$HOME_FIXTURE/.config/tempo-staging/staging.env"
printf 'production.example.invalid\n' > "$HOME_FIXTURE/.config/tempo-staging/production-origin-host"
chmod 600 "$HOME_FIXTURE/.config/tempo-staging/production-origin-host"

API_SHA=$(printf 'a%.0s' {1..40})
WEB_SHA=$(printf 'b%.0s' {1..40})
DISPATCH_API_SHA=$(printf 'c%.0s' {1..40})
DISPATCH_WEB_SHA=$(printf 'd%.0s' {1..40})
API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:$(printf '1%.0s' {1..64})
WEB_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:$(printf '2%.0s' {1..64})
API_TAG=ghcr.io/tempo-co/tempo-api:staging-401-$API_SHA
WEB_TAG=ghcr.io/tempo-co/tempo-web:staging-402-$WEB_SHA
ROLLBACK_API_SHA=$(printf 'e%.0s' {1..40})
ROLLBACK_WEB_SHA=$(printf 'f%.0s' {1..40})
ROLLBACK_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:$(printf '3%.0s' {1..64})
ROLLBACK_WEB_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:$(printf '4%.0s' {1..64})
ROLLBACK_API_TAG=ghcr.io/tempo-co/tempo-api:staging-400-$ROLLBACK_API_SHA
ROLLBACK_WEB_TAG=ghcr.io/tempo-co/tempo-web:staging-399-$ROLLBACK_WEB_SHA
STALE_API_SHA=$(printf '8%.0s' {1..40})
STALE_WEB_SHA=$(printf '9%.0s' {1..40})
STALE_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:$(printf '5%.0s' {1..64})
STALE_WEB_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:$(printf '6%.0s' {1..64})
STALE_API_TAG=ghcr.io/tempo-co/tempo-api:staging-398-$STALE_API_SHA
STALE_WEB_TAG=ghcr.io/tempo-co/tempo-web:staging-397-$STALE_WEB_SHA
UNMANAGED_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:$(printf '7%.0s' {1..64})
UNMANAGED_API_TAG=ghcr.io/tempo-co/tempo-api:latest
API_CURRENT_ID=sha256:$(printf 'a%.0s' {1..64})
WEB_CURRENT_ID=sha256:$(printf 'b%.0s' {1..64})
API_ROLLBACK_ID=sha256:$(printf 'c%.0s' {1..64})
WEB_ROLLBACK_ID=sha256:$(printf 'd%.0s' {1..64})
API_STALE_ID=sha256:$(printf 'e%.0s' {1..64})
WEB_STALE_ID=sha256:$(printf 'f%.0s' {1..64})
UNMANAGED_API_ID=sha256:$(printf '7%.0s' {1..64})
cat > "$HOME_FIXTURE/.local/state/tempo-staging/images.env" <<EOF
TEMPO_API_SHA=$API_SHA
TEMPO_WEB_SHA=$WEB_SHA
TEMPO_API_IMAGE=$API_IMAGE
TEMPO_WEB_IMAGE=$WEB_IMAGE
EOF
cat > "$HOME_FIXTURE/.local/state/tempo-staging/images.env.rollback" <<EOF
TEMPO_API_SHA=$ROLLBACK_API_SHA
TEMPO_WEB_SHA=$ROLLBACK_WEB_SHA
TEMPO_API_IMAGE=$ROLLBACK_API_IMAGE
TEMPO_WEB_IMAGE=$ROLLBACK_WEB_IMAGE
EOF
IMAGE_STATE=$TMP_DIR/docker-images.json
cat > "$IMAGE_STATE" <<EOF
{"images":[
  {"id":"$API_CURRENT_ID","tags":["$API_TAG"],"digests":["$API_IMAGE"]},
  {"id":"$WEB_CURRENT_ID","tags":["$WEB_TAG"],"digests":["$WEB_IMAGE"]},
  {"id":"$API_ROLLBACK_ID","tags":["$ROLLBACK_API_TAG"],"digests":["$ROLLBACK_API_IMAGE"]},
  {"id":"$WEB_ROLLBACK_ID","tags":["$ROLLBACK_WEB_TAG"],"digests":["$ROLLBACK_WEB_IMAGE"]},
  {"id":"$API_STALE_ID","tags":["$STALE_API_TAG"],"digests":["$STALE_API_IMAGE"]},
  {"id":"$WEB_STALE_ID","tags":["$STALE_WEB_TAG"],"digests":["$STALE_WEB_IMAGE"]},
  {"id":"$UNMANAGED_API_ID","tags":["$UNMANAGED_API_TAG"],"digests":["$UNMANAGED_API_IMAGE"]}
],"containers":[
  {"id":"active-api-container","image":"$API_CURRENT_ID"},
  {"id":"active-web-container","image":"$WEB_CURRENT_ID"},
  {"id":"stopped-container-retaining-web-image","image":"$WEB_STALE_ID"}
]}
EOF

cat > "$BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
url=${@: -1}
config=''
args=("$@")
for ((index = 0; index < ${#args[@]}; index += 1)); do
  if [[ ${args[index]} == --config ]]; then config=${args[index + 1]}; fi
done
grep -Fx 'header = "Authorization: Bearer synthetic-read-only-token"' "$config" >/dev/null || {
  printf 'missing synthetic bearer header\n' >&2
  exit 1
}
printf '%s\n' "$url" >> "$CURL_LOG"
case "$url" in
  */repos/tempo-co/tempo-api/deployments\?environment=staging\&per_page=100)
    printf '[{"id":101,"environment":"staging","payload":{"component":"api"}}]\n' ;;
  */repos/tempo-co/tempo-api/deployments/101)
    printf '{"environment":"staging","creator":{"login":"github-actions[bot]"},"payload":'; cat "$API_INTENT"; printf '}\n' ;;
  */repos/tempo-co/tempo-api/deployments/101/statuses?per_page=10)
    printf '[{"state":"success","creator":{"login":"github-actions[bot]"},"description":"Immutable staging image published and ready for host reconciliation"}]\n' ;;
  */repos/tempo-co/tempo-api/actions/runs/401)
    printf '{"id":401,"status":"completed","conclusion":"success","event":"workflow_dispatch","head_branch":"main","head_sha":"%s","path":".github/workflows/staging-promote.yml"}\n' "$DISPATCH_API_SHA" ;;
  */repos/tempo-co/tempo-web/deployments\?environment=staging\&per_page=100)
    printf '[{"id":102,"environment":"staging","payload":{"component":"web"}}]\n' ;;
  */repos/tempo-co/tempo-web/deployments/102)
    printf '{"environment":"staging","creator":{"login":"github-actions[bot]"},"payload":'; cat "$WEB_INTENT"; printf '}\n' ;;
  */repos/tempo-co/tempo-web/deployments/102/statuses?per_page=10)
    printf '[{"state":"success","creator":{"login":"github-actions[bot]"},"description":"Immutable staging image published and ready for host reconciliation"}]\n' ;;
  */repos/tempo-co/tempo-web/actions/runs/402)
    printf '{"id":402,"status":"completed","conclusion":"success","event":"workflow_dispatch","head_branch":"main","head_sha":"%s","path":".github/workflows/staging-promote.yml"}\n' "$DISPATCH_WEB_SHA" ;;
  *)
    printf 'unexpected synthetic GitHub URL: %s\n' "$url" >&2
    exit 1
    ;;
esac
EOF
cat > "$BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
if [[ ${1-} == info ]]; then
    if [[ $* == *SecurityOptions* ]]; then printf '["name=rootless"]\n'; else printf '%s\n' "$EXPECTED_ROOT"; fi
    exit 0
fi
if [[ ${1-} == ps ]]; then
    python3 - "$IMAGE_STATE" <<'PY'
import json
import sys
from pathlib import Path

state = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
for container in state['containers']:
    print(container['id'])
PY
    exit 0
fi
if [[ ${1-} == inspect ]]; then
    format=${3-}
    target=${@: -1}
    python3 - "$IMAGE_STATE" "$format" "$target" <<'PY'
import json
import sys
from pathlib import Path

path, format_string, target = sys.argv[1:]
state = json.loads(Path(path).read_text(encoding='utf-8'))
for container in state['containers']:
    if container['id'] == target:
        if format_string == '{{.Image}}':
            print(container['image'])
        elif format_string == '{{.Id}}':
            print(container['id'])
        raise SystemExit(0)
raise SystemExit(1)
PY
    exit $?
fi
if [[ ${1-} == image && ${2-} == ls ]]; then
    python3 - "$IMAGE_STATE" <<'PY'
import json
import sys
from pathlib import Path

state = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
for image in state['images']:
    for tag in image['tags']:
        repository, tag_name = tag.rsplit(':', 1)
        digest = next((item.split('@', 1)[1] for item in image['digests'] if item.startswith(f'{repository}@')), '<none>')
        print(f'{repository}|{tag_name}|{digest}')
    if not image['tags']:
        for digest in image['digests']:
            repository, digest_value = digest.split('@', 1)
            print(f'{repository}|<none>|{digest_value}')
PY
    exit 0
fi
if [[ ${1-} == image && ${2-} == inspect ]]; then
    format=''
    args=("$@")
    for ((index = 0; index < ${#args[@]}; index += 1)); do
        if [[ ${args[index]} == --format ]]; then format=${args[index + 1]}; fi
    done
    target=${args[${#args[@]}-1]}
    python3 - "$IMAGE_STATE" "$format" "$target" <<'PY'
import json
import sys
from pathlib import Path

path, format_string, target = sys.argv[1:]
state = json.loads(Path(path).read_text(encoding='utf-8'))
for image in state['images']:
    if target in image['tags'] or target in image['digests']:
        if '.RepoDigests' in format_string:
            print('\n'.join(image['digests']))
        elif '.Id' in format_string:
            print(image['id'])
        else:
            print(image['id'])
        raise SystemExit(0)
raise SystemExit(1)
PY
    exit $?
fi
if [[ ${1-} == image && ${2-} == tag ]]; then
    python3 - "$IMAGE_STATE" "${3-}" "${4-}" <<'PY'
import json
import sys
from pathlib import Path

path, image_id, tag = sys.argv[1:]
state = json.loads(Path(path).read_text(encoding='utf-8'))
for image in state['images']:
    if image['id'] == image_id:
        if tag not in image['tags']:
            image['tags'].append(tag)
        Path(path).write_text(json.dumps(state), encoding='utf-8')
        raise SystemExit(0)
raise SystemExit(1)
PY
    exit $?
fi
if [[ ${1-} == image && ${2-} == rm ]]; then
    reference=${3-}
    if [[ ${FAIL_IMAGE_RM_ONCE:-} == "$reference" && ! -e $FAIL_IMAGE_RM_MARKER ]]; then
        : > "$FAIL_IMAGE_RM_MARKER"
        printf 'synthetic one-time image removal failure: %s\n' "$reference" >&2
        exit 1
    fi
    python3 - "$IMAGE_STATE" "$reference" <<'PY'
import json
import sys
from pathlib import Path

path, reference = sys.argv[1:]
state = json.loads(Path(path).read_text(encoding='utf-8'))
for image in state['images']:
    if reference in image['tags'] or reference in image['digests']:
        if any(container['image'] == image['id'] for container in state['containers']):
            print(f'image is referenced by a container: {reference}', file=sys.stderr)
            raise SystemExit(1)
        image['tags'] = [tag for tag in image['tags'] if tag != reference]
        image['digests'] = [digest for digest in image['digests'] if digest != reference]
        state['images'] = [entry for entry in state['images'] if entry['tags'] or entry['digests']]
        Path(path).write_text(json.dumps(state), encoding='utf-8')
        raise SystemExit(0)
print(f'no such image: {reference}', file=sys.stderr)
raise SystemExit(1)
PY
    exit $?
fi
if [[ ${1-} == compose && $* == *' config '* ]]; then
    python3 - <<'PY'
import json
import os

configuration = {
    "services": {
        "api": {
            "environment": {
                "DB_HOST": "postgres",
                "DB_NAME": "tempo_staging",
                "AI_CATEGORIZATION_ENABLED": "false",
                "AI_CATEGORIZATION_WEB_SEARCH_ENABLED": "false",
                "BANKING_INTEGRATION_ENABLED": "false",
                "WEB_BASE_URL": os.environ.get("STAGING_WEB_BASE_URL", "https://staging.example.invalid/tempo"),
            },
            "networks": ["backend", "edge"],
        },
        "postgres": {"environment": {"POSTGRES_DB": "tempo_staging"}, "networks": ["backend"]},
        "redis": {"networks": ["backend"]},
        "mailpit": {"networks": ["backend", "edge"]},
        "web": {
            "ports": [{"mode": "ingress", "host_ip": "127.0.0.1", "target": 8080, "published": "8119", "protocol": "tcp"}],
            "networks": ["edge", "ingress"],
        },
    },
    "volumes": {"tempo_staging_postgres_data": {"name": "tempo-staging-postgres-data"}},
    "networks": {
        "backend": {"name": "tempo-staging-backend", "internal": True},
        "edge": {"name": "tempo-staging-edge", "internal": True},
        "ingress": {"name": "tempo-staging-ingress", "internal": False},
    },
}
print(json.dumps(configuration))
PY
    exit 0
fi
exit 99
EOF
chmod +x "$BIN/curl" "$BIN/docker"

API_INTENT=$TMP_DIR/api-intent.json
WEB_INTENT=$TMP_DIR/web-intent.json
cat > "$API_INTENT" <<EOF
{"schema_version":1,"repository":"tempo-co/tempo-api","component":"api","environment":"staging","pr_number":123,"head_sha":"$API_SHA","image":"$API_IMAGE","image_tag":"$API_TAG","workflow":{"path":".github/workflows/staging-promote.yml","ref":"refs/heads/main","event":"workflow_dispatch","run_id":401,"dispatch_sha":"$DISPATCH_API_SHA"}}
EOF
cat > "$WEB_INTENT" <<EOF
{"schema_version":1,"repository":"tempo-co/tempo-web","component":"web","environment":"staging","pr_number":123,"head_sha":"$WEB_SHA","image":"$WEB_IMAGE","image_tag":"$WEB_TAG","workflow":{"path":".github/workflows/staging-promote.yml","ref":"refs/heads/main","event":"workflow_dispatch","run_id":402,"dispatch_sha":"$DISPATCH_WEB_SHA"}}
EOF

export HOME="$HOME_FIXTURE" XDG_RUNTIME_DIR="$RUNTIME_DIR" PATH="$BIN:$PATH"
export EXPECTED_ROOT="$HOME_FIXTURE/.local/share/tempo-staging/docker"
export CURL_LOG="$TMP_DIR/curl.log" DOCKER_LOG="$TMP_DIR/docker.log"
export IMAGE_STATE
export API_INTENT WEB_INTENT API_SHA WEB_SHA DISPATCH_API_SHA DISPATCH_WEB_SHA
FAIL_IMAGE_RM_MARKER=$TMP_DIR/image-rm-failed-once
export FAIL_IMAGE_RM_ONCE="$STALE_API_IMAGE" FAIL_IMAGE_RM_MARKER
: > "$CURL_LOG"
: > "$DOCKER_LOG"

bash "$SCRIPT" --target staging
grep -F -- "--env-file $HOME_FIXTURE/.config/tempo-staging/staging.env" "$DOCKER_LOG" >/dev/null || {
    printf 'FAIL: staging policy render did not receive the staging env file\n' >&2
    exit 1
}
assert_no_docker_mutation() {
    if grep -Eq '(^| )(pull|up|down|rm|restart|stop|start|exec)( |$)' "$DOCKER_LOG"; then
        printf 'FAIL: staging trust test performed a Docker mutation\n' >&2
        exit 1
    fi
}
assert_no_deployment_actions() {
    if grep -Eq '(^| )(pull|up|down|restart|stop|start|exec)( |$)' "$DOCKER_LOG"; then
        printf 'FAIL: no-op staging poll pulled or recreated a service\n' >&2
        exit 1
    fi
}
assert_image_reference() {
    python3 - "$IMAGE_STATE" "$1" "$2" <<'PY'
import json
import sys
from pathlib import Path

path, reference, expectation = sys.argv[1:]
state = json.loads(Path(path).read_text(encoding='utf-8'))
exists = any(reference in image['tags'] or reference in image['digests'] for image in state['images'])
if exists != (expectation == 'present'):
    raise SystemExit(f'{reference} was unexpectedly {"present" if exists else "absent"}')
PY
}
assert_no_deployment_actions
assert_image_reference "$API_TAG" present
assert_image_reference "$WEB_TAG" present
assert_image_reference "$ROLLBACK_API_TAG" present
assert_image_reference "$ROLLBACK_WEB_TAG" present
assert_image_reference "$API_IMAGE" present
assert_image_reference "$WEB_IMAGE" present
assert_image_reference "$ROLLBACK_API_IMAGE" present
assert_image_reference "$ROLLBACK_WEB_IMAGE" present
assert_image_reference "$STALE_API_TAG" absent
assert_image_reference "$STALE_API_IMAGE" present
assert_image_reference "$STALE_WEB_TAG" present
assert_image_reference "$STALE_WEB_IMAGE" present
assert_image_reference "$UNMANAGED_API_TAG" present
assert_image_reference "$UNMANAGED_API_IMAGE" present
[[ -f $FAIL_IMAGE_RM_MARKER ]] || { printf 'FAIL: stale digest removal failure was not injected\n' >&2; exit 1; }

: > "$DOCKER_LOG"
bash "$SCRIPT" --target staging
assert_no_deployment_actions
assert_image_reference "$STALE_API_TAG" absent
assert_image_reference "$STALE_API_IMAGE" absent

chmod 644 "$HOME_FIXTURE/.config/tempo-staging/staging.env"
: > "$DOCKER_LOG"
if bash "$SCRIPT" --target staging >/dev/null 2>&1; then
    printf 'FAIL: permissive staging env file was accepted\n' >&2
    exit 1
fi
assert_no_docker_mutation
chmod 600 "$HOME_FIXTURE/.config/tempo-staging/staging.env"

STAGING_WEB_BASE_URL=https://production.example.invalid/other
export STAGING_WEB_BASE_URL TEMPO_DEPLOY_PRODUCTION_ENV_FILE="$TMP_DIR/attacker.env"
printf 'WEB_BASE_URL=https://attacker.example.invalid/tempo\n' > "$TMP_DIR/attacker.env"
: > "$DOCKER_LOG"
if bash "$SCRIPT" --target staging >/dev/null 2>&1; then
    printf 'FAIL: ambient production-origin override bypassed validation\n' >&2
    exit 1
fi
unset TEMPO_DEPLOY_PRODUCTION_ENV_FILE
assert_no_docker_mutation

: > "$DOCKER_LOG"
if bash "$SCRIPT" --target staging >/dev/null 2>&1; then
    printf 'FAIL: staging origin matching production hostname was accepted\n' >&2
    exit 1
fi
assert_no_docker_mutation

for expected in \
  'repos/tempo-co/tempo-api/deployments' \
  'repos/tempo-co/tempo-api/deployments/101/statuses' \
  'repos/tempo-co/tempo-api/actions/runs/401' \
  'repos/tempo-co/tempo-web/deployments' \
  'repos/tempo-co/tempo-web/deployments/102/statuses' \
  'repos/tempo-co/tempo-web/actions/runs/402'; do
    grep -F "$expected" "$CURL_LOG" >/dev/null || { printf 'FAIL: missing GitHub read: %s\n' "$expected" >&2; exit 1; }
done

python3 - "$WEB_INTENT" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding='utf-8'))
data['workflow']['path'] = 'untrusted.yml'
path.write_text(json.dumps(data), encoding='utf-8')
PY
: > "$DOCKER_LOG"
if bash "$SCRIPT" --target staging >/dev/null 2>&1; then
    printf 'FAIL: untrusted workflow intent was accepted\n' >&2
    exit 1
fi
assert_no_docker_mutation

printf 'PASS: tempo staging GitHub deployment-intent trust contract\n'
