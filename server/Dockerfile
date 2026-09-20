# Fastify backend Dockerfile
# Build context is the repository root (see docker-compose.yml): server/tsconfig.server.json
# extends ../tsconfig.json, so the root tsconfig.json must be inside the image too.
FROM node:22-alpine

WORKDIR /app/server

RUN apk add --no-cache curl dumb-init

# Install production dependencies only. --ignore-scripts skips server/postinstall.js,
# which is an install-time admin bootstrap and must not run during an image build.
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY tsconfig.json /app/tsconfig.json
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
