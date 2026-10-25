# Frontend Dockerfile
FROM node:24-alpine AS frontend

# Fail the build if the base image is older than the 2026-10-21 Node.js security release
# (CVE-2026-111497, CVE-2026-105482, CVE-2026-105483, CVE-2026-106069 ...).
# Rebuild with `docker build --pull` to refresh the node:24-alpine tag.
RUN node -e "const[a,b,c]=process.versions.node.split('.').map(Number);const ok=a>24||(a===24&&(b>22||(b===22&&c>=1)));if(!ok){console.error('Node '+process.version+' < 24.22.1: pull a newer base image (docker build --pull)');process.exit(1)}"

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:24-alpine AS production

# Fail the build if the base image is older than the 2026-10-21 Node.js security release
# (CVE-2026-111497, CVE-2026-105482, CVE-2026-105483, CVE-2026-106069 ...).
# Rebuild with `docker build --pull` to refresh the node:24-alpine tag.
RUN node -e "const[a,b,c]=process.versions.node.split('.').map(Number);const ok=a>24||(a===24&&(b>22||(b===22&&c>=1)));if(!ok){console.error('Node '+process.version+' < 24.22.1: pull a newer base image (docker build --pull)');process.exit(1)}"

WORKDIR /app

# Install security updates and curl for health checks
RUN apk add --no-cache curl dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Install production dependencies only
COPY package*.json ./
# --ignore-scripts: skip the husky `prepare` hook (husky is a devDependency)
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built frontend
COPY --from=frontend --chown=nodejs:nodejs /app/.next ./.next
COPY --from=frontend --chown=nodejs:nodejs /app/public ./public
COPY --from=frontend --chown=nodejs:nodejs /app/next.config.mjs ./
COPY --from=frontend --chown=nodejs:nodejs /app/server ./server

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check (the frontend has no /api/health; that route lives on the Fastify backend)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Start the application
CMD ["npm", "start"]
