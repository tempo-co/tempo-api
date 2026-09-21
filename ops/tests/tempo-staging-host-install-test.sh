#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
installer="$repo_root/ops/staging/install-staging-host.sh"
unit="$repo_root/ops/staging/tempo-staging-docker.service"
rootless_installer="$repo_root/ops/staging/install-rootless-daemon.sh"
python3 - "$installer" "$unit" "$rootless_installer" <<'PY'
import sys

installer = open(sys.argv[1], encoding='utf-8').read()
unit = open(sys.argv[2], encoding='utf-8').read()
rootless_installer = open(sys.argv[3], encoding='utf-8').read()
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
    'tempo-staging-origin.py',
    'key_fingerprint=',
    'authorized_tmp=',
    'authorized_backup=',
    'mv -f -- "$authorized_tmp" "$authorized_keys"',
    'ssh-keygen -lf -',
    'expiry-time=',
    'command -v jq',
]:
    assert fragment in installer, fragment
for forbidden in ('production.compose.yml', 'production.env', 'tempo_production_postgres_data'):
    assert forbidden not in installer, forbidden
assert 'Description=Tempo staging rootless Docker daemon' in unit
assert 'tempo-staging/docker.sock' in unit
assert '.local/share/tempo-staging/docker' in unit
assert 'dockerd-rootless.sh' in unit
assert 'Environment=PATH=%h/bin:%h/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin' in unit
assert 'Environment=DOCKERD_ROOTLESS_ROOTLESSKIT_PORT_DRIVER=builtin' in unit
assert '--experimental' not in unit
assert '--iptables=false' not in unit
assert '--ip6tables=false' not in unit
assert 'After=default.target' not in unit
assert 'Delegate=yes' in unit
assert 'WantedBy=default.target' in unit
assert 'docker_info() {' in rootless_installer
assert '[[ -n "$security_options" && -n "$docker_root" ]]' in rootless_installer
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
[[ -f "$tmp_dir/home/.local/libexec/tempo-staging/tempo-staging-origin.py" ]] || {
    echo 'origin validator was not installed' >&2
    exit 1
}
python3 - "$tmp_dir/home/.local/libexec/tempo-staging/tempo-staging-origin.py" <<'PY'
import sys
from pathlib import Path
assert Path(sys.argv[1]).read_text(encoding='utf-8').startswith('#!/usr/bin/env python3')
print('tempo staging host installer origin-validator regression: PASS')
PY
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
printf '%s %s ssh-ed25519 %s no-final-newline' ssh-rsa UNRELATED "$key_blob" > "$tmp_dir/home/.ssh/authorized_keys"
HOME="$tmp_dir/home" bash "$installer" --ssh-public-key-file "$tmp_dir/deploy_key.pub" >/dev/null
python3 - "$tmp_dir/home/.ssh/authorized_keys" "$key_blob" <<'PY'
import sys
path, key_blob = sys.argv[1:]
data = open(path, 'rb').read()
assert b'ssh-rsa UNRELATED' in data
assert b'\ncommand=' in data
assert data.count(b'\ncommand=') == 1
assert data.endswith(b'\n')
print('tempo staging host installer comment/newline regression: PASS')
PY

no_jq_bin="$tmp_dir/no-jq-bin"
mkdir -p "$no_jq_bin"
python3 - "$no_jq_bin" <<'PY'
import os
import sys
from pathlib import Path

target = Path(sys.argv[1])
seen = set()
for directory in os.environ.get('PATH', '').split(':'):
    if not directory:
        continue
    directory_path = Path(directory)
    if not directory_path.is_dir():
        continue
    for candidate in directory_path.iterdir():
        if candidate.name == 'jq' or candidate.name in seen or not candidate.is_file():
            continue
        if os.access(candidate, os.X_OK):
            destination = target / candidate.name
            try:
                destination.symlink_to(candidate)
                seen.add(candidate.name)
            except FileExistsError:
                pass
PY
if PATH="$no_jq_bin" HOME="$tmp_dir/home" /usr/bin/bash "$installer" --ssh-public-key-file "$tmp_dir/deploy_key.pub" >"$tmp_dir/no-jq.out" 2>&1; then
    echo 'host installer unexpectedly accepted a missing jq prerequisite' >&2
    exit 1
fi
grep -Fq 'jq is required' "$tmp_dir/no-jq.out"
