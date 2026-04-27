# ✅ SECURITY: Multi-stage build for minimal image size and reduced attack surface
FROM node:20-alpine as builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (with npm ci for reproducible builds)
RUN npm ci --omit=dev

# ✅ SECURITY: Final stage - minimal production image
FROM node:20-alpine

# ✅ SECURITY: Create non-root user for running the app
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy from builder stage (fewer layers, smaller image)
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# ✅ SECURITY: Create data directory with proper permissions
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app/data && \
    chmod 755 /app/data

# ✅ SECURITY: Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# ✅ SECURITY: Use node directly instead of npm for faster startup
CMD ["node", "src/server.js"]

