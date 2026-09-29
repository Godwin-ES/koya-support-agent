# Adapted from week-5/app/worker/Dockerfile's pattern (Task 13). No build
# step: agent-server runs its TypeScript source directly via tsx at
# container start (package.json's "start" script), same as in dev.
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

# Manifests first, for layer caching - only agent-server and its one
# workspace dependency (@core/support-agent) matter for this image.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY agent-server/package.json agent-server/package.json

RUN pnpm install --frozen-lockfile --filter agent-server...

COPY packages/core packages/core
COPY agent-server agent-server

WORKDIR /app/agent-server

ENV NODE_ENV=production
EXPOSE 8091

CMD ["pnpm", "start"]
