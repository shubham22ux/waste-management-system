# ==============================================================================
# Dockerfile for SmartWaste Express & Socket.IO Backend
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install native compilation dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite-dev

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Production image
FROM node:20-alpine

WORKDIR /app

# Install runtime sqlite library
RUN apk add --no-cache sqlite-libs curl

ENV NODE_ENV=production
ENV PORT=5000

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source code and files
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# Create uploads directory and data directory
RUN mkdir -p uploads

# Expose API and Socket.IO port
EXPOSE 5000

# Health check against express health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start the application
CMD ["node", "src/index.js"]
