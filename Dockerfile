# Build stage: compile native modules (better-sqlite3), build the web app and bundle the server
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential python3 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build \
 && npm prune --omit=dev

# Runtime stage: same base image so Chromium (for PDFs) is already installed.
# No compilers here; node_modules comes prebuilt from the build stage.
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 3000
CMD ["node", "dist/server.js"]
