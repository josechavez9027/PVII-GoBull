FROM node:22 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim AS runtime

WORKDIR /app
ENV PORT=4000

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

EXPOSE 4000

CMD ["node", "dist/GB-frontend/server/server.mjs"]