# GoBull

App de portafolio/operaciones bursátiles: API Express + Prisma + MySQL y frontend Angular 22 con SSR.

## Requisitos

| Modo                                      | Necesitas              |
| ----------------------------------------- | ---------------------- |
| Solo Docker (recomendado en otra máquina) | Git + Docker           |
| Desarrollo local                          | Git + Docker + Node 22 |

## Arranque rápido en otra máquina (solo Docker)

```powershell
git clone https://github.com/josechavez9027/PVII-GoBull.git
cd PVII-GoBull            # o GoBullv1, según el nombre de tu carpeta
cp .env.example .env      # luego edita secretos (JWT_SECRET, passwords, SMTP)
docker compose up -d --build
```

Eso levanta todo y **solo** hace automáticamente, en orden:

1. `gobull_mysql` (MySQL 8, puerto host `3307`).
2. `gobull_migrate` (aplica `prisma migrate deploy`; si falla, el backend no arranca).
3. `gobull_backend` (API en `http://localhost:3000`).
4. `gobull_frontend` (SSR en `http://localhost:4000`).

Además, si la tabla de instrumentos está vacía, se siembra el catálogo
(`prisma/seed-data/catalogo.json`, ~14,430 instrumentos). Si ya hay datos,
el seed se omite solo. Verifícalo con:

```powershell
docker logs gobull_migrate --tail 10
# Esperado: "No pending migrations to apply." + "Seed listo..." u "Seed omitido..."
```

Abrir: frontend `http://localhost:4000`, API `http://localhost:3000`.

> Puertos `3000` y `4000` deben estar libres: apaga cualquier `npm start` antes del `up`.
> Con dominio real (no localhost), agrega tu dominio a `FRONTEND_ALLOWED_HOSTS`
> en `.env` y recrea el frontend: `docker compose up -d --build frontend`.

## Desarrollo local (día a día)

```powershell
npm start   # MySQL en Docker + backend (:3000) y frontend (:4200) con Node local
```

En este modo es normal ver `gobull_backend` / `gobull_frontend` detenidos en
Docker: solo `gobull_mysql` se usa. Comandos útiles:

```powershell
npm run db:up / npm run db:down      # solo MySQL
npm run start:backend / npm run start:frontend
npm run prisma:seed                  # refresca el catálogo (borra y reinserta)
```

## Qué viaja con el clon y qué no

- ✅ Estructura de BD (`prisma/migrations/`, se aplica sola) y catálogo de instrumentos (seed automático si está vacío).
- ❌ Usuarios y operaciones: viven en tu volumen Docker local y no viajan con git.
  En máquina nueva hay que crearlos (registro en la app o seed manual).

## Problemas comunes

| Síntoma                                       | Causa / solución                                                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ports are not available ... 3000`            | Tu backend local ocupa el puerto. Apaga `npm start` o usa solo un modo a la vez.                                                                                        |
| `Seed omitido: ya hay N instrumentos`         | Normal: el seed solo corre en BD virgen.                                                                                                                                |
| `gobull_backend` en `Exited (1)` tras `build` | Contenedor huérfano de una imagen vieja: `docker rm gobull_backend` y `docker compose up -d --build backend`. Reconstruir la imagen nunca actualiza el contenedor solo. |
| Frontend SSR rechaza tu dominio               | Falta en `FRONTEND_ALLOWED_HOSTS`; agrégalo y recrea el frontend.                                                                                                       |
