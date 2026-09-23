# Repository Instructions

## Structure

- The active application is the Angular 22 SSR project in `frontend/`.
- `frontend/src/main.ts` is the browser entrypoint; `src/server.ts` is the Express-based SSR entrypoint.
- `backend/` is the Node/Express API (`src/index.ts`, started with ts-node) on port `3000`; it loads its own `.env` and connects to MySQL on `localhost:3307` via Prisma (`prisma/schema.prisma`).
- MySQL runs in Docker via `docker-compose.yml` (service `mysql`, host port `3307`).

## Commands

### From the repository root (`C:\Proyectos\GoBullv1`)

The root `package.json` orchestrates the stack with `concurrently`:

- `npm start` boots the whole stack: MySQL (docker compose), backend (`backend/`), and frontend dev server (`frontend/`) together.
- `npm run start:backend` starts only the backend API (port `3000`).
- `npm run start:frontend` starts only the Angular dev server (`http://localhost:4200/`).
- `npm run db:up` / `npm run db:down` start / stop the MySQL container.
- `npm run db:logs` tails the MySQL container logs.
- `npm run prisma:migrate` / `npm run prisma:deploy` / `npm run prisma:generate` run Prisma against `prisma/schema.prisma` (migrations live in `prisma/migrations/`).

### From `frontend/` (Angular, after installing its dependencies)

- `npm start` starts the Angular development server at `http://localhost:4200/`.
- `npm run build` creates the production SSR build under `dist/`.
- `npm test` runs the Angular unit tests through the configured Vitest builder.
- `npm run serve:ssr:GB-frontend` serves the built SSR output; `PORT` overrides the default port `4000`.

### From `backend/`

- `npm start` / `npm run dev` runs the Express API with ts-node (port `3000`).
- The backend `npm test` script is the generated placeholder that exits with an error.

### Run everything in Docker (backend + frontend containerized)

The `Dockerfile`s in `backend/` and `frontend/` containerize the API and the SSR frontend; `docker-compose.yml` wires the three services together on an internal `gobull` network. Use this to run the project on a machine that only has Git + Docker (no Node):

- `cp .env.example .env` (then edit secrets), `docker compose up --build` boots MySQL, backend (`localhost:3000`) and frontend SSR (`localhost:4000`).
- One-time DB setup: `docker compose run --rm backend npx prisma migrate deploy`.
- Inside Docker the backend reaches MySQL via `mysql:3306` (the compose `DATABASE_URL` override), NOT `localhost:3307`.
- SSR SSRF protection: the frontend container only accepts the hosts listed in `NG_ALLOWED_HOSTS` (default `localhost,127.0.0.1`; override with `FRONTEND_ALLOWED_HOSTS` in `.env` before deploying behind a real domain, then recreate the frontend).
- Note: this binds ports `3000` and `4000`, so stop any dev servers first (the local `npm start` flow works exactly as before and is the dev alternative).

## Conventions

- Follow the existing Angular standalone-component and route structure under `src/app`.
- Format frontend code with Prettier using single quotes and a 100-character print width; Angular HTML uses the Angular parser configured in `.prettierrc`.
- Keep TypeScript changes compatible with the strict Angular compiler settings in `tsconfig.json`.

## Agent Rules

- Docker workflow (backend + frontend): read `.agents/rules/docker-compose.md` before touching `backend/`, `frontend/`, `prisma/`, Dockerfiles, or `docker-compose.yml`. Dev mode uses only `gobull_mysql` in Docker; full-Docker needs `docker compose up -d --build` with ports 3000/4000 free, and every code change requires image rebuild AND container recreate (build alone never updates a running container).
