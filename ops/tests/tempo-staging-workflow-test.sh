#!/usr/bin/env bash
set -euo pipefail

workflow_file=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.github/workflows/staging-deploy.yml
python3 - "$workflow_file" <<'PY'
import sys

workflow = open(sys.argv[1], encoding='utf-8').read()
required = [
    'workflow_dispatch:',
    'pr_number:',
    'runs-on: ubuntu-latest',
    'gh api "repos/$repo/pulls/$pr"',
    '[[ "$GITHUB_REF" == refs/heads/main ]]',
    'platforms: linux/amd64',
    'gh api --paginate --slurp',
    'pull-requests: read',
    'statuses: read',
    'head_repo',
    'head_sha',
    'persist-credentials: false',
    'Run staging contract tests',
    'missing_checks=',
    'bash ops/tests/tempo-staging-refresh-test.sh',
    'check-runs',
    'Lint & Format',
    'Unit Tests',
    'E2E Tests',
    'docker/build-push-action@',
    'outputs:',
    'digest: ${{ steps.build.outputs.digest }}',
    'tailscale/github-action@780049a30b6ff5c378a9e7b389d15ece7a204888',
    'STAGING_TAILSCALE_OAUTH_CLIENT_ID',
    'STAGING_SSH_PRIVATE_KEY',
    'STAGING_SSH_KNOWN_HOSTS',
    'tempo-staging-ssh-deploy deploy api',
    'IMAGE_DIGEST: ${{ needs.build.outputs.digest }}',
]
for fragment in required:
    assert fragment in workflow, fragment
assert 'self-hosted' not in workflow
assert ':latest' not in workflow
assert 'pull_request:' not in workflow
print('tempo API staging workflow contract: PASS')
PY
