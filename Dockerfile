# Use the official Bun image
FROM oven/bun:1.2.19

# Set working directory
WORKDIR /app

# Copy package.json and bun.lockb first for better caching
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose the port
EXPOSE 3000

# Set default environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV MOCK_GRAPH=false

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/healthz || exit 1

# Run the application
CMD ["bun", "run", "simple-mcp-server.ts"] 