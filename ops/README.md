# Tempo production image deployment

This directory contains the reviewed, host-side deployer. The production host does not run a GitHub Actions runner, pull a repository checkout, execute moving repository code, or accept an inbound webhook.

## How it works

- Successful `main` workflows publish immutable full-commit-SHA images to GHCR.
- A host-local systemd timer checks both `main` refs every five minutes. A no-op reads state and ref metadata only; it does not pull images, invoke Compose, restart containers, or run migrations.
- When a ref changes, the updater pulls the matching SHA image, recreates only `api` and `web` with `--no-deps`, and checks container and served-route health. An API update also recreates `web` so Nginx refreshes Docker DNS.
- API and web repositories advance independently, so the deployed pair is not atomic. The host converges on the latest successful image from each repository.

## Database changes

Production API startup runs pending TypeORM migrations. A migration included in a published API image is applied when that image starts. The updater itself never invokes migration, seed, or schema-bootstrap commands. If startup or health verification fails, rollback restores application images only; it cannot undo an applied database migration. Keep migrations backward-compatible with the previous application, and separately review and back up destructive or incompatible schema changes. A fresh production database needs a separate, reviewed schema initialization before the timer is enabled.

## Safety and host boundary

- Postgres, Redis, Mailpit, their volumes, and production data are never recreated by this deployer.
- The updater never runs `down`, `rm`, `--volumes`, or `build`; it recreates only application containers and keeps one rollback pair. Successful deployments remove stale application image references, and verified rollbacks remove pulled candidates, but a failed rollback leaves candidates for safety. Unrelated images and build cache are not pruned.
- Monitor host disk usage with `df -h /` and `docker system df`; the updater has no global Docker quota or low-disk guard.
- Keep the installed updater and Compose manifest as reviewed host-local snapshots; do not execute a moving public checkout.
- Keep `/etc/tempo/production.env`, the banking key, deployment state, and any private-GHCR Docker config outside Git. The service uses `/var/lib/tempo-deploy/docker-config` because `ProtectHome=true` hides account home directories.
- The service runs under the existing host account selected by the systemd template (`User=%i`); no dedicated `tempo` account is required. Docker-group membership is effectively privileged.

## Host setup

Install and activate the reviewed `ops/` snapshot only after both repository PRs are merged and the production host change is separately approved. Initialize deployment state from the running application containers before enabling the timer; initialization writes state only and does not restart containers or touch volumes.

## Operations

```text
DEPLOY_USER="$(id -un)"
sudo systemctl list-timers "tempo-production-deploy@${DEPLOY_USER}.timer"
sudo journalctl -u "tempo-production-deploy@${DEPLOY_USER}.service"
sudo systemctl start "tempo-production-deploy@${DEPLOY_USER}.service"
```

A no-op should report matching API/web SHAs without invoking Compose. After an approved rollout, verify the API health endpoint, `http://127.0.0.1:8080/tempo/`, and `http://127.0.0.1:8080/tempo/api/health`. Inspect Docker's reclaimable objects before cleanup; never use broad cleanup commands while production data or unrelated local work is present.
