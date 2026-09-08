# Tempo production image deployment

This directory contains the reviewed, host-side deployment entrypoint and systemd templates. The production host does not run a GitHub Actions runner, pull repository checkouts, execute repository scripts, or accept an inbound webhook.

## Flow

Successful `main` workflows publish immutable full-commit-SHA images to GHCR. The host timer runs the selected `tempo-production-deploy@<host-user>` instance every five minutes. The script resolves both public `main` refs, prepares exact SHA tags for changed repositories, resolves their digests, and updates only the `api` and `web` services. It checks API/web health and the served routes, retains one rollback pair, never invokes migration or seed commands itself, and never runs `down`, `rm`, `--volumes`, or `build`. In production, the API process runs pending TypeORM migrations during startup, so a migration included in the deployed API image is applied before the API becomes healthy.

The API and web repositories can advance independently. The host therefore converges on the latest successful image available for each repository; it does not promise an atomic cross-repository release pair. The updater passes only the two candidate image references through a temporary mode-600 Compose env file; production secrets stay in the separate env file and are never exported by the updater.

The API currently runs pending TypeORM migrations during production startup. A migration included in a published API image is therefore applied when that image starts. If startup migration or health verification fails, the updater attempts an application-only rollback; it does not undo an already-applied database migration. Keep migrations backward-compatible with the previous application during rollout, and separately review and back up any destructive or incompatible schema change before production deployment.

## One-time installation

Perform these steps only after reviewing and merging the API and web PRs, and after separately approving the production host change. Run them from this repository at the reviewed commit:

```text
DEPLOY_USER="$(id -un)"
DEPLOY_GROUP="$(id -gn)"
sudo usermod --append --groups docker "$DEPLOY_USER"
sudo install -d -o root -g root -m 0755 /etc/tempo
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0750 /var/lib/tempo-deploy
sudo install -o root -g root -m 0644 docker-compose.production.yml /etc/tempo/production.compose.yml
sudo install -o root -g root -m 0755 ops/tempo-production-deploy.sh /usr/local/libexec/tempo-production-deploy
sudo install -o root -g root -m 0644 ops/systemd/tempo-production-deploy@.service /etc/systemd/system/tempo-production-deploy@.service
sudo install -o root -g root -m 0644 ops/systemd/tempo-production-deploy@.timer /etc/systemd/system/tempo-production-deploy@.timer
sudo install -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0600 /path/to/existing/production.env /etc/tempo/production.env
sudo systemctl daemon-reload
```

The service is a systemd template. `%i` is replaced with the instance name, so the timer runs under the existing host account selected during activation; no dedicated `tempo` account is created. The selected account must belong to `docker`; membership in that group is effectively privileged. The production environment file and Enable Banking private key stay outside Git and retain mode `600`. Ensure the key path in the production environment is readable by the selected account. The installed Compose manifest is a root-owned snapshot; it is not automatically replaced by later public repository changes.

If GHCR packages are private, authenticate Docker as the selected host account with a GitHub classic personal access token limited to `read:packages`:

```text
DEPLOY_USER="$(id -un)"
printf '%s\n' "$GHCR_TOKEN" | docker login ghcr.io --username "$DEPLOY_USER" --password-stdin
unset GHCR_TOKEN
```

Never put that token in this repository or a systemd unit. Public GHCR container packages can be pulled without a registry credential.

Before enabling the timer, initialize rollback state from the currently running application containers. This writes only `/var/lib/tempo-deploy/images.env`; it does not restart containers or touch volumes:

```text
sudo -u "$DEPLOY_USER" /usr/local/libexec/tempo-production-deploy --initialize
sudo chmod 600 /var/lib/tempo-deploy/images.env
```

Review the generated image references and then, as a separate approved action, enable the timer for the existing account:

```text
sudo systemctl enable --now "tempo-production-deploy@${DEPLOY_USER}.timer"
sudo systemctl status --no-pager "tempo-production-deploy@${DEPLOY_USER}.timer"
```

## Operations

```text
DEPLOY_USER="$(id -un)"
sudo systemctl list-timers "tempo-production-deploy@${DEPLOY_USER}.timer"
sudo journalctl -u "tempo-production-deploy@${DEPLOY_USER}.service"
sudo systemctl start "tempo-production-deploy@${DEPLOY_USER}.service"
```

A no-op run should report that both current main SHAs are already deployed and should not invoke Compose. A rollout should show only `api` and `web` being recreated. Verify the API health endpoint, `http://127.0.0.1:8080/tempo/`, and `http://127.0.0.1:8080/tempo/api/health` after the first approved rollout.

Keep the active image and one rollback image per service. Inspect Docker's reclaimable objects before any cleanup; do not use broad cleanup commands while production data or unrelated local work is present. This deployment mechanism never performs database migrations or schema bootstrap.
