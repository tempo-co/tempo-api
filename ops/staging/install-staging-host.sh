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
key_fingerprint=$(printf '%s\n' "$public_key" | ssh-keygen -lf - 2>/dev/null | awk '$NF == "(ED25519)" {print $2; exit}')
[[ -n "$key_fingerprint" ]] || fail 'public-key file is not a valid Ed25519 public key'
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

[[ ! -L "$authorized_keys" ]] || fail 'authorized_keys must not be a symlink'
if [[ ! -e "$authorized_keys" ]]; then
  install -m 600 /dev/null "$authorized_keys"
fi

authorized_tmp=$(mktemp "$ssh_dir/authorized_keys.XXXXXX")
authorized_backup=''
authorized_install_complete=0
cleanup_authorized_keys() {
  if (( authorized_install_complete == 0 )) && [[ -n "$authorized_backup" && -f "$authorized_backup" ]]; then
    mv -f -- "$authorized_backup" "$authorized_keys" || true
  fi
  rm -f -- "$authorized_tmp" "$authorized_backup"
}
trap cleanup_authorized_keys EXIT
if [[ -e "$authorized_keys" ]]; then
  authorized_backup=$(mktemp "$ssh_dir/authorized_keys.backup.XXXXXX")
  cp -p -- "$authorized_keys" "$authorized_backup"
fi

matching_from=''
while IFS= read -r authorized_line || [[ -n "$authorized_line" ]]; do
  line_fingerprint=$(printf '%s\n' "$authorized_line" | ssh-keygen -lf - 2>/dev/null | awk '$NF == "(ED25519)" {print $2; exit}' || true)
  if [[ "$line_fingerprint" == "$key_fingerprint" ]]; then
    read -r -a fields <<< "$authorized_line"
    key_field_index=-1
    for ((field_index = 0; field_index + 1 < ${#fields[@]}; field_index++)); do
      if [[ "${fields[field_index]}" == "$key_type" && "${fields[field_index + 1]}" == "$key_blob" ]]; then
        key_field_index=$field_index
        break
      fi
    done
    (( key_field_index >= 0 )) || fail 'matching authorized key could not be parsed'
    for ((field_index = 0; field_index < key_field_index; field_index++)); do
      option_field="${fields[field_index]}"
      from_candidate=''
      if [[ "$option_field" =~ (^|,)from=\"[^\"]*\" ]]; then
        from_candidate="${BASH_REMATCH[0]#,}"
      elif [[ "$option_field" =~ (^|,)from=[^,]+ ]]; then
        from_candidate="${BASH_REMATCH[0]#*,}"
      fi
      if [[ -n "$from_candidate" ]]; then
        if [[ -n "$matching_from" && "$matching_from" != "$from_candidate" ]]; then
          fail 'matching authorized keys have conflicting from restrictions'
        fi
        matching_from="$from_candidate"
      fi
    done
    continue
  fi
  printf '%s\n' "$authorized_line" >> "$authorized_tmp"
done < "$authorized_keys"

forced_options="command=\"$libexec_dir/tempo-staging-ssh-deploy.sh\",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding,no-user-rc"
[[ -n "$matching_from" ]] && forced_options="$matching_from,$forced_options"
printf '%s\n' "$forced_options $key_identity" >> "$authorized_tmp"
chmod 600 "$authorized_tmp"
mv -f -- "$authorized_tmp" "$authorized_keys"
authorized_install_complete=1
rm -f -- "$authorized_backup"
trap - EXIT

printf '%s\n' 'Tempo staging host integration: PASS'
printf 'Deploy user: %s\n' "$(id -un)"
printf 'Deploy command: %s\n' "$libexec_dir/tempo-staging-ssh-deploy.sh"
printf 'Environment file: %s\n' "$env_file"
printf 'Manifest: %s/deployed.json\n' "$state_dir"
