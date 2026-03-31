# Chinese Law MCP — Docker image with native better-sqlite3.
# Uses better-sqlite3 (native C binding) instead of node-sqlite3-wasm
# to handle the 877MB+ database.
# Database downloaded from GitHub Release (too large for git).

# ── Stage 1: Build ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache python3 make g++ curl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# Download database from GitHub Release (Strategy B — runtime download for large DBs)
RUN mkdir -p ./data \
 && curl -fsSL -o ./data/database.db \
    "https://github.com/Ansvar-Systems/chinese-law-mcp/releases/download/db-latest/database.db"

# Security: non-root user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs \
 && chown -R nodejs:nodejs /app/data
USER nodejs

ENV NODE_ENV=production
CMD ["node", "dist/http-server.js"]
