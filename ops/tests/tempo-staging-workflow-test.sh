#!/usr/bin/env bash
set -euo pipefail

workflow_file=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.github/workflows/staging-deploy.yml
python3 - "$workflow_file" <<'PY'
import sys
import yaml

workflow = open(sys.argv[1], encoding='utf-8').read()
parsed = yaml.safe_load(workflow)
assert parsed['jobs']['build']['permissions'] == {'contents': 'read'}
assert parsed['jobs']['publish']['permissions']['packages'] == 'write'
required = [
    'workflow_dispatch:',
    'pr_number:',
    'runs-on: ubuntu-latest',
    'gh api "repos/$repo/pulls/$pr"',
    '[[ "$GITHUB_REF" == refs/heads/main ]]',
    'platforms: linux/amd64',
    'gh api --paginate --slurp',
    'trusted_workflow_id=',
    'actions/runs?head_sha=',
    'contents/.github/workflows/ci.yml?ref=',
    'check_suite.id',
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
    'load: true',
    'upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131',
    'Publish API image',
    'outputs:',
    'digest: ${{ steps.digest.outputs.digest }}',
    'tailscale/github-action@780049a30b6ff5c378a9e7b389d15ece7a204888',
    'STAGING_TAILSCALE_OAUTH_CLIENT_ID',
    'STAGING_SSH_PRIVATE_KEY',
    'STAGING_SSH_KNOWN_HOSTS',
    'tempo-staging-ssh-deploy deploy api',
    'IMAGE_DIGEST: ${{ needs.publish.outputs.digest }}',
]
for fragment in required:
    assert fragment in workflow, fragment
assert 'self-hosted' not in workflow
assert ':latest' not in workflow
assert 'pull_request:' not in workflow
print('tempo API staging workflow contract: PASS')
PY
