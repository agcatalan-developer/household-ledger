#!/usr/bin/env bash
# deploy/deploy.sh <tag-or-commit>
# Run ON THE SERVER as the `ledger` user. Build on the box — one less pipeline,
# and a two-user app does not need CI minutes spent on rsync (deployment.md).
#
#   ./deploy/deploy.sh v1.0.0
#
set -euo pipefail   # a failed step must NOT reach the restart

REF="${1:?usage: deploy.sh <tag-or-commit>}"
APP_DIR=/srv/household-ledger

cd "$APP_DIR"

echo "→ fetching $REF"
git fetch --all --tags
git checkout "$REF"          # a tag or commit, never a branch name

echo "→ installing"
npm ci

echo "→ building client + server"
npm run build

echo "→ migrating (forward only — additive migrations after launch)"
npm run migrate              # before restart: new code expects the new schema

echo "→ restarting"
sudo systemctl restart household-ledger

echo "→ health check"
for i in $(seq 1 10); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
    echo "✓ up ($REF)"
    exit 0
  fi
  sleep 1
done
echo "✗ did not come up — check: journalctl -u household-ledger -n 50"
exit 1
