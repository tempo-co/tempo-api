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
atomically, and writes rollback state. It never updates PostgreSQL, Redis, or
Mailpit during image deployment.

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

`tempo-staging-refresh.sh` is separate from image deployment and requires an
explicit command-line confirmation:

```text
--confirm-seeded-reset
--confirm-production-backup-refresh
```

The production refresh path:

1. Starts only staging PostgreSQL/Redis/Mailpit through the rootless staging
   Compose project.
2. Runs a local custom-format `pg_dump` inside the production PostgreSQL
   container and stores the temporary dump under the staging state directory
   with mode `0600`.
3. Copies the dump into the staging PostgreSQL container and restores it into a
   temporary database.
4. Applies current-image schema work, clears banking provider authorization and
   sync-run state, and validates the sanitized result.
5. Stops staging API/web, atomically renames the temporary database into the
   configured staging database, flushes only staging Redis/BullMQ state, and
   restarts/health-checks staging.
6. Drops temporary/previous databases and the local dump after success; rolls
   back the database rename and restarts staging on failure.

Production PostgreSQL is read-only in this operation. Production Redis is never
read or copied. The refresh command never calls the image deployment command and
cannot be triggered by the promotion workflow.

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
any live Docker daemon. Live staging deployment, refresh, browser verification,
credential provisioning/revocation, SSH/Tailscale cleanup, and public-history
rewriting remain separately gated operations.
