FROM node:22.23.2-bookworm-slim AS build

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
COPY apps/web apps/web

RUN npm run build -w @fh-clone/web

FROM nginx:alpine

COPY infra/docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
