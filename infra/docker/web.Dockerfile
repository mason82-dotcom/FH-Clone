FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
COPY apps/control-api/package.json apps/control-api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/aircraft-core/package.json packages/aircraft-core/package.json
COPY packages/adapters/dji-cloud/package.json packages/adapters/dji-cloud/package.json
COPY packages/adapters/ugcs/package.json packages/adapters/ugcs/package.json

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.base.json ./
COPY apps/web apps/web

RUN npm run build -w @fh-clone/web

FROM nginx:alpine

COPY infra/docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
