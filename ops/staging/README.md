# Isolated staging deployment

Staging mirrors the production image-polling model without sharing production
runtime state.

## Runtime boundaries

- Compose project: `tempo-staging`
- Rootless Docker socket: `$XDG_RUNTIME_DIR/tempo-staging/docker.sock`
- Rootless Docker data root: `$HOME/.local/share/tempo-staging/docker`
- Config: `$HOME/.config/tempo-staging/staging.compose.yml` and `staging.env`
- State: `$HOME/.local/state/tempo-staging/`
- Host port: loopback `127.0.0.1:8119`
- Browser origin: a dedicated private staging hostname, never the production
  hostname or only a different path/port
- Services: separate PostgreSQL, Redis, Mailpit, API, web, volumes, and
  networks
- Database route: API and Postgres share only the internal staging backend;
  preflight rejects extra/external networks, hostname aliases, or a different
  database name

The production target remains `/etc/tempo/production.compose.yml`,
`/etc/tempo/production.env`, the rootful Docker socket, and the existing
production systemd entrypoint. The target-aware engine is
`ops/tempo-deploy.sh`; `ops/tempo-production-deploy.sh` is only a compatibility
wrapper for the existing production installation path.

## Promotion and polling

A protected manual `workflow_dispatch` on the default branch accepts a
same-repository PR number. It validates the exact PR head, base branch, trusted
CI workflow revision, required terminal-success checks, and non-draft/merged
state. It builds that exact head without registry write credentials, then an
approval-gated job publishes immutable GHCR digests and creates a successful
GitHub deployment record whose payload is the staging deployment intent.

The host poller reads only successful deployment records for the exact repository
and component. It validates the payload schema, repository, component,
environment, PR head SHA, immutable image digest, trusted workflow path/ref/event,
workflow run ID, and successful workflow/check evidence before pulling anything.
It uses the isolated rootless Docker socket, recreates only API/web, verifies
routes and stateful-container identity, persists the approved image references
atomically, and writes rollback state. Only after a changed image set passes those
health checks does it invoke the separate database-refresh script, which updates
staging PostgreSQL and clears staging Redis; it never changes production resources.

Install and enable `ops/systemd/tempo-staging-deploy.service` and
`tempo-staging-deploy.timer` only through the host rollout gate. Before the
service can run, provision these separate host-local credentials without
copying them into the repository:

- `$HOME/.config/tempo-staging/github-readonly-token`, mode `0600`, for GitHub
  deployment/workflow reads;
- `$HOME/.config/tempo-staging/docker-config/config.json`, mode `0600`, with a
  read-only `ghcr.io` credential.

The unit has `ConditionPathExists` guards for both files. The timer may be
enabled while the service remains inactive until those credentials exist; the
poller never falls back to the interactive `gh` token or the default Docker
config. The unit runs as the owner of the rootless daemon and has no production
Docker access.

## Staging safety policy

The Compose manifest hard-codes these runtime controls rather than accepting
mutable values from a promotion payload:

```text
BANKING_INTEGRATION_ENABLED=false
AI_CATEGORIZATION_ENABLED=false
AI_CATEGORIZATION_WEB_SEARCH_ENABLED=false
```

No OpenAI key or banking private key is present in the staging env template. The
API also guards banking authorization/callback and sync queue paths, while AI
categorization already fails closed before enqueue/provider work when disabled.
The contract tests assert both configuration and application behavior. A staging
run must not make billable AI calls or external banking calls.

## PostgreSQL-only data refresh

`tempo-staging-refresh.sh` consumes the newest validated custom-format PostgreSQL
archive in `$HOME/backups/tempo` (`tempo-YYYYMMDD-HHMMSS.dump`). It does not connect
to production or copy production Redis. Legacy SQL archives are not eligible.
The source archive is validated and retained; restoration uses
`pg_restore --no-owner --no-privileges` into a temporary staging database. The
configured staging DB name cannot be `postgres`, `template0`, `template1`, or any
of the temporary/rollback database names.

The host poller invokes the refresh only after a real staging image change has
passed API/web health checks. An ordinary no-op poll only records its initial
image baseline and never refreshes data. If a refresh fails, the deployed image
set remains marked pending and a later healthy poll retries without redeploying.
Installing the poller alone does not refresh the existing synthetic staging DB.

Before enabling this flow, provision a distinct staging-only login password at
`$HOME/.config/tempo-staging/staging-login-password`, mode `0600`. The value must
not be copied from production or committed. The refresh passes it to the staging
API process over stdin, where it is Argon2-hashed in the temporary database; it
is not included in command arguments or logs. Only the password hash and update
timestamp change on the single restored account; its name, email, financial rows,
and bank identifiers are retained.

The production refresh path:

1. Checks that the backup directory and newest archive are owner-controlled with
   modes `0700` and `0600`, then validates the custom archive inside staging with
   `pg_restore --list` before restoring it.
2. Starts only staging PostgreSQL/Redis/Mailpit through the rootless staging
   Compose project and restores into a temporary database.
3. Applies current-image schema work, clears provider authorization/session and
   sync-run state, resets the staging-only account password, and validates the
   sanitized result.
4. Stops staging API/web, atomically swaps the temporary database into the
   configured staging database, flushes only staging Redis/BullMQ state, then
   restarts and health-checks staging.
5. Retains the source backup and removes temporary database/container artifacts;
   on failure, it rolls back the database swap and restarts staging.

The refresh never calls the image deployment command. AI categorization and
banking/provider integrations remain disabled in staging.

## Contract tests

From the API repository:

```bash
bash ops/tests/tempo-production-deploy-test.sh
bash ops/tests/tempo-staging-poller-test.sh
bash ops/tests/tempo-staging-reconcile-test.sh
bash ops/tests/tempo-staging-github-intent-test.sh
bash ops/tests/tempo-staging-compose-test.sh
bash ops/tests/tempo-staging-refresh-test.sh
bash ops/tests/tempo-staging-refresh-integration-test.sh
```

The fake-runtime tests do not connect to GitHub, PostgreSQL, Redis, Mailpit, or
any live Docker daemon. Activating the reviewed host snapshots and allowing the
first real-data refresh remain separately gated host operations; browser
verification, credential provisioning/revocation, SSH/Tailscale cleanup, and
public-history rewriting are likewise separate tasks.
