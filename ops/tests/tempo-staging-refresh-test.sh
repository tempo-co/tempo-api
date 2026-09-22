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
    'pg_dump': 'local production PostgreSQL dump',
    '--format=custom': 'seekable custom-format dump',
    'pg_restore': 'temporary PostgreSQL restore',
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
    'OPENAI_API_KEY': 'AI credential exclusion',
    'PRODUCTION_POSTGRES_CONTAINER': 'fixed production PostgreSQL source',
    'tempo-staging-postgres-data': 'isolated staging volume guard',
}
for needle, label in required.items():
    if needle not in text:
        raise SystemExit(f'missing {label}: {needle}')

for forbidden in (
    'PRODUCTION_REDIS_CONTAINER',
    'tempo-staging-deploy.sh',
    'tempo-staging-ssh-deploy.sh',
    'Tailscale',
    'ssh ',
):
    if re.search(re.escape(forbidden), text, re.IGNORECASE):
        raise SystemExit(f'old or forbidden refresh surface remains: {forbidden}')
PY

rm -f /tmp/tempo-staging-refresh-no-confirm.out
printf 'PASS: tempo staging PostgreSQL-only refresh contract\n'
