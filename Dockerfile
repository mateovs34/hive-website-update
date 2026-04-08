FROM node:20-alpine

# Install build tools for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install dependencies (builds native modules)
RUN npm install --omit=dev

# Copy application files
COPY proxy.js ./
COPY widget.js ./
COPY dashboard.html ./
COPY config.html ./
COPY admin.html ./
COPY demo.html ./

# Create data directory for SQLite database
RUN mkdir -p /data

# Expose proxy port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

ENV NODE_ENV=production
ENV DB_PATH=/data/chat.db

CMD ["node", "proxy.js"]
