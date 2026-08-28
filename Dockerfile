FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 1001 --create-home daxgov

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx tsx scripts/prepare-rds-schema.ts \
  && cp deploy/rds/schema.prisma prisma/schema.prisma

ENV DATABASE_URL="postgresql://daxgov:daxgov@127.0.0.1:5432/daxgov?sslmode=require" \
    NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    SERVE_SPA=true \
    TRUST_PROXY=true \
    DATABASE_NAME=daxgov

RUN npx prisma generate && npx vite build \
  && chown -R daxgov:daxgov /app

USER daxgov
EXPOSE 8080

CMD ["./node_modules/.bin/tsx", "server/index.ts"]
