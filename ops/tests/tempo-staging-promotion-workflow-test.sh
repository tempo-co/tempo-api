#!/usr/bin/env bash
set -Eeuo pipefail

WORKFLOW=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)/.github/workflows/staging-promote.yml

fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

[[ -f "$WORKFLOW" ]] || fail 'staging promotion workflow is missing'
python3 - "$WORKFLOW" <<'PY'
from pathlib import Path
import re
import sys

text = Path(sys.argv[1]).read_text(encoding='utf-8')
required = {
    'workflow_dispatch:': 'manual dispatch trigger',
    'pr_number:': 'PR number input',
    'gh api "repos/$repo/pulls/$pr"': 'same-repository PR lookup',
    'head_sha="$(jq -r \'.head.sha // ""\' <<<"$pr_json")"': 'exact PR head SHA',
    'gh api --paginate "repos/$repo/actions/runs?head_sha=$head_sha&per_page=100"': 'trusted CI workflow lookup',
    'checks_json=': 'terminal check lookup',
    '[[ "$(jq -r \'.status\' <<<"$trusted_run_json")" == completed ]]': 'completed check requirement',
    '[[ "$(jq -r \'.conclusion\' <<<"$trusted_run_json")" == success ]]': 'successful check requirement',
    '[[ "$head_repo" == "$repo" ]]': 'fork rejection',
    'persist-credentials: false': 'no checkout credential persistence',
    'docker build': 'host-independent image build',
    'docker save': 'build artifact export',
    'docker load': 'publication artifact import',
    'IMAGE_TAG: ghcr.io/${{ github.repository_owner }}/tempo-api:staging-${{ github.run_id }}-${{ needs.validate.outputs.head_sha }}': 'unique publication tag',
    'image_tag:': 'intent publication tag',
    'packages: write': 'registry write permission only on publication',
    'deployments: write': 'deployment metadata permission only on publication',
    'environment: staging': 'protected staging environment',
    'refs/heads/main': 'trusted workflow ref',
    '.github/workflows/staging-promote.yml': 'trusted workflow path',
    'required_contexts: []': 'explicit check verification boundary',
    'gh api --method POST "repos/$repo/deployments"': 'deployment intent creation',
    'gh api --method POST "repos/$repo/deployments/$deployment_id/statuses"': 'successful deployment status',
    'schema_version: 2': 'versioned intent schema',
    'head_sha:': 'intent head SHA',
    'dispatch_sha': 'dispatch workflow revision',
    'image:': 'intent immutable image',
}
if not re.search(r'source:\n\s+description:.*\n\s+required: true\n\s+type: choice\n\s+default: pr\n\s+options: \[pr, main\]', text):
    raise SystemExit('source input must default to pr with pr/main choices')
if not re.search(r'pr_number:\n\s+description:.*\n\s+required: false\n\s+type: number', text):
    raise SystemExit('PR number must be optional at the UI boundary')
for job in [text.split('    validate:', 1)[1].split('    build:', 1)[0],
            text.split('    build:', 1)[1].split('    publish:', 1)[0]]:
    if re.search(r'(packages|deployments):\s+write', job):
        raise SystemExit('validation/build must not have publication permissions')
for needle, label in required.items():
    if needle not in text:
        raise SystemExit(f'missing {label}: {needle}')

for forbidden in ('docker.sock', 'ssh', 'tailscale', 'tempo-staging-deploy.sh', 'secrets.STAGING', 'OAUTH'):
    if re.search(re.escape(forbidden), text, re.IGNORECASE):
        raise SystemExit(f'old host/deployment secret surface remains: {forbidden}')

if 'ghcr.io/${{ github.repository_owner }}/tempo-' not in text:
    raise SystemExit('image must publish to the repository owner namespace')
if 'sha256:[0-9a-f]{64}' not in text or 'image_ref=ghcr.io/%s/tempo-api@%s' not in text:
    raise SystemExit('publication must resolve and validate an immutable digest')
if 'payload' not in text or 'repository:' not in text or 'component:' not in text or 'environment:' not in text:
    raise SystemExit('deployment payload is incomplete')
top_level = text.split('jobs:', 1)[0]
if re.search(r'^\s+packages:\s+write', top_level, re.MULTILINE):
    raise SystemExit('package write permission must not be global')
PY

python3 - "$WORKFLOW" <<'PY'
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap

text = Path(sys.argv[1]).read_text()
validation = text.split('              run: |\n', 1)[1].split('\n    build:', 1)[0]
validation = textwrap.dedent(validation)
sha = 'a' * 40
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    gh = root / 'gh'
    gh.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = ' '.join(sys.argv[1:])
with open(os.environ['CALL_LOG'], 'a') as log: log.write(args + '\\n')
fixture = json.loads(Path(os.environ['FIXTURE']).read_text())
if '/pulls/' in args: print(json.dumps(fixture['pr']))
elif '/contents/' in args:
    print(fixture.get('head_ci_blob', fixture['ci_blob']) if 'ref=' + 'b' * 40 in args else fixture['ci_blob'])
elif '/actions/runs?' in args:
    for run in fixture['runs']: print(json.dumps(run))
elif '/check-runs?' in args:
    for check in fixture['checks']: print(json.dumps(check))
elif '/status?' in args:
    for status in fixture['statuses']: print(json.dumps(status))
else: raise SystemExit('unexpected gh call: ' + args)
''')
    gh.chmod(0o755)
    fixture = {'runs': [{'id': 42, 'head_sha': sha, 'path': '.github/workflows/ci.yml',
        'event': 'push', 'head_branch': 'main', 'check_suite_id': 99,
        'status': 'completed', 'conclusion': 'success'}],
        'checks': [{'name': name, 'check_suite': {'id': 99}, 'status': 'completed',
        'conclusion': 'success'} for name in ['Lint & Format', 'Build', 'Unit Tests', 'E2E Tests']],
        'statuses': [], 'ci_blob': 'trusted',
        'pr': {'head': {'repo': {'full_name': 'tempo-co/tempo-api'}, 'sha': 'b' * 40},
        'base': {'ref': 'main'}, 'state': 'open', 'draft': False, 'merged_at': None}}
    def execute(data, source='main', pr='', ref='refs/heads/main', expected=True):
        (root / 'fixture').write_text(json.dumps(data))
        (root / 'output').write_text('')
        (root / 'calls').write_text('')
        env = dict(os.environ, PATH=f'{root}:{os.environ["PATH"]}', FIXTURE=str(root / 'fixture'),
            CALL_LOG=str(root / 'calls'), GITHUB_OUTPUT=str(root / 'output'),
            GITHUB_REPOSITORY='tempo-co/tempo-api', GITHUB_SHA=sha, GITHUB_REF=ref,
            SOURCE=source, PR_NUMBER=pr)
        result = subprocess.run(['bash', '-c', validation], env=env, capture_output=True, text=True)
        assert (result.returncode == 0) == expected, (source, pr, result.returncode, result.stderr)
        return (root / 'output').read_text(), (root / 'calls').read_text()
    output, calls = execute(fixture)
    assert f'head_sha={sha}\n' in output and 'source=main\n' in output and 'pr_number=null\n' in output, output
    assert '/pulls/' not in calls and '/contents/' not in calls, calls
    import copy
    for field, value in [('status', 'in_progress'), ('conclusion', 'failure'),
                         ('head_sha', 'c' * 40), ('event', 'pull_request'),
                         ('head_branch', 'feature'), ('path', 'untrusted.yml')]:
        invalid = copy.deepcopy(fixture)
        invalid['runs'][0][field] = value
        execute(invalid, expected=False)
    invalid = copy.deepcopy(fixture)
    invalid['runs'] = []
    execute(invalid, expected=False)
    invalid = copy.deepcopy(fixture)
    invalid['runs'].append(dict(invalid['runs'][0], id=43, status='in_progress', conclusion=None))
    execute(invalid, expected=False)
    for checks in [[], fixture['checks'][:-1], [dict(c, conclusion='skipped') for c in fixture['checks']]]:
        invalid = copy.deepcopy(fixture)
        invalid['checks'] = checks
        execute(invalid, expected=False)
    invalid = copy.deepcopy(fixture)
    invalid['checks'][0]['check_suite']['id'] = 1
    execute(invalid, expected=False)
    invalid = copy.deepcopy(fixture)
    invalid['statuses'] = [{'state': 'pending'}]
    execute(invalid, expected=False)
    execute(fixture, pr='0')
    for pr in ['123', '-1', '1.5', 'null', '01', '0.0']:
        execute(fixture, pr=pr, expected=False)
    execute(fixture, ref='refs/heads/feature', expected=False)
    execute(fixture, source='unknown', expected=False)
    pr_fixture = copy.deepcopy(fixture)
    pr_fixture['runs'][0].update(head_sha='b' * 40, event='pull_request', head_branch='feature')
    output, calls = execute(pr_fixture, source='pr', pr='123')
    assert 'head_sha=' + 'b' * 40 + '\n' in output and 'pr_number=123\n' in output and 'source=pr\n' in output
    assert '/pulls/123' in calls and '/contents/' in calls
    for pr in ['', '0', '-1', '1.5', 'null', '01']:
        execute(pr_fixture, source='pr', pr=pr, expected=False)
    for field, value in [('draft', True), ('state', 'closed')]:
        invalid = copy.deepcopy(pr_fixture)
        invalid['pr'][field] = value
        execute(invalid, source='pr', pr='123', expected=False)
    for key, value in [('head', {'repo': {'full_name': 'other/repo'}, 'sha': 'b' * 40}),
                       ('base', {'ref': 'feature'})]:
        invalid = copy.deepcopy(pr_fixture)
        invalid['pr'][key] = value
        execute(invalid, source='pr', pr='123', expected=False)
    merged = copy.deepcopy(pr_fixture)
    merged['pr'].update(state='closed', merged_at='2026-01-01T00:00:00Z')
    execute(merged, source='pr', pr='123')
    invalid = copy.deepcopy(pr_fixture)
    invalid['head_ci_blob'] = 'untrusted'
    execute(invalid, source='pr', pr='123', expected=False)

    # Execute trusted payload creation, capturing only synthetic deployment writes.
    publisher = textwrap.dedent(text.split('            - name: Create successful staging deployment intent', 1)[1].split('              run: |\n', 1)[1])
    gh.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
body = json.load(sys.stdin)
if '/statuses' in ' '.join(sys.argv):
    Path(os.environ['STATUS_BODY']).write_text(json.dumps(body))
else:
    Path(os.environ['DEPLOYMENT_BODY']).write_text(json.dumps(body))
    print('456')
''')
    for source, head, number in [('main', sha, 'null'), ('pr', 'b' * 40, '123')]:
        env = dict(os.environ, PATH=f'{root}:{os.environ["PATH"]}',
            DEPLOYMENT_BODY=str(root / 'deployment'), STATUS_BODY=str(root / 'status'),
            GITHUB_REPOSITORY='tempo-co/tempo-api', GITHUB_SHA=sha, GITHUB_RUN_ID='42',
            GITHUB_SERVER_URL='https://github.example.invalid', SOURCE=source, HEAD_SHA=head,
            PR_NUMBER=number, IMAGE_REF='ghcr.io/tempo-co/tempo-api@sha256:' + '1' * 64,
            IMAGE_TAG='ghcr.io/tempo-co/tempo-api:staging-42-' + head)
        result = subprocess.run(['bash', '-c', publisher], env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        body = json.loads((root / 'deployment').read_text())
        intent = body['payload']
        assert intent['schema_version'] == 2 and intent['source'] == source
        assert intent['pr_number'] == (None if source == 'main' else 123)
        assert intent['head_sha'] == head and intent['workflow']['dispatch_sha'] == sha
        assert body['ref'] == head and body['environment'] == 'staging'
        assert body['auto_merge'] is False and body['production_environment'] is False
        assert body['required_contexts'] == [] and body['transient_environment'] is False
        assert json.loads((root / 'status').read_text())['state'] == 'success'
        (root / 'intent').write_text(json.dumps(intent))
        engine = Path(sys.argv[1]).parents[2] / 'ops/tempo-deploy.sh'
        result = subprocess.run(['bash', str(engine), '--validate-intent', str(root / 'intent'),
            'tempo-co/tempo-api', 'api'], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
print('PASS: executed main and PR validation, CI provenance, checks, input and publication regressions')
PY

printf 'PASS: staging promotion workflow contract\n'
