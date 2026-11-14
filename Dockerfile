# syntax=docker/dockerfile:1
FROM node:22-alpine

LABEL maintainer="SnackToken"
LABEL description="Snack & Beer Duty Token with local WebSocket real-time sync"

ENV NODE_ENV=production \
    PORT=3002 \
    DATA_DIR=/app/data

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev --no-audit --no-fund

COPY server.js index.html ./

RUN mkdir -p /app/data

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
