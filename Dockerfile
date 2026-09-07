FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 daxgov \
  && useradd --system --uid 1001 --gid daxgov --home-dir /app --shell /usr/sbin/nologin daxgov \
  && mkdir -p /app \
  && chown daxgov:daxgov /app

WORKDIR /app

COPY --chown=daxgov:daxgov package.json package-lock.json ./
USER daxgov
RUN npm ci

COPY --chown=daxgov:daxgov . .

RUN npx tsx scripts/prepare-rds-schema.ts \
  && cp deploy/rds/schema.prisma prisma/schema.prisma \
  && rm -rf prisma/migrations \
  && cp -R deploy/rds/migrations prisma/migrations

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    SERVE_SPA=true \
    TRUST_PROXY=true \
    DATABASE_NAME=daxgov

RUN DATABASE_URL="postgresql://daxgov:daxgov@127.0.0.1:5432/daxgov?sslmode=require" \
  npx prisma generate && npx vite build

USER 1001:1001
EXPOSE 8080

CMD ["./node_modules/.bin/tsx", "server/index.ts"]
