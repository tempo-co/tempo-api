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
    'key_identity=',
    'authorized_tmp=',
    'matching = 0',
    'chmod 600',
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
mkdir -p "$tmp_dir/home/.config/tempo-staging"
printf '%s\n' 'TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' > "$tmp_dir/home/.config/tempo-staging/staging.env"
printf '%s\n' 'ssh-ed25519 AAAATEST requested-comment' > "$tmp_dir/deploy.pub"
printf '%s\n' 'ssh-ed25519 AAAATEST old-unrestricted-comment' > "$tmp_dir/home/.ssh.seed"
mkdir -p "$tmp_dir/home/.ssh"
mv "$tmp_dir/home/.ssh.seed" "$tmp_dir/home/.ssh/authorized_keys"
chmod 600 "$tmp_dir/home/.config/tempo-staging/staging.env" "$tmp_dir/deploy.pub" "$tmp_dir/home/.ssh/authorized_keys"
HOME="$tmp_dir/home" bash "$installer" --ssh-public-key-file "$tmp_dir/deploy.pub" >/dev/null
python3 - "$tmp_dir/home/.ssh/authorized_keys" <<'PY'
import sys
lines = [line for line in open(sys.argv[1], encoding='utf-8').read().splitlines() if line]
assert len(lines) == 1
assert lines[0].startswith('command="')
assert 'AAAATEST' in lines[0]
assert 'old-unrestricted-comment' not in lines[0]
print('tempo staging host installer duplicate-key regression: PASS')
PY
