# Frontend Dockerfile
FROM node:22-alpine AS frontend

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
FROM node:22-alpine AS production

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
