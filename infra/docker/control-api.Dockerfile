FROM node:22.23.2-bookworm-slim

RUN npm install --global npm@11.19.1 --no-audit --no-fund \
 && test "$(npm --version)" = "11.19.1"

WORKDIR /app

COPY package*.json ./
COPY apps/control-api/package.json apps/control-api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/aircraft-core/package.json packages/aircraft-core/package.json
COPY packages/adapters/dji-cloud/package.json packages/adapters/dji-cloud/package.json
COPY packages/adapters/ugcs/package.json packages/adapters/ugcs/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY apps/control-api apps/control-api
COPY packages packages

RUN npm run build -w @fh-clone/aircraft-core \
 && npm run build -w @fh-clone/adapter-dji-cloud \
 && npm run build -w @fh-clone/control-api

ENV NODE_ENV=production
EXPOSE 8080 8081

USER node
CMD ["node", "apps/control-api/dist/index.js"]
