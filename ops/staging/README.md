# Persistent staging

This directory defines one persistent, tailnet-only staging slot. It is deliberately separate from the production Compose project and must use the dedicated rootless Docker socket. Staging must use a distinct HTTPS hostname from production; a `/staging` path on the production hostname is rejected because it does not create a browser-origin boundary. A separate tagged host is preferred, but a second userspace Tailscale node on this machine is supported as a lower-isolation fallback.

## One-time host setup

1. Install the rootless prerequisites from an interactive terminal. The existing Ubuntu `docker.io` daemon does not include `dockerd-rootless.sh`; install the rootless binaries into the user account with Docker's official rootless installer without replacing or reconfiguring production Docker:

   ```text
   sudo apt-get install -y jq rootlesskit slirp4netns fuse-overlayfs uidmap
   curl -fsSL https://get.docker.com/rootless | sh
   ```

   Verify `~/bin/dockerd-rootless.sh` exists before continuing.

2. Use a separate Linux host or VM with a tag-based Tailscale identity for staging when available. If this production node is the only machine, use the separate userspace daemon described in `/home/sami/Documents/tempo-staging-second-tailscale-setup.txt`; keep its state/socket separate and do not retag or restart the production Tailscale daemon. Define and approve the `svc:tempo-staging` Tailscale Service, then advertise the staging host's local web port through it.
3. Create `~/.config/tempo-staging/staging.env` from `staging.env.example`. Set `PRODUCTION_PUBLIC_URL` to the production `/tempo` URL and `STAGING_PUBLIC_URL` to the distinct staging Service hostname with `/staging`; generate every secret locally with hex/base64-safe values, set the API/web image digests, and keep the file mode at `600`.
4. Run `install-rootless-daemon.sh`, then verify the user service is healthy:

   ```text
   bash install-rootless-daemon.sh
   systemctl --user status tempo-staging-docker.service
   ```

5. Install the forced-command SSH key and staging files with `install-staging-host.sh --ssh-public-key-file <deploy-public-key>`.
6. The staging user must have `gh auth status` working for both repositories. If GHCR packages are private, authenticate the rootless daemon to `ghcr.io` interactively before promotion. The verifier uses built-in `docker manifest inspect`; Buildx is not required.

The installer does not modify `/etc/tempo`, the production Compose project, production volumes, or `/var/run/docker.sock`.

## Local operations

Validation does not contact Docker and is safe to run before the daemon is installed:

```text
./tempo-staging-deploy.sh validate
./tempo-staging-refresh.sh validate
```

The stack uses only the rootless daemon:

```text
./tempo-staging-deploy.sh up
./tempo-staging-deploy.sh status
```

Component promotion is independent. The host SSH verifier updates only the selected image line, serializes concurrent promotions, validates the same-repository PR head/checks through GitHub, and records non-secret metadata in the staging state directory.

Production-data refresh and seeded reset are both destructive to **staging only** and require their exact confirmation flags:

```text
./tempo-staging-refresh.sh refresh --confirm-production-backup-refresh
./tempo-staging-refresh.sh seed --confirm-seeded-reset
```

Refresh restores the newest verified `tempo-*.sql.gz` from `$HOME/backups/tempo`, applies the current API schema complement in a temporary database, clears provider authorization/sync state, swaps databases only after validation, flushes staging Redis, and health-checks the stack.

## GitHub Actions

The API and web repositories each have an independent manual `workflow_dispatch` workflow. Each workflow:

- accepts a PR number only;
- rejects drafts, closed PRs, fork PRs, non-`main` bases, and any failing, pending, cancelled, or timed-out check/status on the exact head SHA (expected skipped checks are allowed);
- builds only on `ubuntu-latest`;
- pushes a SHA-tagged GHCR image and deploys by immutable digest;
- joins the tailnet with the pinned Tailscale action; and
- uses the forced-command SSH key, never a shell or self-hosted runner.

Configure the staging environment with the repository/environment variables `STAGING_DEPLOY_HOST` and `STAGING_DEPLOY_USER`, plus the secrets `STAGING_TAILSCALE_OAUTH_CLIENT_ID`, `STAGING_TAILSCALE_OAUTH_SECRET`, `STAGING_SSH_PRIVATE_KEY`, and `STAGING_SSH_KNOWN_HOSTS`.
