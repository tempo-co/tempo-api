#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
installer="$repo_root/ops/staging/install-staging-host.sh"
unit="$repo_root/ops/staging/tempo-staging-docker.service"
python3 - "$installer" "$unit" <<'PY'
import sys

installer = open(sys.argv[1], encoding='utf-8').read()
unit = open(sys.argv[2], encoding='utf-8').read()
for fragment in [
    'authorized_keys',
    'no-agent-forwarding',
    'no-port-forwarding',
    'no-pty',
    'no-X11-forwarding',
    '.local/libexec/tempo-staging',
    'config_dir="$HOME/.config/tempo-staging"',
    'env_file="$config_dir/staging.env"',
    'tempo-staging-refresh.sh',
    'key_fingerprint=',
    'authorized_tmp=',
    'authorized_backup=',
    'mv -f -- "$authorized_tmp" "$authorized_keys"',
    'ssh-keygen -lf -',
    'expiry-time=',
]:
    assert fragment in installer, fragment
for forbidden in ('production.compose.yml', 'production.env', 'tempo_production_postgres_data'):
    assert forbidden not in installer, forbidden
assert 'Description=Tempo staging rootless Docker daemon' in unit
assert 'tempo-staging/docker.sock' in unit
assert '.local/share/tempo-staging/docker' in unit
assert 'dockerd-rootless.sh' in unit
assert 'WantedBy=default.target' in unit
print('tempo staging host installer contract: PASS')
PY

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
mkdir -p "$tmp_dir/home/.config/tempo-staging" "$tmp_dir/home/.ssh"
printf '%s\n' 'TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' > "$tmp_dir/home/.config/tempo-staging/staging.env"
ssh-keygen -q -t ed25519 -N '' -f "$tmp_dir/deploy_key"
key_type=$(awk '{print $1}' "$tmp_dir/deploy_key.pub")
key_blob=$(awk '{print $2}' "$tmp_dir/deploy_key.pub")
printf '%s %s old-unrestricted-comment\n' "$key_type" "$key_blob" > "$tmp_dir/home/.ssh/authorized_keys"
chmod 600 "$tmp_dir/home/.config/tempo-staging/staging.env" "$tmp_dir/deploy_key.pub" "$tmp_dir/home/.ssh/authorized_keys"
HOME="$tmp_dir/home" bash "$installer" --ssh-public-key-file "$tmp_dir/deploy_key.pub" >/dev/null
python3 - "$tmp_dir/home/.ssh/authorized_keys" "$key_type" "$key_blob" <<'PY'
import sys
path, key_type, key_blob = sys.argv[1:]
lines = [line for line in open(path, encoding='utf-8').read().splitlines() if line]
assert len(lines) == 1
assert lines[0].startswith('command="')
assert f'{key_type} {key_blob}' in lines[0]
assert 'old-unrestricted-comment' not in lines[0]
print('tempo staging host installer duplicate-key regression: PASS')
PY

printf 'command="old",from="127.0.0.1",expiry-time="20000101000000" %s %s restricted-from\n' "$key_type" "$key_blob" > "$tmp_dir/home/.ssh/authorized_keys"
HOME="$tmp_dir/home" bash "$installer" --ssh-public-key-file "$tmp_dir/deploy_key.pub" >/dev/null
if ! grep -Fq 'from="127.0.0.1"' "$tmp_dir/home/.ssh/authorized_keys" || ! grep -Fq 'expiry-time="20000101000000"' "$tmp_dir/home/.ssh/authorized_keys"; then
    echo 'authorized_keys restrictions were not preserved' >&2
    exit 1
fi

printf 'command="echo from=127.0.0.1 baz" %s %s command-text\n' "$key_type" "$key_blob" > "$tmp_dir/home/.ssh/authorized_keys"
HOME="$tmp_dir/home" bash "$installer" --ssh-public-key-file "$tmp_dir/deploy_key.pub" >/dev/null
if grep -Fq 'from=127.0.0.1' "$tmp_dir/home/.ssh/authorized_keys"; then
    echo 'from text inside command option was misclassified as a restriction' >&2
    exit 1
fi

printf '%s\n' 'ssh-ed25519 AAAATEST malformed' > "$tmp_dir/bad.pub"
if HOME="$tmp_dir/home" bash "$installer" --ssh-public-key-file "$tmp_dir/bad.pub" >/dev/null 2>&1; then
    echo 'malformed Ed25519 key unexpectedly accepted' >&2
    exit 1
fi
printf '%s\n' 'tempo staging host installer malformed-key regression: PASS'
