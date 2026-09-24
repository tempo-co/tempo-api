#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=$SCRIPT_DIR/../staging/tempo-staging-refresh.sh

fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

[[ -f "$SCRIPT" ]] || fail 'staging refresh script is missing'
[[ -x "$SCRIPT" ]] || fail 'staging refresh script is not executable'

if bash "$SCRIPT" refresh > /tmp/tempo-staging-refresh-no-confirm.out 2>&1; then
    fail 'refresh without explicit confirmation succeeded'
fi
if ! grep -F -- '--confirm-production-backup-refresh' /tmp/tempo-staging-refresh-no-confirm.out >/dev/null; then
    fail 'refresh without confirmation did not explain the required gate'
fi

python3 - "$SCRIPT" <<'PY'
from pathlib import Path
import re
import sys

text = Path(sys.argv[1]).read_text(encoding='utf-8')
required = {
    r'tempo-\d{8}-\d{6}\.dump': 'custom-format local backup naming contract',
    'TEMPO_STAGING_REFRESH_BACKUP_DIR': 'host-local backup directory selection',
    'pg_restore --list': 'custom-format archive validation',
    '--no-owner --no-privileges': 'owner/ACL-neutral staging restore',
    '--confirm-production-backup-refresh': 'production refresh confirmation',
    '--confirm-seeded-reset': 'seed reset confirmation',
    'bank_connections': 'provider-state sanitization',
    'providerSessionId': 'provider session sanitization',
    'authorizationStateHash': 'authorization-state sanitization',
    'bank_sync_runs': 'sync-run sanitization',
    'FLUSHALL': 'staging Redis reset',
    'tempo_staging_refresh': 'temporary database',
    'ALTER DATABASE': 'atomic database swap',
    'failed': 'rollback database name',
    'AI_CATEGORIZATION_ENABLED': 'AI configuration guard',
    'BANKING_INTEGRATION_ENABLED': 'banking configuration guard',
    'STAGING_API_HEALTH_URL': 'browser-facing API health route',
    'OPENAI_API_KEY': 'AI credential exclusion',
    'tempo-staging-postgres-data': 'isolated staging volume guard',
}
for needle, label in required.items():
    if needle not in text:
        raise SystemExit(f'missing {label}: {needle}')

for forbidden in (
    'pg_dump',
    'PRODUCTION_POSTGRES_CONTAINER',
    'production_docker_cli',
    'PRODUCTION_REDIS_CONTAINER',
    'tempo-staging-deploy.sh',
    'tempo-staging-ssh-deploy.sh',
    'Tailscale',
    'ssh ',
    'STAGING_PASSWORD_FILE',
    'TEMPO_STAGING_LOGIN_PASSWORD_FILE',
    'TEMPO_STAGING_REFRESH_WEB_URL',
    'set-staging-password.js',
):
    if re.search(re.escape(forbidden), text, re.IGNORECASE):
        raise SystemExit(f'old or forbidden refresh surface remains: {forbidden}')

sanitizer = text.split('sanitize_database() {', 1)[1].split('assert_sanitized() {', 1)[0]
writes = re.findall(
    r'(?im)^\s*(?:UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|INSERT\s+INTO|MERGE\s+INTO|COPY)\s+(?:public\.)?["`]?([a-z_]+)',
    sanitizer,
)
if set(writes) != {'bank_connections', 'bank_sync_runs'}:
    raise SystemExit(f'sanitizer may only write provider-state tables, found: {sorted(set(writes))}')
PY

rm -f /tmp/tempo-staging-refresh-no-confirm.out
printf 'PASS: tempo staging PostgreSQL-only refresh contract\n'
