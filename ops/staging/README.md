# Staging

Staging is a separate copy of Tempo on this host, deployed with `tempo-deploy staging --api <tag> --web <tag>` (see [`../README.md`](../README.md)).

## Layout

- Rootless Docker daemon: socket `$XDG_RUNTIME_DIR/tempo-staging/docker.sock`, data in `~/.local/share/tempo-staging/docker`
- Compose project `tempo-staging`: its own PostgreSQL, Redis, Mailpit, API, web, volumes and networks
- Config: `~/.config/tempo-staging/staging.compose.yml` and `staging.env` (secrets plus the deployed image digests; template in `staging.env.example`)
- State: `~/.local/state/tempo-staging/`
- URL: `http://127.0.0.1:8119/tempo/`, loopback only

## Safety

The Compose file hard-codes `BANKING_INTEGRATION_ENABLED=false`, `AI_CATEGORIZATION_ENABLED=false` and `AI_CATEGORIZATION_WEB_SEARCH_ENABLED=false`, and the env template has no OpenAI or banking keys, so staging makes no billable AI calls and no bank calls.

## Database refresh

After a deploy changes an image, `tempo-staging-refresh.sh` restores the newest `~/backups/tempo/tempo-YYYYMMDD-HHMMSS.dump` into a temporary staging database, applies the current schema, clears provider sessions and sync state, swaps it in, flushes staging Redis and health-checks the stack. A failed refresh rolls the swap back. It never connects to production.

The restored data keeps your production login (email and password hash), which is why staging must stay on loopback. Production sessions are not copied, so sign in again after a refresh.
