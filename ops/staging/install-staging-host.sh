#!/usr/bin/env bash
set -euo pipefail

readonly source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly libexec_dir="$HOME/.local/libexec/tempo-staging"
readonly config_dir="$HOME/.config/tempo-staging"
readonly state_dir="$HOME/.local/state/tempo-staging"
readonly env_file="$config_dir/staging.env"
readonly ssh_dir="$HOME/.ssh"
readonly authorized_keys="$ssh_dir/authorized_keys"

fail() {
  printf 'tempo staging host install: %s\n' "$1" >&2
  exit 1
}

usage() {
  printf 'usage: %s --ssh-public-key-file PATH\n' "$0" >&2
  exit 2
}

[[ "$(id -u)" != 0 ]] || fail 'run this as the staging user, not root'
public_key_file=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-public-key-file)
      [[ $# -ge 2 ]] || usage
      public_key_file="$2"
      shift 2
      ;;
    *) usage ;;
  esac
done
[[ -n "$public_key_file" ]] || usage
[[ -f "$public_key_file" && ! -L "$public_key_file" ]] || fail 'SSH public-key file is missing or a symlink'
[[ -f "$env_file" && ! -L "$env_file" ]] || fail "create the staging env file first: $env_file"

mode=$(stat -c '%a' "$env_file")
mode_value=$((8#$mode))
(( mode_value == 0600 )) || fail 'staging env file must be mode 600'

public_key=$(<"$public_key_file")
[[ "$public_key" =~ ^ssh-ed25519[[:space:]] ]] || fail 'only ssh-ed25519 public keys are accepted'
[[ "$public_key" != *$'\n'* ]] || fail 'public-key file must contain one line'
read -r key_type key_blob _ <<< "$public_key"
[[ "$key_type" == ssh-ed25519 && "$key_blob" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] || fail 'public-key file has an invalid key identity'
key_identity="$key_type $key_blob"

mkdir -p "$libexec_dir" "$config_dir" "$state_dir" "$ssh_dir"
chmod 700 "$config_dir" "$state_dir" "$ssh_dir"

install -m 0755 "$source_dir/tempo-staging-deploy.sh" "$libexec_dir/tempo-staging-deploy.sh"
install -m 0755 "$source_dir/tempo-staging-refresh.sh" "$libexec_dir/tempo-staging-refresh.sh"
install -m 0755 "$source_dir/tempo-staging-ssh-deploy.sh" "$libexec_dir/tempo-staging-ssh-deploy.sh"
install -m 0755 "$source_dir/install-rootless-daemon.sh" "$libexec_dir/install-rootless-daemon.sh"
install -m 0644 "$source_dir/docker-compose.yml" "$libexec_dir/docker-compose.yml"
install -m 0644 "$source_dir/tempo-staging-docker.service" "$libexec_dir/tempo-staging-docker.service"
chmod 600 "$env_file"

if [[ ! -e "$authorized_keys" ]]; then
  install -m 600 /dev/null "$authorized_keys"
fi
forced_command="command=\"$libexec_dir/tempo-staging-ssh-deploy.sh\",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding,no-user-rc $key_identity"
authorized_tmp=$(mktemp "$ssh_dir/authorized_keys.XXXXXX")
trap 'rm -f "$authorized_tmp"' EXIT
awk -v key_type="$key_type" -v key_blob="$key_blob" -v forced="$forced_command" '
  {
    matching = 0
    for (field_index = 1; field_index < NF; field_index++) {
      if ($field_index == key_type && $(field_index + 1) == key_blob) {
        matching = 1
        break
      }
    }
    if (matching) {
      if (!seen) {
        print forced
        seen = 1
      }
      next
    }
    print
  }
  END {
    if (!seen) print forced
  }
' "$authorized_keys" > "$authorized_tmp"
install -m 600 "$authorized_tmp" "$authorized_keys"
rm -f "$authorized_tmp"
trap - EXIT

printf '%s\n' 'Tempo staging host integration: PASS'
printf 'Deploy user: %s\n' "$(id -un)"
printf 'Deploy command: %s\n' "$libexec_dir/tempo-staging-ssh-deploy.sh"
printf 'Environment file: %s\n' "$env_file"
printf 'Manifest: %s/deployed.json\n' "$state_dir"
