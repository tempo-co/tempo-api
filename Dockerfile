FROM node:20-alpine AS builder
WORKDIR /usr/src/app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY test/ ./test/
COPY nest-cli.json ./
RUN npm run build

FROM node:20-alpine AS runtime

RUN apk add --no-cache curl libstdc++ \
    && apk add --no-cache --virtual .build-deps python3 make g++

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./
RUN npm ci && apk del .build-deps

COPY --from=builder --chown=node:node /usr/src/app/dist ./dist

COPY --chown=node:node tsconfig.json ./tsconfig.json

COPY --chown=node:node .env.test .env.test
COPY --chown=node:node .env.development .env.development

USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f "http://localhost:3000/health" || exit 1

CMD ["node", "dist/src/main.js"]