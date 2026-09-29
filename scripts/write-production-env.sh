#!/usr/bin/env bash
# Writes the backend production settings to ~/koya-week6/.env on the Oracle
# VM (mode 600), taking values from this machine's .env.local. Prints only
# the names it wrote, never a value. Re-run after changing a key.
# Adapted from week-5/app/scripts/write-worker-env.sh (Task 13).
#
#   KOYA_WORKER_HOST=<public ip> scripts/write-production-env.sh
set -euo pipefail

HOST="${KOYA_WORKER_HOST:-129.146.79.96}"
USER_AT="${KOYA_WORKER_USER:-ubuntu}@${HOST}"
KEY="${KOYA_WORKER_KEY:-$HOME/.ssh/koya_oracle}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Every key both containers need. agent-server and mcp-server each only
# read the subset relevant to them; sharing one file across both (both are
# our own backend processes, nothing browser-facing) keeps this script
# simple and matches env_file: .env being used by both services in
# docker-compose.yml.
NAMES=(NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY ANTHROPIC_MODEL MCP_SERVER_TOKEN CONVERSATION_TOKEN_SECRET VAPI_SERVER_SECRET APP_URL DISCORD_ALERTS_WEBHOOK_URL DISCORD_ACTIVITY_WEBHOOK_URL)
# Written when present in .env.local, skipped otherwise (each has a default).
OPTIONAL_NAMES=(DAILY_SPEND_ALERT_USD)

env_file="$(mktemp)"
trap 'rm -f "$env_file"' EXIT
for name in "${NAMES[@]}"; do
  line="$(grep -E "^${name}=" "$APP_DIR/.env.local" | tail -1 || true)"
  [ -n "$line" ] || { echo "$name is missing from .env.local" >&2; exit 1; }
  echo "$line" >> "$env_file"
done
written=("${NAMES[@]}")
for name in "${OPTIONAL_NAMES[@]}"; do
  line="$(grep -E "^${name}=." "$APP_DIR/.env.local" | tail -1 || true)"
  [ -n "$line" ] && { echo "$line" >> "$env_file"; written+=("$name"); }
done
cat >> "$env_file" <<EOF
REPLAY_MODE=false
AGENT_SERVER_PORT=8091
MCP_PORT=8090
MCP_SERVER_URL=http://mcp-server:8090/mcp
EOF

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$USER_AT" 'mkdir -p ~/koya-week6 && umask 077 && cat > ~/koya-week6/.env && chmod 600 ~/koya-week6/.env' < "$env_file"
echo "Wrote ~/koya-week6/.env on $HOST with: ${written[*]} REPLAY_MODE AGENT_SERVER_PORT MCP_PORT MCP_SERVER_URL"
