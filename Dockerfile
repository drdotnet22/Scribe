# Build stage: compile the web app and bundle the server
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: same image so Chromium (for PDFs) is already installed
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 3000
CMD ["node", "dist/server.js"]
