#!/usr/bin/env bash
set -euo pipefail

readonly script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly compose_file="$script_dir/docker-compose.yml"
readonly deploy_script="${TEMPO_STAGING_DEPLOY_SCRIPT:-$script_dir/tempo-staging-deploy.sh}"
readonly env_file="${TEMPO_STAGING_ENV_FILE:-$HOME/.config/tempo-staging/staging.env}"
readonly backup_dir="${TEMPO_STAGING_REFRESH_BACKUP_DIR:-$HOME/backups/tempo}"
readonly runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
readonly expected_docker_host="unix://$runtime_dir/tempo-staging/docker.sock"
readonly docker_host="${TEMPO_STAGING_DOCKER_HOST:-$expected_docker_host}"
readonly project_name='tempo-staging'
readonly state_dir="${TEMPO_STAGING_STATE_DIR:-$HOME/.local/state/tempo-staging}"
readonly pgpass_path='/tmp/tempo-staging.pgpass'

cleanup_databases=()
pgpass_initialized=0

fail() {
  printf 'tempo staging refresh: %s\n' "$1" >&2
  exit 1
}

[[ -f "$compose_file" ]] || fail "missing Compose file: $compose_file"
[[ -f "$env_file" && ! -L "$env_file" ]] || fail 'staging environment file is missing or a symlink'
[[ -x "$deploy_script" ]] || fail "staging deploy script is missing or not executable: $deploy_script"
[[ "$docker_host" == "$expected_docker_host" ]] || fail "staging Docker host must be $expected_docker_host"

mode=$(stat -c '%a' "$env_file")
mode_value=$((8#$mode))
(( mode_value == 0600 )) || fail 'staging environment file must have mode 600'

validate_unique_env_keys() {
  python3 - "$env_file" <<'PY'
import sys

path = sys.argv[1]
seen = {}
with open(path, encoding='utf-8') as handle:
    for line_number, raw_line in enumerate(handle, 1):
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        if line.split(None, 1)[0] == 'export':
            raise SystemExit(f'export syntax is not supported in staging environment files (line {line_number})')
        key, separator, _ = line.partition('=')
        if not separator:
            continue
        key = key.strip()
        if key in seen:
            raise SystemExit(f'duplicate staging environment key: {key} (lines {seen[key]} and {line_number})')
        seen[key] = line_number
PY
}

validate_unique_env_keys || fail 'staging environment file contains duplicate keys'

read_env_value() {
  python3 - "$env_file" "$1" <<'PY'
import sys

path, wanted = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    for raw_line in handle:
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if separator and key.strip() == wanted:
            print(value.strip().strip('"').strip("'"))
            break
    else:
        raise SystemExit(1)
PY
}

staging_public_url=$(read_env_value STAGING_PUBLIC_URL) || fail 'STAGING_PUBLIC_URL is missing'
production_public_url=$(read_env_value PRODUCTION_PUBLIC_URL) || fail 'PRODUCTION_PUBLIC_URL is missing'
[[ "$staging_public_url" =~ ^https://[^/]+/staging/?$ ]] || fail 'STAGING_PUBLIC_URL must be the tailnet HTTPS /staging URL'
[[ "$production_public_url" =~ ^https://[^/]+/tempo/?$ ]] || fail 'PRODUCTION_PUBLIC_URL must be the production HTTPS /tempo URL'
python3 - "$staging_public_url" "$production_public_url" <<'PY'
from urllib.parse import urlparse
import sys

staging, production = (urlparse(value) for value in sys.argv[1:])
if staging.hostname == production.hostname:
    raise SystemExit('staging and production URLs must use different hostnames')
PY

staging_db_user=$(read_env_value STAGING_DB_USERNAME) || fail 'STAGING_DB_USERNAME is missing'
staging_db_password=$(read_env_value STAGING_DB_PASSWORD) || fail 'STAGING_DB_PASSWORD is missing'
staging_db_name=$(read_env_value STAGING_DB_NAME) || fail 'STAGING_DB_NAME is missing'
[[ "$staging_db_user" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || fail 'STAGING_DB_USERNAME is not a safe PostgreSQL identifier'
[[ "$staging_db_name" =~ ^[a-z_][a-z0-9_]{0,38}$ ]] || fail 'STAGING_DB_NAME is not a safe PostgreSQL identifier'
[[ "$staging_db_name" != postgres && "$staging_db_name" != template0 && "$staging_db_name" != template1 ]] || fail 'STAGING_DB_NAME is a reserved PostgreSQL database'

for forbidden in ENABLE_BANKING_PRIVATE_KEY_B64 ENABLE_BANKING_PRIVATE_KEY_PATH TEMPO_PRODUCTION_ENV_FILE TEMPO_PRODUCTION_COMPOSE_FILE OPENAI_API_KEY; do
  if python3 - "$env_file" "$forbidden" <<'PY'
import sys
path, forbidden = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    for raw_line in handle:
        line = raw_line.strip()
        if line and not line.startswith('#') and line.split('=', 1)[0].strip() == forbidden:
            raise SystemExit(0)
raise SystemExit(1)
PY
  then
    fail "forbidden production/provider key is present: $forbidden"
  fi
done

compose() {
  env -u TEMPO_API_IMAGE \
    -u TEMPO_WEB_IMAGE \
    -u STAGING_PUBLIC_URL \
    -u STAGING_WEB_HOST_PORT \
    -u STAGING_DB_USERNAME \
    -u STAGING_DB_PASSWORD \
    -u STAGING_DB_NAME \
    -u SESSION_SECRET \
    -u BANKING_SESSION_ENCRYPTION_KEY_B64 \
    -u DOCKER_CONTEXT \
    TEMPO_STAGING_ENV_FILE="$env_file" \
    DOCKER_HOST="$docker_host" \
    docker compose \
      --project-name "$project_name" \
      --file "$compose_file" \
      --env-file "$env_file" \
      "$@"
}

docker_cli() {
  env -u DOCKER_CONTEXT DOCKER_HOST="$docker_host" docker "$@"
}

require_daemon() {
  local socket_path="${docker_host#unix://}"
  local security_options docker_root
  [[ -S "$socket_path" ]] || fail "staging Docker socket is missing: $socket_path"
  security_options=$(docker_cli info --format '{{json .SecurityOptions}}' 2>/dev/null) || fail 'staging Docker daemon is not reachable'
  docker_root=$(docker_cli info --format '{{.DockerRootDir}}' 2>/dev/null) || fail 'staging Docker root cannot be inspected'
  [[ "$security_options" == *rootless* ]] || fail 'staging Docker daemon is not rootless'
  [[ "$docker_root" == "$HOME/.local/share/tempo-staging/docker" ]] || fail 'staging Docker root is outside the staging data root'
}

latest_backup() {
  python3 - "$backup_dir" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
files = [path for path in root.glob('tempo-*.sql.gz') if path.is_file() and not path.is_symlink()]
if not files:
    raise SystemExit('no production SQL backups found')
print(max(files, key=lambda path: path.stat().st_mtime))
PY
}

validate_backup() {
  local backup="$1"
  [[ -f "$backup" && ! -L "$backup" ]] || fail 'selected backup is missing or a symlink'
  [[ "$(stat -c '%s' "$backup")" -gt 0 ]] || fail 'selected backup is empty'
  gzip -t "$backup" || fail 'selected backup failed gzip integrity validation'
}

wait_for_healthy() {
  local service="$1"
  local container status
  for _ in $(seq 1 60); do
    container=$(compose ps -q "$service" 2>/dev/null || true)
    if [[ -n "$container" ]]; then
      status=$(docker_cli inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)
      case "$status" in
        healthy) return 0 ;;
        exited|dead) fail "$service container is $status" ;;
      esac
    fi
    sleep 2
done
  fail "$service did not become healthy"
}

ensure_dependencies() {
  compose up -d postgres redis mailpit
  wait_for_healthy postgres
  wait_for_healthy redis
  wait_for_healthy mailpit
}

ensure_pgpass() {
  (( pgpass_initialized == 1 )) && return 0
  printf '%s\n' "$staging_db_password" | compose exec -T postgres sh -c '
    set -eu
    umask 077
    password=$(cat)
    escaped=$(printf '%s' "$password" | sed "s/[\\\\:]/\\\\&/g")
    printf "*:*:*:%s:%s\n" "$1" "$escaped" > "$2"
    chmod 600 "$2"
  ' -- "$staging_db_user" "$pgpass_path"
  pgpass_initialized=1
}

psql_admin() {
  ensure_pgpass
  compose exec -T postgres sh -c '
    set -eu
    passfile="$1"
    user="$2"
    shift 2
    PGPASSFILE="$passfile" psql -v ON_ERROR_STOP=1 -U "$user" -d postgres "$@"
  ' -- "$pgpass_path" "$staging_db_user" "$@"
}

psql_db() {
  local database="$1"
  shift
  ensure_pgpass
  compose exec -T postgres sh -c '
    set -eu
    passfile="$1"
    user="$2"
    database="$3"
    shift 3
    PGPASSFILE="$passfile" psql -v ON_ERROR_STOP=1 -U "$user" -d "$database" "$@"
  ' -- "$pgpass_path" "$staging_db_user" "$database" "$@"
}

acquire_mutation_lock() {
  [[ ! -L "$state_dir" ]] || fail 'staging state directory must not be a symlink'
  mkdir -p "$state_dir"
  chmod 700 "$state_dir"
  exec 9>"$state_dir/deploy.lock"
  flock -x 9
}

cleanup_pending_databases() {
  local database
  for database in "${cleanup_databases[@]}"; do
    [[ -n "$database" ]] || continue
    psql_admin -c "DROP DATABASE IF EXISTS \"$database\";" >/dev/null 2>&1 || true
  done
  if (( pgpass_initialized == 1 )); then
    compose exec -T postgres sh -c 'rm -f "$1"' -- "$pgpass_path" >/dev/null 2>&1 || true
  fi
}

trap cleanup_pending_databases EXIT

drop_database() {
  local database="$1"
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$database' AND pid <> pg_backend_pid();" >/dev/null
  psql_admin -c "DROP DATABASE IF EXISTS \"$database\";" >/dev/null
}

create_database() {
  local database="$1"
  psql_admin -c "CREATE DATABASE \"$database\";" >/dev/null
}

prepare_refresh_database() {
  local backup="$1"
  local refresh_database="${staging_db_name}_refresh"
  cleanup_databases=("$refresh_database")
  drop_database "$refresh_database"
  create_database "$refresh_database"
  gzip -dc "$backup" | psql_db "$refresh_database"
  compose run --rm --no-deps -T -e "DB_NAME=$refresh_database" api node ./dist/scripts/schema.js
  psql_db "$refresh_database" -c "UPDATE bank_connections SET \"providerSessionId\" = NULL, \"authorizationStateHash\" = NULL, status = 'FAILED', \"consentValidUntil\" = NULL, \"lastSyncedAt\" = NULL, \"lastSyncError\" = NULL, \"nextSyncAt\" = NULL, \"syncStartedAt\" = NULL, \"syncStatus\" = 'IDLE', \"syncFailureCount\" = 0, \"updatedAt\" = NOW();" >/dev/null
  local unsafe_provider_state
  unsafe_provider_state=$(psql_db "$refresh_database" -At -c "SELECT COUNT(*) FROM bank_connections WHERE \"providerSessionId\" IS NOT NULL OR \"authorizationStateHash\" IS NOT NULL OR status IN ('AUTHORIZED', 'EXPIRED', 'RUNNING');")
  [[ "$unsafe_provider_state" == 0 ]] || fail 'sanitized refresh database still contains provider state'
  local account_count
  account_count=$(psql_db "$refresh_database" -At -c 'SELECT COUNT(*) FROM accounts;')
  [[ "$account_count" =~ ^[1-9][0-9]*$ ]] || fail 'sanitized refresh database contains no accounts'
}

prepare_seed_database() {
  local refresh_database="${staging_db_name}_refresh"
  cleanup_databases=("$refresh_database")
  drop_database "$refresh_database"
  create_database "$refresh_database"
  compose run --rm --no-deps -T -e "DB_NAME=$refresh_database" api node ./dist/scripts/seed.js
  local account_count
  account_count=$(psql_db "$refresh_database" -At -c 'SELECT COUNT(*) FROM accounts;')
  [[ "$account_count" =~ ^[1-9][0-9]*$ ]] || fail 'seeded database contains no accounts'
}

rollback_database() {
  local refresh_database="$1"
  local previous_database="$2"
  local failed_database="${refresh_database}_failed"
  local rollback_failed=0
  local database_state

  compose stop api web >/dev/null 2>&1 || rollback_failed=1
  psql_admin -c "ALTER DATABASE \"$staging_db_name\" RENAME TO \"$failed_database\";" >/dev/null 2>&1 || rollback_failed=1
  cleanup_databases=("$failed_database")
  psql_admin -c "ALTER DATABASE \"$previous_database\" RENAME TO \"$staging_db_name\";" >/dev/null 2>&1 || rollback_failed=1
  compose exec -T redis redis-cli FLUSHALL >/dev/null 2>&1 || rollback_failed=1
  TEMPO_STAGING_ENV_FILE="$env_file" TEMPO_STAGING_STATE_DIR="$state_dir" TEMPO_STAGING_LOCK_HELD=1 "$deploy_script" up >/dev/null 2>&1 || rollback_failed=1
  database_state=$(psql_admin -At -c "SELECT (SELECT COUNT(*) FROM pg_database WHERE datname = '$staging_db_name') = 1 AND (SELECT COUNT(*) FROM pg_database WHERE datname = '$previous_database') = 0 AND (SELECT COUNT(*) FROM pg_database WHERE datname = '$failed_database') = 1;" 2>/dev/null || true)
  [[ "$database_state" == t ]] || rollback_failed=1
  (( rollback_failed == 0 ))
}

switch_database() {
  local refresh_database="${staging_db_name}_refresh"
  local previous_database="${staging_db_name}_previous_$(date -u +%Y%m%d%H%M%S)"
  [[ "${#previous_database}" -le 63 ]] || fail 'previous database name is too long'
  cleanup_databases=("$refresh_database" "${refresh_database}_failed")
  compose stop api web >/dev/null 2>&1
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$staging_db_name' AND pid <> pg_backend_pid();" >/dev/null
  psql_admin -c "ALTER DATABASE \"$staging_db_name\" RENAME TO \"$previous_database\";" >/dev/null
  cleanup_databases=("$refresh_database" "${refresh_database}_failed")
  if ! psql_admin -c "ALTER DATABASE \"$refresh_database\" RENAME TO \"$staging_db_name\";" >/dev/null; then
    if psql_admin -c "ALTER DATABASE \"$previous_database\" RENAME TO \"$staging_db_name\";" >/dev/null; then
      cleanup_databases=("$refresh_database")
    fi
    fail 'staging database swap failed before activation'
  fi

  if ! (psql_db "$staging_db_name" -At -c 'SELECT 1;' >/dev/null && compose exec -T redis redis-cli FLUSHALL >/dev/null && TEMPO_STAGING_ENV_FILE="$env_file" TEMPO_STAGING_STATE_DIR="$state_dir" TEMPO_STAGING_LOCK_HELD=1 "$deploy_script" up); then
    if rollback_database "$refresh_database" "$previous_database"; then
      fail 'staging health failed; previous database restored and rollback verified'
    fi
    fail 'staging health failed; rollback verification failed and manual intervention is required'
  fi

  drop_database "$previous_database" || fail "staging refresh succeeded but old database could not be removed: $previous_database"
  cleanup_databases=()
}

validate_only() {
  local backup
  backup=$(latest_backup) || fail 'no valid production backup was found'
  validate_backup "$backup"
  "$deploy_script" validate
  printf 'tempo staging refresh validation: PASS backup=%s\n' "$(basename "$backup")"
}

case "${1:-validate}" in
  validate)
    [[ $# == 1 ]] || fail 'usage: validate|refresh --confirm-production-backup-refresh|seed --confirm-seeded-reset'
    validate_only
    ;;
  refresh)
    [[ "${2:-}" == --confirm-production-backup-refresh ]] || fail 'refresh requires --confirm-production-backup-refresh'
    acquire_mutation_lock
    require_daemon
    validate_only
    ensure_dependencies
    backup=$(latest_backup)
    validate_backup "$backup"
    prepare_refresh_database "$backup"
    switch_database
    ;;
  seed)
    [[ "${2:-}" == --confirm-seeded-reset ]] || fail 'seed requires --confirm-seeded-reset'
    acquire_mutation_lock
    require_daemon
    "$deploy_script" validate
    ensure_dependencies
    prepare_seed_database
    switch_database
    ;;
  *)
    fail 'usage: validate|refresh --confirm-production-backup-refresh|seed --confirm-seeded-reset'
    ;;
esac
