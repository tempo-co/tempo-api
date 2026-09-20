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
