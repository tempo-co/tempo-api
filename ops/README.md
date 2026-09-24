# Tempo operations

## Image deployment

`ops/tempo-deploy.sh` is the target-aware image reconciler. It keeps the
production and staging contracts explicit:

```bash
# Existing production entrypoint, preserved for the installed systemd unit.
/usr/local/libexec/tempo-production-deploy

# Isolated staging poller.
~/.local/bin/tempo-deploy --target staging
```

Production uses the rootful Docker socket, `/etc/tempo/production.compose.yml`,
`/etc/tempo/production.env`, `/var/lib/tempo-deploy/`, and the existing
production container names/routes. Staging uses the dedicated rootless socket,
`tempo-staging` Compose project, separate state, separate volumes, and
loopback port `8119`. The reconciler recreates only API/web and verifies the
Postgres and Redis container IDs in production, plus staging Mailpit.

Production sends email through authenticated Gmail SMTP at `smtp.gmail.com:587`
with required STARTTLS. Keep `EMAIL_USERNAME`, `EMAIL_PASSWORD`, and `EMAIL_FROM`
in the owner-controlled production env file; the checked-in Compose manifest
sets only the non-secret transport requirements. Development and staging keep
Mailpit and receive no Gmail credentials.

Staging promotion is not based on a moving branch or mutable image tag. The
protected manual workflows in the API and web repositories publish immutable
GHCR image digests and a successful GitHub deployment record. The host poller
validates the exact repository, component, PR head, image digest, workflow
metadata, and check evidence before pulling.

See [`staging/README.md`](staging/README.md) for the staging isolation,
no-provider/no-AI policy, promotion workflow, and PostgreSQL-only refresh.

## Production deployment reference

The existing production service/timer invoke the installed
`tempo-production-deploy` entrypoint. The repository wrapper delegates to the
shared target-aware engine, while production configuration and Docker state stay
outside the repository and are not modified by staging operations.

The reviewed host snapshots must be updated separately after approval: install
the production Compose/deployer changes and provision the SMTP credentials and
sender in `/etc/tempo/production.env` before recreating the API. Keep the
production Mailpit container until delivery is verified, then remove only that
container; do not prune volumes or run a broad Compose teardown.

The production deployment contract tests run entirely against fake Docker/Git
and HTTP commands:

```bash
bash ops/tests/tempo-production-deploy-test.sh
```

They cover bootstrap, no-op, immutable main-image resolution, API-only and
web-only changes, stateful-container protection, pull/rollout failure cleanup,
rollback, health routes, and persistent state.

## Host installation boundary

A host installation must copy reviewed snapshots of the deployment script,
refresh script, Compose manifest, env template, and systemd units into
root-owned or owner-scoped paths with restrictive permissions. It must verify
rootless Docker mode, the exact staging socket/data root, required utilities
(`docker`, Compose, `curl`, `jq`/Python where used, `flock`), and free disk
before enabling a timer.

Do not install, enable, deploy, refresh, revoke credentials, remove the old
SSH path, or rewrite public history as part of a repository test. Those are
separate approved operations with read-back verification and rollback plans.
