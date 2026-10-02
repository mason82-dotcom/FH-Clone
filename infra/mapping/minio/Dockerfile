# FH-Clone Mapping object store.
# Derived from the AeroNexus Evidence MinIO build: server and mc are built from
# pinned upstream source revisions because the historical CE binary/image
# distribution is no longer relied on by this project.
FROM golang:1.24.11-alpine3.22 AS build
RUN apk add --no-cache git
ENV CGO_ENABLED=0 GOTOOLCHAIN=local

ARG MINIO_TAG=RELEASE.2025-10-15T17-29-55Z
ARG MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
ARG MC_TAG=RELEASE.2025-08-13T08-35-41Z
ARG MC_COMMIT=7394ce0dd2a80935aded936b09fa12cbb3cb8096

WORKDIR /src/minio
RUN git clone -q --depth 1 --branch "$MINIO_TAG" https://github.com/minio/minio.git . \
 && test "$(git rev-parse HEAD)" = "$MINIO_COMMIT" \
 && T=$(echo "$MINIO_TAG" | sed -E 's/RELEASE\.([0-9-]+)T([0-9]+)-([0-9]+)-([0-9]+)Z/\1T\2:\3:\4Z/') \
 && go build -tags kqueue -trimpath \
      -ldflags "$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$T")" -o /out/minio

WORKDIR /src/mc
RUN git clone -q --depth 1 --branch "$MC_TAG" https://github.com/minio/mc.git . \
 && test "$(git rev-parse HEAD)" = "$MC_COMMIT" \
 && T=$(echo "$MC_TAG" | sed -E 's/RELEASE\.([0-9-]+)T([0-9]+)-([0-9]+)-([0-9]+)Z/\1T\2:\3:\4Z/') \
 && go build -tags kqueue -trimpath \
      -ldflags "$(MC_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$T")" -o /out/mc

FROM alpine:3.22.2
RUN apk add --no-cache ca-certificates
COPY --from=build /out/minio /out/mc /usr/bin/
EXPOSE 9000 9001
ENTRYPOINT ["/usr/bin/minio"]
