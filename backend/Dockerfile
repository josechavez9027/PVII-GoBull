FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src

EXPOSE 3000

CMD ["npx", "ts-node", "src/index.ts"]