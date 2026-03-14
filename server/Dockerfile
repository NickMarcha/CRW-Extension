FROM ghcr.io/puppeteer/puppeteer:23.0.0

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

# Copy extension src and root package (needed for update script)
COPY src ./src
COPY scripts ./scripts
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Generate src/generated/ (required by matching - not in git)
# Uses tsx because Node 20 in base image lacks --experimental-strip-types
RUN npm ci --ignore-scripts && npx tsx scripts/update-country-code-suffixes.ts

# Copy server
COPY server/package*.json ./
COPY server/src ./server-src
COPY server/public ./public
RUN npm ci

EXPOSE 3000

ENV NODE_PATH=/app
CMD ["npx", "tsx", "server-src/index.ts"]
