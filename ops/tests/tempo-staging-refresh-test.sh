#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
tmp_dir=$(mktemp -d)
duplicate_env=$(mktemp)
export_duplicate_env=$(mktemp)
same_host_port_env=$(mktemp)
unicode_origin_env=$(mktemp)
ipv4_origin_env=$(mktemp)
legacy_ipv4_origin_env=$(mktemp)
dotted_hex_origin_env=$(mktemp)
trap 'rm -rf "$tmp_dir" "$duplicate_env" "$export_duplicate_env" "$same_host_port_env" "$unicode_origin_env" "$ipv4_origin_env" "$legacy_ipv4_origin_env" "$dotted_hex_origin_env"' EXIT
mkdir -p "$tmp_dir/backups" "$tmp_dir/fake-bin" "$tmp_dir/runtime/tempo-staging" "$tmp_dir/malformed-origins"
python3 - "$tmp_dir/runtime/tempo-staging/docker.sock" "$tmp_dir/fake-bin/docker" <<'PY'
import socket
import stat
import sys
from pathlib import Path

socket_path, docker_path = map(Path, sys.argv[1:])
listener = socket.socket(socket.AF_UNIX)
listener.bind(str(socket_path))
listener.close()
Path(docker_path).write_text(
    '''#!/usr/bin/env python3
import os
import sys

if sys.argv[1:2] == ['info']:
    output = ' '.join(sys.argv[2:])
    if '.SecurityOptions' in output:
        print('["name=rootless"]')
    elif '.DockerRootDir' in output:
        print(os.path.expanduser('~/.local/share/tempo-staging/docker'))
    raise SystemExit(0)
raise SystemExit(42)
''',
    encoding='utf-8',
)
docker_path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
PY

python3 - "$tmp_dir/backups/tempo-20260920-000000.sql.gz" <<'PY'
import gzip
import sys
with gzip.open(sys.argv[1], 'wt', encoding='utf-8') as handle:
    handle.write('SELECT 1;\n')
PY

cat >"$tmp_dir/staging.env" <<'EOF'
TEMPO_API_IMAGE=ghcr.io/tempo-co/tempo-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
TEMPO_WEB_IMAGE=ghcr.io/tempo-co/tempo-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
STAGING_PUBLIC_URL=https://staging.example.test/staging
PRODUCTION_PUBLIC_URL=https://production.example.test/tempo
STAGING_WEB_HOST_PORT=8119
STAGING_DB_USERNAME=tempo_staging
STAGING_DB_PASSWORD=synthetic-password
STAGING_DB_NAME=tempo_staging
SESSION_SECRET=synthetic-session-secret
BANKING_SESSION_ENCRYPTION_KEY_B64=QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=
EOF
chmod 600 "$tmp_dir/staging.env"

TEMPO_STAGING_ENV_FILE="$tmp_dir/staging.env" \
TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" \
XDG_RUNTIME_DIR="$tmp_dir/runtime" \
bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate

cp "$tmp_dir/staging.env" "$duplicate_env"
printf '%s\n' 'STAGING_DB_NAME=other_staging' >> "$duplicate_env"
if TEMPO_STAGING_ENV_FILE="$duplicate_env" TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" XDG_RUNTIME_DIR="$tmp_dir/runtime" bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate; then
    echo 'duplicate staging environment key unexpectedly accepted by refresh' >&2
    exit 1
fi

cp "$tmp_dir/staging.env" "$export_duplicate_env"
printf '%s\n' 'export STAGING_DB_NAME=other_staging' >> "$export_duplicate_env"
if TEMPO_STAGING_ENV_FILE="$export_duplicate_env" TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" XDG_RUNTIME_DIR="$tmp_dir/runtime" bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate; then
    echo 'export staging environment key unexpectedly accepted by refresh' >&2
    exit 1
fi

if PATH="$tmp_dir/fake-bin:$PATH" \
    XDG_RUNTIME_DIR="$tmp_dir/runtime" \
    TEMPO_STAGING_STATE_DIR="$tmp_dir/state" \
    TEMPO_STAGING_ENV_FILE="$tmp_dir/staging.env" \
    TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" \
    bash "$repo_root/ops/staging/tempo-staging-refresh.sh" refresh --confirm-production-backup-refresh; then
    echo 'refresh unexpectedly ran without a staging daemon' >&2
    exit 1
fi

python3 - "$tmp_dir/staging.env" "$tmp_dir/same-host-port.env" <<'PY'
import sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
target.write_text(source.read_text().replace('https://production.example.test/tempo', 'https://staging.example.test:8443/tempo'))
PY
chmod 600 "$tmp_dir/same-host-port.env"
if TEMPO_STAGING_ENV_FILE="$tmp_dir/same-host-port.env" TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" XDG_RUNTIME_DIR="$tmp_dir/runtime" bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate; then
    echo 'same staging/production hostname on different ports unexpectedly accepted by refresh' >&2
    exit 1
fi

python3 - "$tmp_dir/staging.env" "$unicode_origin_env" "$ipv4_origin_env" "$legacy_ipv4_origin_env" "$dotted_hex_origin_env" <<'PY'
import sys
from pathlib import Path
source = Path(sys.argv[1]).read_text()
replacements = [
    (sys.argv[2], 'https://staging.example.test/staging', 'https://éxample.test/staging', 'https://production.example.test/tempo', 'https://xn--xample-9ua.test/tempo'),
    (sys.argv[3], 'https://staging.example.test/staging', 'https://127.0.0.1/staging', 'https://production.example.test/tempo', 'https://127.1/tempo'),
    (sys.argv[4], 'https://staging.example.test/staging', 'https://0x/staging', 'https://production.example.test/tempo', 'https://0.0.0.0/tempo'),
    (sys.argv[5], 'https://staging.example.test/staging', 'https://1.2.3.0x10/staging', 'https://production.example.test/tempo', 'https://1.2.3.16/tempo'),
]
for target_name, old_staging, new_staging, old_production, new_production in replacements:
    Path(target_name).write_text(source.replace(old_staging, new_staging).replace(old_production, new_production))
PY
chmod 600 "$unicode_origin_env" "$ipv4_origin_env" "$legacy_ipv4_origin_env" "$dotted_hex_origin_env"
for equivalent_env in "$unicode_origin_env" "$ipv4_origin_env" "$legacy_ipv4_origin_env" "$dotted_hex_origin_env"; do
    if TEMPO_STAGING_ENV_FILE="$equivalent_env" TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" XDG_RUNTIME_DIR="$tmp_dir/runtime" bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate; then
        echo 'equivalent browser origin unexpectedly accepted by refresh' >&2
        exit 1
    fi
done

python3 - "$tmp_dir/staging.env" "$tmp_dir/malformed-origins" <<'PY'
import sys
from pathlib import Path
source = Path(sys.argv[1]).read_text()
target_dir = Path(sys.argv[2])
malformed = {
    'credentials': 'https://user:password@staging.example.test/staging',
    'query': 'https://staging.example.test?ignored/staging',
    'fragment': 'https://staging.example.test/staging#ignored',
    'empty-query': 'https://staging.example.test/staging?',
    'empty-fragment': 'https://staging.example.test/staging#',
    'backslash': 'https://staging.example.test\\staging',
    'invalid-port': 'https://staging.example.test:bad/staging',
    'invalid-octal': 'https://08/staging',
    'invalid-ipv4-range': 'https://999.999.999.999/staging',
    'invalid-ipv4-final': 'https://1.2.3.999/staging',
    'invalid-ipv4-empty-part': 'https://1..2/staging',
    'invalid-dotted-hex-prefix': 'https://foo.0x1/staging',
    'invalid-dotted-hex-range': 'https://1.2.0x1000000/staging',
    'scoped-ipv6': 'https://[fe80::1%25eth0]/staging',
}
for name, value in malformed.items():
    (target_dir / f'{name}.env').write_text(source.replace('https://staging.example.test/staging', value))
PY
for malformed_env in "$tmp_dir/malformed-origins"/*.env; do
    chmod 600 "$malformed_env"
    if TEMPO_STAGING_ENV_FILE="$malformed_env" TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" XDG_RUNTIME_DIR="$tmp_dir/runtime" bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate; then
        echo "malformed staging URL unexpectedly accepted: $malformed_env" >&2
        exit 1
    fi
done

python3 - "$repo_root/ops/staging/tempo-staging-refresh.sh" <<'PY'
import sys
text = open(sys.argv[1], encoding='utf-8').read()
for fragment in ('providerSessionId', 'authorizationStateHash', 'consentValidUntil', 'lastSyncedAt', 'FLUSHALL', '--confirm-production-backup-refresh', 'node ./dist/scripts/schema.js', 'PGPASSFILE', 'rollback_database', 'database_state', '{0,38}'):
    assert fragment in text, fragment
assert '; ALTER DATABASE' not in text
for forbidden in ('production.compose.yml', 'tempo_production_postgres_data', 'down -v', 'PGPASSWORD=', 'provider_session_id', 'authorization_state_hash'):
    assert forbidden not in text, forbidden
print('tempo staging refresh contract: PASS')
PY
