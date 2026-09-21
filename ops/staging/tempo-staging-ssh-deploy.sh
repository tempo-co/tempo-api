#!/usr/bin/env bash
set -euo pipefail

readonly command_name='tempo-staging-ssh-deploy'
readonly runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
readonly env_file="${TEMPO_STAGING_ENV_FILE:-$HOME/.config/tempo-staging/staging.env}"
readonly state_dir="${TEMPO_STAGING_STATE_DIR:-$HOME/.local/state/tempo-staging}"
readonly deploy_script="${TEMPO_STAGING_DEPLOY_SCRIPT:-$HOME/.local/libexec/tempo-staging/tempo-staging-deploy.sh}"
readonly docker_host="${TEMPO_STAGING_DOCKER_HOST:-unix://$runtime_dir/tempo-staging/docker.sock}"
readonly expected_docker_host="unix://$runtime_dir/tempo-staging/docker.sock"
readonly docker_bin="${TEMPO_STAGING_DOCKER_BIN:-docker}"

fail() {
  printf 'tempo staging SSH deploy: %s\n' "$1" >&2
  exit 1
}

[[ "$(id -u)" != 0 ]] || fail 'the deploy account must not be root'
[[ -n "${SSH_ORIGINAL_COMMAND:-}" ]] || fail 'missing SSH original command'
[[ "$SSH_ORIGINAL_COMMAND" != *$'\n'* ]] || fail 'multiline commands are not accepted'
[[ "$docker_host" == "$expected_docker_host" ]] || fail "staging Docker host must be $expected_docker_host"
[[ -f "$env_file" && ! -L "$env_file" ]] || fail 'staging environment file is missing or a symlink'
[[ -x "$deploy_script" ]] || fail "staging deploy script is missing or not executable: $deploy_script"

mode=$(stat -c '%a' "$env_file")
mode_value=$((8#$mode))
(( mode_value == 0600 )) || fail 'staging environment file must have mode 600'
[[ ! -L "$state_dir" ]] || fail 'staging state directory must not be a symlink'
mkdir -p "$state_dir"
chmod 700 "$state_dir"
exec 9>"$state_dir/deploy.lock"
chmod 600 "$state_dir/deploy.lock"
flock -x 9

read -r -a args <<< "$SSH_ORIGINAL_COMMAND"
(( ${#args[@]} == 7 )) || fail 'unexpected command shape'
[[ "${args[0]}" == "$command_name" && "${args[1]}" == deploy ]] || fail 'unexpected command'

component="${args[2]}"
repository="${args[3]}"
pr_number="${args[4]}"
head_sha="${args[5]}"
image="${args[6]}"

case "$component" in
  api)
    expected_repository='tempo-co/tempo-api'
    image_prefix='ghcr.io/tempo-co/tempo-api@sha256:'
    image_key='TEMPO_API_IMAGE'
    image_tag_prefix='ghcr.io/tempo-co/tempo-api:staging-pr-'
    trusted_workflow_id=102921081
    ;;
  web)
    expected_repository='tempo-co/tempo-web'
    image_prefix='ghcr.io/tempo-co/tempo-web@sha256:'
    image_key='TEMPO_WEB_IMAGE'
    image_tag_prefix='ghcr.io/tempo-co/tempo-web:staging-pr-'
    trusted_workflow_id=106563842
    ;;
  *) fail 'component must be api or web' ;;
esac

[[ "$repository" == "$expected_repository" ]] || fail 'repository does not match component'
[[ "$pr_number" =~ ^[1-9][0-9]*$ ]] || fail 'PR number is invalid'
[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'head SHA is invalid'
[[ "$image" == "$image_prefix"* ]] || fail 'image must match the component digest repository'
digest="${image#"$image_prefix"}"
[[ "$digest" =~ ^[0-9a-f]{64}$ ]] || fail 'image must be an immutable digest reference'

docker_cli() {
  env -u DOCKER_CONTEXT DOCKER_HOST="$docker_host" "$docker_bin" "$@"
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

require_daemon
image_tag="${image_tag_prefix}${pr_number}-${head_sha}"
manifest_json=$(docker_cli manifest inspect --verbose "$image_tag" 2>/dev/null) || fail 'staging image tag is not available in the registry'
if ! jq -e --arg expected "sha256:$digest" 'if type == "array" then any(.[]; .Descriptor.digest == $expected) else .Descriptor.digest == $expected end' <<< "$manifest_json" >/dev/null; then
  fail 'image digest does not match the verified PR build tag'
fi

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

old_image=$(read_env_value "$image_key") || fail "$image_key is missing from the staging environment file"

gh_cli="${TEMPO_STAGING_GH_CLI:-gh}"
pr_json=$("$gh_cli" api "repos/$repository/pulls/$pr_number") || fail 'GitHub PR lookup failed'
head_repo=$(jq -r '.head.repo.full_name // ""' <<< "$pr_json")
remote_sha=$(jq -r '.head.sha // ""' <<< "$pr_json")
base_ref=$(jq -r '.base.ref // ""' <<< "$pr_json")
state=$(jq -r '.state // ""' <<< "$pr_json")
draft=$(jq -r '.draft' <<< "$pr_json")
[[ "$head_repo" == "$repository" ]] || fail 'fork PRs are not deployable'
[[ "$remote_sha" == "$head_sha" ]] || fail 'PR head SHA changed since workflow verification'
[[ "$base_ref" == main && "$state" == open && "$draft" == false ]] || fail 'PR is not an open non-draft main PR'

checks_json=$("$gh_cli" api --paginate "repos/$repository/commits/$head_sha/check-runs?per_page=100" --jq '.check_runs[]' | jq -s '{check_runs: .}') || fail 'commit check lookup failed'
statuses_json=$("$gh_cli" api --paginate "repos/$repository/commits/$head_sha/status?per_page=100" --jq '.statuses[]' | jq -s '{statuses: .}') || fail 'commit status lookup failed'
main_ci_sha=$("$gh_cli" api "repos/$repository/contents/.github/workflows/ci.yml?ref=main" --jq '.sha') || fail 'main CI workflow lookup failed'
head_ci_sha=$("$gh_cli" api "repos/$repository/contents/.github/workflows/ci.yml?ref=$head_sha" --jq '.sha') || fail 'PR CI workflow lookup failed'
[[ "$head_ci_sha" == "$main_ci_sha" ]] || fail 'PR CI workflow differs from trusted main workflow'
runs_json=$("$gh_cli" api --paginate "repos/$repository/actions/runs?head_sha=$head_sha&per_page=100" --jq '.workflow_runs[]' | jq -s '{workflow_runs: .}') || fail 'workflow run lookup failed'
trusted_run_json=$(jq -c --argjson workflow_id "$trusted_workflow_id" --arg head_sha "$head_sha" '[.workflow_runs[] | select(.workflow_id == $workflow_id and .head_sha == $head_sha and .path == ".github/workflows/ci.yml" and .check_suite_id != null)] | max_by(.id) // empty' <<< "$runs_json")
[[ -n "$trusted_run_json" ]] || fail 'trusted CI workflow run is missing for this PR head'
[[ "$(jq -r '.status' <<< "$trusted_run_json")" == completed ]] || fail 'trusted CI workflow has not completed for this PR head'
[[ "$(jq -r '.conclusion' <<< "$trusted_run_json")" == success ]] || fail 'trusted CI workflow did not succeed for this PR head'
trusted_suite_id=$(jq -r '.check_suite_id' <<< "$trusted_run_json")

check_count=$(jq --argjson suite_id "$trusted_suite_id" '[.check_runs[] | select(.check_suite.id == $suite_id)] | length' <<< "$checks_json")
status_count=$(jq '.statuses | length' <<< "$statuses_json")
failed_checks=$(jq --argjson suite_id "$trusted_suite_id" '[.check_runs[] | select(.check_suite.id == $suite_id and (.status != "completed" or (.conclusion | IN("success", "neutral", "skipped") | not)))] | length' <<< "$checks_json")
failed_statuses=$(jq '[.statuses[] | select(.state != "success")] | length' <<< "$statuses_json")
case "$repository" in
  tempo-co/tempo-api) required_checks='["Lint & Format", "Build", "Unit Tests", "E2E Tests"]' ;;
  tempo-co/tempo-web) required_checks='["Lint & Format", "Build", "E2E Tests"]' ;;
  *) fail 'repository is not an allowed staging repository' ;;
esac
missing_checks=$(jq -r --argjson suite_id "$trusted_suite_id" --argjson required "$required_checks" '[ $required[] as $name | select(([.check_runs[] | select(.check_suite.id == $suite_id and .name == $name and .status == "completed" and .conclusion == "success")] | length) == 0) | $name ] | join(",")' <<< "$checks_json")
(( check_count > 0 )) || fail 'PR has no required CI check-runs'
(( failed_checks == 0 && failed_statuses == 0 )) || fail 'PR checks are not all successful'
[[ -z "$missing_checks" ]] || fail "required PR checks are missing or unsuccessful: $missing_checks"

update_image() {
  local key="$1"
  local value="$2"
  python3 - "$env_file" "$key" "$value" <<'PY'
import os
import stat
import sys
import tempfile

path, wanted, replacement = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    lines = handle.readlines()

found = False
updated = []
for line in lines:
    stripped = line.lstrip()
    if stripped.startswith(f'{wanted}='):
        if found:
            raise SystemExit(f'duplicate environment key: {wanted}')
        updated.append(f'{wanted}={replacement}\n')
        found = True
    else:
        updated.append(line)
if not found:
    raise SystemExit(f'missing environment key: {wanted}')

mode = stat.S_IMODE(os.stat(path).st_mode)
directory = os.path.dirname(path) or '.'
fd, temporary = tempfile.mkstemp(prefix='.staging-env.', dir=directory, text=True)
os.fchmod(fd, mode)
with os.fdopen(fd, 'w', encoding='utf-8') as handle:
    handle.writelines(updated)
os.replace(temporary, path)
PY
}

update_manifest() {
  local deployed_at
  deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  mkdir -p "$state_dir"
  chmod 700 "$state_dir"
  [[ ! -L "$state_dir/deployed.json" ]] || fail 'deployment manifest must not be a symlink'
  python3 - "$state_dir/deployed.json" "$component" "$repository" "$pr_number" "$head_sha" "$image" "$deployed_at" <<'PY'
import json
import os
import sys
import tempfile

path, component, repository, pr_number, head_sha, image, deployed_at = sys.argv[1:]
try:
    with open(path, encoding='utf-8') as handle:
        manifest = json.load(handle)
except FileNotFoundError:
    manifest = {'version': 1}
if not isinstance(manifest, dict):
    raise SystemExit('deployment manifest is not an object')
manifest['version'] = 1
manifest[component] = {
    'repository': repository,
    'pr_number': int(pr_number),
    'head_sha': head_sha,
    'image': image,
    'deployed_at': deployed_at,
}
fd, temporary = tempfile.mkstemp(prefix='.deployed.', dir=os.path.dirname(path), text=True)
os.fchmod(fd, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
    handle.write('\n')
os.replace(temporary, path)
PY
}

manifest_path="$state_dir/deployed.json"
manifest_backup="$state_dir/.deployed.rollback.$$"
manifest_existed=0
if [[ -e "$manifest_path" ]]; then
  cp -p -- "$manifest_path" "$manifest_backup" || fail 'could not back up the deployment manifest'
  manifest_existed=1
fi
restore_manifest() {
  if (( manifest_existed )); then
    mv -f -- "$manifest_backup" "$manifest_path"
  else
    rm -f -- "$manifest_path" "$manifest_backup"
  fi
}
cleanup_manifest_backup() {
  rm -f -- "$manifest_backup"
}
trap cleanup_manifest_backup EXIT

update_image "$image_key" "$image"
if ! TEMPO_STAGING_ENV_FILE="$env_file" TEMPO_STAGING_STATE_DIR="$state_dir" TEMPO_STAGING_LOCK_HELD=1 TEMPO_STAGING_DOCKER_HOST="$docker_host" "$deploy_script" deploy "$component"; then
  update_image "$image_key" "$old_image"
  TEMPO_STAGING_ENV_FILE="$env_file" TEMPO_STAGING_STATE_DIR="$state_dir" TEMPO_STAGING_LOCK_HELD=1 TEMPO_STAGING_DOCKER_HOST="$docker_host" "$deploy_script" deploy "$component" >/dev/null 2>&1 || true
  fail 'staging deployment failed; previous image was restored where possible'
fi
if ! update_manifest; then
  restore_manifest
  update_image "$image_key" "$old_image"
  TEMPO_STAGING_ENV_FILE="$env_file" TEMPO_STAGING_STATE_DIR="$state_dir" TEMPO_STAGING_LOCK_HELD=1 TEMPO_STAGING_DOCKER_HOST="$docker_host" "$deploy_script" deploy "$component" >/dev/null 2>&1 || true
  fail 'staging manifest update failed; previous image was restored where possible'
fi
printf 'tempo staging deploy: PASS component=%s pr=%s sha=%s\n' "$component" "$pr_number" "$head_sha"
