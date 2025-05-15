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

ARG NODE_ENV=test
ENV NODE_ENV=${NODE_ENV}

EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f "$APP_URL/health" || exit 1

CMD ["node", "dist/main.js"]