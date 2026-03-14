FROM ghcr.io/puppeteer/puppeteer:23.0.0

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

# Copy extension src first (shared matching)
COPY src ./src
COPY tsconfig.json ./

# Copy server
COPY server/package*.json ./
COPY server/src ./server-src
COPY server/public ./public
RUN npm ci

EXPOSE 3000

# Run with tsx (resolves @/ to ./src via NODE_PATH)
ENV NODE_PATH=/app
CMD ["npx", "tsx", "server-src/index.ts"]
