#!/usr/bin/env bash
# Deploys agent-server + mcp-server + Caddy to the Oracle Cloud VM: copies
# only what the images need, builds them on the VM, and (re)starts the
# compose stack. Safe to re-run for every update. A separate directory
# (~/koya-week6/app) from week-5's own ~/koya/app, so the two projects'
# deploys never collide on this shared VM.
# Adapted from week-5/app/scripts/deploy-worker.sh (Task 13).
#
#   KOYA_WORKER_HOST=<public ip> scripts/deploy.sh
#
# Production settings live on the VM in ~/koya-week6/.env (mode 600),
# written once by scripts/write-production-env.sh - never copied from here.
set -euo pipefail

HOST="${KOYA_WORKER_HOST:-129.146.79.96}"
USER_AT="${KOYA_WORKER_USER:-ubuntu}@${HOST}"
KEY="${KOYA_WORKER_KEY:-$HOME/.ssh/koya_oracle}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$USER_AT")
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Copying sources to $HOST..."
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  --exclude node_modules --exclude '.env*' --exclude '*.tmp.ts' \
  --relative \
  "$APP_DIR/./package.json" "$APP_DIR/./pnpm-lock.yaml" "$APP_DIR/./pnpm-workspace.yaml" \
  "$APP_DIR/./docker-compose.yml" "$APP_DIR/./Caddyfile" \
  "$APP_DIR/./packages/core" "$APP_DIR/./agent-server" "$APP_DIR/./mcp-server" \
  "$USER_AT:koya-week6/app/"

echo "Building images and (re)starting the stack..."
"${SSH[@]}" bash -s <<'REMOTE'
set -euo pipefail
cd ~/koya-week6/app
test -f ~/koya-week6/.env || { echo "~/koya-week6/.env is missing - run scripts/write-production-env.sh first." >&2; exit 1; }
ln -sf ~/koya-week6/.env .env
sudo docker compose build
sudo docker compose up -d
sleep 5
sudo docker compose ps
echo "--- agent-server logs ---"
sudo docker compose logs --tail 20 agent-server
echo "--- mcp-server logs ---"
sudo docker compose logs --tail 20 mcp-server
echo "--- caddy logs ---"
sudo docker compose logs --tail 20 caddy
sudo docker image prune -f >/dev/null
REMOTE
