#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

mkdir -p "$tmp_dir/bin" "$tmp_dir/state" "$tmp_dir/config" "$tmp_dir/runtime/tempo-staging"
python3 - "$tmp_dir/runtime/tempo-staging/docker.sock" <<'PY' &
import socket
import sys
import time
server = socket.socket(socket.AF_UNIX)
server.bind(sys.argv[1])
server.listen(1)
try:
    time.sleep(60)
finally:
    server.close()
PY
socket_pid=$!
trap 'kill "$socket_pid" 2>/dev/null || true; rm -rf "$tmp_dir"' EXIT
for _ in $(seq 1 20); do
    [[ -S "$tmp_dir/runtime/tempo-staging/docker.sock" ]] && break
    sleep 0.1
done
python3 - "$tmp_dir/bin/fake-gh" "$tmp_dir/bin/fake-deploy" "$tmp_dir/bin/fake-docker" <<'PY'
import stat
import sys
from pathlib import Path

gh_path, deploy_path, docker_path = map(Path, sys.argv[1:])
gh_path.write_text('''#!/usr/bin/env python3
import json
import sys

endpoint = next((arg for arg in sys.argv[1:] if arg.startswith("repos/")), "")
if endpoint.endswith('/pulls/42'):
    print(json.dumps({"head": {"repo": {"full_name": "tempo-co/tempo-api"}, "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, "base": {"ref": "main"}, "state": "open", "draft": False}))
elif endpoint.startswith('repos/tempo-co/tempo-api/contents/.github/workflows/ci.yml?ref='):
    print(json.dumps({"sha": "trusted-ci-sha"}))
elif endpoint.startswith('repos/tempo-co/tempo-api/actions/runs?head_sha='):
    print(json.dumps([{"workflow_runs": [{"workflow_id": 102921081, "path": ".github/workflows/ci.yml", "head_sha": "a" * 40, "status": "completed", "conclusion": "success", "check_suite_id": 123}]}]))
elif endpoint.endswith('/check-runs?per_page=100'):
    print(json.dumps([{"check_runs": [{"check_suite": {"id": 123}, "name": "Lint & Format", "status": "completed", "conclusion": "success"}, {"check_suite": {"id": 123}, "name": "Build", "status": "completed", "conclusion": "success"}, {"check_suite": {"id": 123}, "name": "Unit Tests", "status": "completed", "conclusion": "success"}, {"check_suite": {"id": 123}, "name": "E2E Tests", "status": "completed", "conclusion": "success"}]}]))
elif endpoint.endswith('/status?per_page=100'):
    print(json.dumps([{"total_count": 1, "statuses": [{"state": "success"}]}]))
else:
    raise SystemExit(f"unexpected endpoint: {endpoint}")
''')
deploy_path.write_text('''#!/usr/bin/env python3
import os
from pathlib import Path
Path(os.environ["TEMPO_DEPLOY_LOG"]).write_text(" ".join(os.sys.argv[1:]))
''')
docker_path.write_text('''#!/usr/bin/env sh
case "$1 $2 $3" in
  "info --format {{json .SecurityOptions}}") printf '["name=rootless"]\\n' ;;
  "info --format {{.DockerRootDir}}") printf '%s\\n' "$HOME/.local/share/tempo-staging/docker" ;;
  "manifest inspect --verbose") printf '[{"Descriptor":{"digest":"sha256:%s"}}]\\n' eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee ;;
  *) exit 1 ;;
esac
''')
for path in (gh_path, deploy_path, docker_path):
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
PY

cat >"$tmp_dir/config/staging.env" <<'EOF'
TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
TEMPO_WEB_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
EOF
chmod 600 "$tmp_dir/config/staging.env"

export TEMPO_STAGING_ENV_FILE="$tmp_dir/config/staging.env"
export TEMPO_STAGING_STATE_DIR="$tmp_dir/state"
export TEMPO_STAGING_GH_CLI="$tmp_dir/bin/fake-gh"
export TEMPO_STAGING_DOCKER_BIN="$tmp_dir/bin/fake-docker"
export XDG_RUNTIME_DIR="$tmp_dir/runtime"
export TEMPO_STAGING_DOCKER_HOST="unix://$tmp_dir/runtime/tempo-staging/docker.sock"
export TEMPO_STAGING_DEPLOY_SCRIPT="$tmp_dir/bin/fake-deploy"
export TEMPO_DEPLOY_LOG="$tmp_dir/deploy.log"
export SSH_ORIGINAL_COMMAND='tempo-staging-ssh-deploy deploy api tempo-co/tempo-api 42 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ghcr.io/tempo-co/tempo-api@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

bash "$repo_root/ops/staging/tempo-staging-ssh-deploy.sh"

grep -Fq 'deploy api' "$tmp_dir/deploy.log"
grep -Fq 'TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' "$tmp_dir/config/staging.env"
python3 - "$tmp_dir/state/deployed.json" <<'PY'
import json
import sys
manifest = json.load(open(sys.argv[1], encoding='utf-8'))
assert manifest['api']['repository'] == 'tempo-co/tempo-api'
assert manifest['api']['pr_number'] == 42
assert manifest['api']['head_sha'] == 'a' * 40
assert manifest['api']['image'].endswith('@sha256:' + 'e' * 64)
PY

if SSH_ORIGINAL_COMMAND='tempo-staging-ssh-deploy deploy api tempo-co/tempo-api 42 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ghcr.io/tempo-co/tempo-api:latest' bash "$repo_root/ops/staging/tempo-staging-ssh-deploy.sh"; then
    echo 'mutable image unexpectedly accepted' >&2
    exit 1
fi

printf '%s\n' 'tempo staging SSH deploy contract: PASS'
