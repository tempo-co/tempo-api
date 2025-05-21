FROM node:20-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src/ ./src/
COPY nest-cli.json ./
RUN npm run build

FROM node:20-alpine AS runtime

USER node

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./
RUN npm ci

COPY --from=builder --chown=node:node /usr/src/app/dist ./dist

COPY --chown=node:node .env.test .env.test
COPY --chown=node:node .env.development .env.development

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f "http://localhost:3000/health" || exit 1

CMD ["node", "dist/main.js"]