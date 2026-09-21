#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
tmp_dir=$(mktemp -d)
duplicate_env=$(mktemp)
export_duplicate_env=$(mktemp)
trap 'rm -rf "$tmp_dir" "$duplicate_env" "$export_duplicate_env"' EXIT
mkdir -p "$tmp_dir/backups"

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
TEMPO_STAGING_DOCKER_HOST="unix:///run/user/$(id -u)/tempo-staging/docker.sock" \
bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate

cp "$tmp_dir/staging.env" "$duplicate_env"
printf '%s\n' 'STAGING_DB_NAME=other_staging' >> "$duplicate_env"
if TEMPO_STAGING_ENV_FILE="$duplicate_env" TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" TEMPO_STAGING_DOCKER_HOST="unix:///run/user/$(id -u)/tempo-staging/docker.sock" bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate; then
    echo 'duplicate staging environment key unexpectedly accepted by refresh' >&2
    exit 1
fi

cp "$tmp_dir/staging.env" "$export_duplicate_env"
printf '%s\n' 'export STAGING_DB_NAME=other_staging' >> "$export_duplicate_env"
if TEMPO_STAGING_ENV_FILE="$export_duplicate_env" TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" TEMPO_STAGING_DOCKER_HOST="unix:///run/user/$(id -u)/tempo-staging/docker.sock" bash "$repo_root/ops/staging/tempo-staging-refresh.sh" validate; then
    echo 'export staging environment key unexpectedly accepted by refresh' >&2
    exit 1
fi

if TEMPO_STAGING_ENV_FILE="$tmp_dir/staging.env" TEMPO_STAGING_REFRESH_BACKUP_DIR="$tmp_dir/backups" TEMPO_STAGING_DOCKER_HOST="unix:///run/user/$(id -u)/tempo-staging/docker.sock" bash "$repo_root/ops/staging/tempo-staging-refresh.sh" refresh --confirm-production-backup-refresh; then
    echo 'refresh unexpectedly ran without a staging daemon' >&2
    exit 1
fi

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
