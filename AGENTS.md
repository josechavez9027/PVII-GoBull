# Repository Instructions

## Structure

- The active application is the Angular 22 SSR project in `frontend/GB-frontend`.
- `frontend/GB-frontend/src/main.ts` is the browser entrypoint; `src/server.ts` is the Express-based SSR entrypoint.
- The root `package.json` only declares shared Node dependencies and has no scripts; use the frontend package for application commands.
- `backend` currently contains only a placeholder `package.json`; do not assume backend APIs or tests exist.

## Commands

Run these from `frontend/GB-frontend` after installing that package's dependencies:

- `npm start` starts the Angular development server at `http://localhost:4200/`.
- `npm run build` creates the production SSR build under `dist/`.
- `npm test` runs the Angular unit tests through the configured Vitest builder.
- `npm run serve:ssr:GB-frontend` serves the built SSR output; `PORT` overrides the default port `4000`.

There are no root-level build, test, lint, or CI scripts currently defined. The backend `npm test` script is the generated placeholder that exits with an error.

## Conventions

- Follow the existing Angular standalone-component and route structure under `src/app`.
- Format frontend code with Prettier using single quotes and a 100-character print width; Angular HTML uses the Angular parser configured in `.prettierrc`.
- Keep TypeScript changes compatible with the strict Angular compiler settings in `tsconfig.json`.
