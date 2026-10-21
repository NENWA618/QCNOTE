# Fastify backend Dockerfile
# Build context is the repository root (see docker-compose.yml): server/tsconfig.server.json
# extends ../tsconfig.json, so the root tsconfig.json must be inside the image too.
FROM node:24-alpine

# Fail the build if the base image is older than the 2026-10-21 Node.js security release
# (CVE-2026-111497, CVE-2026-105482, CVE-2026-105483, CVE-2026-106069 ...).
# Rebuild with `docker build --pull` to refresh the node:24-alpine tag.
RUN node -e "const[a,b,c]=process.versions.node.split('.').map(Number);const ok=a>24||(a===24&&(b>22||(b===22&&c>=1)));if(!ok){console.error('Node '+process.version+' < 24.22.1: pull a newer base image (docker build --pull)');process.exit(1)}"

WORKDIR /app/server

RUN apk add --no-cache curl dumb-init

# Install production dependencies only. --ignore-scripts skips server/postinstall.js,
# which is an install-time admin bootstrap and must not run during an image build.
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY tsconfig.json /app/tsconfig.json
# The server imports dependency-free helpers from ../lib (logger, cookie names,
# markdown/push checks, maze replay)
COPY lib/ /app/lib/
COPY server/ ./

ENV NODE_ENV=production
ENV PORT=10000

# The npm image ships a non-root "node" user (uid 1000)
RUN chown -R node:node /app
USER node

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:10000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# tsx compiles on the fly (it is a runtime dependency, see server/package.json)
CMD ["npm", "start"]
