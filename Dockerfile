        # MCP Server — Hetzner / Kubernetes
        # Image contract: docs/superpowers/specs/2026-04-25-mcp-infrastructure-standard-design.md §3
        # Profile: node-native (better-sqlite3 — native modules built in builder, pruned, copied)
        # DB pattern: built (data/database.db)

        FROM node:20-alpine AS builder

        RUN apk add --no-cache python3 make g++

        WORKDIR /app

        COPY package*.json ./
        RUN npm ci --ignore-scripts && npm cache clean --force
        # Native module rebuild — better-sqlite3 needs its .node binding for build:db
        # to open the DB. --ignore-scripts above skipped the prebuild-fetch.
        RUN npm rebuild better-sqlite3

        COPY tsconfig.json ./
        COPY src/ ./src/
        COPY scripts/ ./scripts/
        RUN npm run build
COPY data/ ./data/
RUN if npm run 2>/dev/null | grep -q "build:db"; then npm run build:db; fi
        RUN npm prune --omit=dev

        FROM node:20-alpine AS runtime

        WORKDIR /app

        RUN addgroup -g 1001 -S nodejs \
         && adduser -u 1001 -S nodejs -G nodejs

        COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
        COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
        COPY --chown=nodejs:nodejs package.json ./
        COPY --from=builder --chown=nodejs:nodejs /app/data ./data

        # Ensure /app/data exists and is writable by the runtime user.
        # SQLite needs to write -wal/-shm sidecars in the DB directory; even
        # a read-only DB requires this unless journal_mode=delete is forced.
        RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

        USER nodejs

        ENV NODE_ENV=production \
            PORT=3000

        EXPOSE 3000

        HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
          CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

        CMD ["node", "dist/http-server.js"]
