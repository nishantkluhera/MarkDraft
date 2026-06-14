# syntax=docker/dockerfile:1

# ---- Dependencies stage ----
# Install production dependencies. We skip Puppeteer's bundled Chromium download
# here because the bundled build targets glibc and won't run on Alpine (musl);
# the production stage installs a system Chromium instead.
FROM node:22-alpine AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Production stage ----
FROM node:22-alpine AS production

# Chromium + the libraries it needs to render PDFs headlessly.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init

# Tell Puppeteer to use the system Chromium and never try to download its own.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    PORT=3000 \
    HOME=/tmp

WORKDIR /app

# Run as an unprivileged user.
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

# Bring in the already-installed dependencies and the application code.
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Writable logs directory.
RUN mkdir -p logs && chown -R nodejs:nodejs logs

EXPOSE 3000

USER nodejs

# Health check hits the /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# dumb-init reaps zombie Chromium processes and forwards signals correctly.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
