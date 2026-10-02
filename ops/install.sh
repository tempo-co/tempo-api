#!/usr/bin/env bash
# Install the deploy script and a target's host files from this checkout.
#
#   ops/install.sh staging   # as the staging user
set -Eeuo pipefail

REPO=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
VERSION=$(git -C "$REPO" rev-parse HEAD)

copy() { install -D -m "$1" "$2" "$3" && echo "installed $3"; }

install_script() {
    local dir=$1
    copy 755 "$REPO/ops/deploy.sh" "$dir/deploy.sh"
    copy 644 "$REPO/ops/targets/production.env" "$dir/targets/production.env"
    copy 644 "$REPO/ops/targets/staging.env" "$dir/targets/staging.env"
    echo "$VERSION" >"$dir/VERSION"
}

case ${1:-} in
    staging)
        [[ $EUID != 0 ]] || { echo 'run the staging install as the staging user, not root' >&2; exit 1; }
        install_script "$HOME/.local/lib/tempo-deploy"
        mkdir -p "$HOME/.local/bin"
        ln -sfn "$HOME/.local/lib/tempo-deploy/deploy.sh" "$HOME/.local/bin/tempo-deploy"
        copy 644 "$REPO/ops/staging/docker-compose.yml" "$HOME/.config/tempo-staging/staging.compose.yml"
        copy 700 "$REPO/ops/staging/tempo-staging-refresh.sh" "$HOME/.config/tempo-staging/tempo-staging-refresh.sh"
        ;;
    *)
        echo "usage: $0 staging" >&2
        exit 2
        ;;
esac
echo "installed tempo-deploy $VERSION"
