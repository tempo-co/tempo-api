#!/usr/bin/env bash
set -euo pipefail

readonly script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly unit_name=tempo-staging-docker.service
readonly user_unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
readonly unit_target="$user_unit_dir/$unit_name"
readonly socket_path="${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is required}/tempo-staging/docker.sock"
readonly expected_root="$HOME/.local/share/tempo-staging/docker"
readonly rootless_script="$HOME/bin/dockerd-rootless.sh"

fail() {
  printf 'tempo rootless Docker: %s\n' "$1" >&2
  exit 1
}

[[ "$(id -u)" != 0 ]] || fail 'run this as the staging user, not root'
[[ -x "$rootless_script" ]] || fail "missing rootless daemon script: $rootless_script; run the official rootless installer first"
command -v rootlesskit >/dev/null || fail 'rootlesskit is missing; install the prerequisite packages first'
command -v slirp4netns >/dev/null || fail 'slirp4netns is missing; install the prerequisite packages first'
command -v fuse-overlayfs >/dev/null || fail 'fuse-overlayfs is missing; install the prerequisite packages first'
[[ -f "$script_dir/tempo-staging-docker.service" ]] || fail 'rootless unit file is missing'

install -D -m 0644 "$script_dir/tempo-staging-docker.service" "$unit_target"
systemctl --user daemon-reload
loginctl enable-linger "$(id -un)" 2>/dev/null || {
  [[ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || true)" == yes ]] || fail 'user lingering is not enabled; run loginctl enable-linger as an authorized administrator'
}
systemctl --user enable --now "$unit_name"

for _ in $(seq 1 30); do
  if [[ -S "$socket_path" ]]; then
    break
  fi
  sleep 2
done
[[ -S "$socket_path" ]] || fail "rootless Docker socket did not appear: $socket_path"

security_options=$(env -u DOCKER_CONTEXT DOCKER_HOST="unix://$socket_path" docker info --format '{{json .SecurityOptions}}' 2>/dev/null) || fail 'rootless Docker daemon is not reachable'
docker_root=$(env -u DOCKER_CONTEXT DOCKER_HOST="unix://$socket_path" docker info --format '{{.DockerRootDir}}' 2>/dev/null) || fail 'Docker root cannot be inspected'
[[ "$security_options" == *rootless* ]] || fail 'Docker daemon does not report rootless mode'
[[ "$docker_root" == "$expected_root" ]] || fail 'Docker root is outside the staging data root'

printf '%s\n' 'Tempo staging rootless Docker: PASS'
printf 'Socket: %s\n' "$socket_path"
printf 'Data root: %s\n' "$expected_root"
