# companion-cloud — Railway deployment image
# Builds the Vite frontend + Bun backend for the control plane.
#
# Multi-stage build:
#   1. builder  — installs deps, builds Vite frontend + Bun server bundle
#   2. runtime  — slim image with only built artifacts and production deps

FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies (cache layer — only re-runs when lockfile changes)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS runtime

WORKDIR /app

# Copy built artifacts + runtime deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy Drizzle schema + config for db:push at deploy time
COPY --from=builder /app/server/db ./server/db
COPY --from=builder /app/drizzle.config.ts ./

ENV NODE_ENV=production

# Railway injects PORT automatically
EXPOSE 3458

CMD ["bun", "run", "dist/server/index.js"]
