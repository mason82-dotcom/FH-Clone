FROM node:22.23.2-bookworm-slim AS build

RUN npm install --global npm@11.19.1 --no-audit --no-fund \
 && test "$(npm --version)" = "11.19.1"

WORKDIR /app

ARG VITE_FH2_STANDALONE_ENABLED=false
ARG VITE_FH2_NATIVE_COCKPIT_ENABLED=false
ARG VITE_FH2_HOST_URL=
ARG VITE_FH2_SERVER_URL=
ARG VITE_FH2_WSS_URL=
ARG VITE_FH2_PROJECT_ID=
ARG VITE_FH2_PROJECT_TOKEN=
ARG VITE_FH2_PAAS_URL=
ARG VITE_FH2_COCKPIT_PROP_STYLE=camel
ARG VITE_FH2_GATEWAY_SN=
ARG VITE_FH2_DRONE_SN=
ARG VITE_FH2_WAYLINE_ID=
ARG VITE_FH2_FLIGHT_PATH_ID=

ENV VITE_FH2_STANDALONE_ENABLED=${VITE_FH2_STANDALONE_ENABLED} \
    VITE_FH2_NATIVE_COCKPIT_ENABLED=${VITE_FH2_NATIVE_COCKPIT_ENABLED} \
    VITE_FH2_HOST_URL=${VITE_FH2_HOST_URL} \
    VITE_FH2_SERVER_URL=${VITE_FH2_SERVER_URL} \
    VITE_FH2_WSS_URL=${VITE_FH2_WSS_URL} \
    VITE_FH2_PROJECT_ID=${VITE_FH2_PROJECT_ID} \
    VITE_FH2_PROJECT_TOKEN=${VITE_FH2_PROJECT_TOKEN} \
    VITE_FH2_PAAS_URL=${VITE_FH2_PAAS_URL} \
    VITE_FH2_COCKPIT_PROP_STYLE=${VITE_FH2_COCKPIT_PROP_STYLE} \
    VITE_FH2_GATEWAY_SN=${VITE_FH2_GATEWAY_SN} \
    VITE_FH2_DRONE_SN=${VITE_FH2_DRONE_SN} \
    VITE_FH2_WAYLINE_ID=${VITE_FH2_WAYLINE_ID} \
    VITE_FH2_FLIGHT_PATH_ID=${VITE_FH2_FLIGHT_PATH_ID}

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
