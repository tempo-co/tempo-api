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

forced_options="command=\"$libexec_dir/tempo-staging-ssh-deploy.sh\",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding,no-user-rc"
if ! python3 - "$authorized_keys" "$authorized_tmp" "$key_type" "$key_blob" "$forced_options" <<'PY'
import sys
from pathlib import Path

authorized_path, output_path, key_type, key_blob, forced_options = sys.argv[1:]


def tokenize(line):
    tokens = []
    current = []
    quote = None
    escaped = False
    for char in line:
        if escaped:
            current.append(char)
            escaped = False
        elif char == '\\' and quote != "'":
            current.append(char)
            escaped = True
        elif quote is not None:
            current.append(char)
            if char == quote:
                quote = None
        elif char in ("'", '"'):
            current.append(char)
            quote = char
        elif char.isspace():
            if current:
                tokens.append(''.join(current))
                current = []
        else:
            current.append(char)
    if quote is not None:
        raise ValueError('unterminated quote')
    if current:
        tokens.append(''.join(current))
    return tokens


def split_options(token):
    options = []
    current = []
    quote = None
    escaped = False
    for char in token:
        if escaped:
            current.append(char)
            escaped = False
        elif char == '\\' and quote != "'":
            current.append(char)
            escaped = True
        elif quote is not None:
            current.append(char)
            if char == quote:
                quote = None
        elif char in ("'", '"'):
            current.append(char)
            quote = char
        elif char == ',':
            options.append(''.join(current))
            current = []
        else:
            current.append(char)
    options.append(''.join(current))
    return options


def append_line(lines, line):
    lines.append(line if line.endswith('\n') else line + '\n')


def merge_restriction(current, candidate, name):
    if candidate and current and candidate != current:
        raise SystemExit(f'conflicting {name} restrictions')
    return current or candidate

def is_key_type(value):
    return value.startswith(('ssh-', 'ecdsa-', 'sk-', 'rsa-sha2-'))


lines = []
matching_from = None
matching_expiry = None
for raw_line in Path(authorized_path).read_text(encoding='utf-8').splitlines(keepends=True):
    stripped = raw_line.strip()
    if not stripped or stripped.startswith('#'):
        append_line(lines, raw_line)
        continue
    try:
        fields = tokenize(raw_line.rstrip('\r\n'))
    except ValueError:
        append_line(lines, raw_line)
        continue
    key_index = next((index for index in range(len(fields) - 1) if is_key_type(fields[index])), None)
    if key_index is None or fields[key_index] != key_type or fields[key_index + 1] != key_blob:
        append_line(lines, raw_line)
        continue
    for field in fields[:key_index]:
        for option in split_options(field):
            if option.startswith('from='):
                matching_from = merge_restriction(matching_from, option, 'from')
            elif option.startswith('expiry-time='):
                matching_expiry = merge_restriction(matching_expiry, option, 'expiry-time')

preserved = [option for option in (matching_from, matching_expiry) if option]
forced = ','.join(preserved + [forced_options])
lines.append(f'{forced} {key_type} {key_blob}\n')
Path(output_path).write_text(''.join(lines), encoding='utf-8')
PY
then
  fail 'authorized_keys parsing failed'
fi
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
