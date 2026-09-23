# Docker Compose — backend + frontend (evitar contenedores huérfanos)

Esta rule es obligatoria cuando se toque `backend/`, `frontend/`, `prisma/`,
`backend/Dockerfile`, `frontend/Dockerfile` o `docker-compose.yml`.

## Los dos modos (no mezclar)

- **Dev diario:** `npm start` desde la raíz. Solo `gobull_mysql` corre en Docker.
  `backend` (puerto 3000) y `frontend` (puerto 4200) corren con Node local.
  En este modo es NORMAL ver `gobull_backend` / `gobull_frontend` en `Exited` o `Created`.
- **Full-Docker:** `docker compose up -d --build`. Corre `mysql` + `backend` (:3000)
  + `frontend` SSR (:4000). Requiere puertos 3000 y 4000 libres: apagar `npm start` antes.

## Regla de oro: build NO actualiza el contenedor

`COPY backend/src ./src` (backend) y `npm run build` (frontend) congelan el código
dentro de la imagen. Editar archivos en el host NUNCA actualiza el contenedor corriendo.
Tras CUALQUIER cambio hay que reconstruir imagen Y recrear contenedor:

```powershell
# Backend (cambios en backend/, prisma/ o backend/Dockerfile)
docker compose up -d --build backend

# Frontend (cambios en frontend/ o frontend/Dockerfile)
docker compose up -d --build frontend

# Todo el stack (otra máquina, deploy limpio)
docker compose up -d --build
docker compose run --rm backend npx prisma migrate deploy  # solo 1ª vez / BD vacía
```

## Verificación obligatoria tras recrear

```powershell
docker ps -a --format "table {{.Names}} {{.Image}} {{.Status}}"
docker images --format "table {{.Repository}} {{.Tag}} {{.ID}}"
docker logs gobull_backend --tail 40   # esperar "Server is running on port 3000", sin SIGTERM
docker logs gobull_frontend --tail 20  # esperar "listening on http://localhost:4000"
```

- El ID de imagen del contenedor (`docker inspect <nombre> --format "{{.Image}}"`)
  debe coincidir con el de `docker images` para ese tag.
- Si el contenedor apunta a un SHA sin tag (ej. el viejo `bb5f...`) = HUÉRFANO:
  `docker rm <nombre>` y re-`up --build`. No intentar `start` sobre un huérfano.

## Prohibido

- `docker build` aislado fuera de compose (rompe el tag `gobullv1-*`).
- `docker rmi / system prune` con contenedores `Exited` colgados sin revisar antes.
- `docker compose start backend` tras cambiar código sin `--build` (levanta código viejo).
- Correr dev local y full-Docker a la vez (choque en puertos 3000/4000:
  `ports are not available ... bind: Only one usage of each socket address`).

## Diagnóstico rápido de conflictos

```powershell
netstat -ano | Select-String "3000|4000"  # ver qué PID ocupa el puerto
tasklist /FI "PID eq <PID>"               # node.exe = dev local corriendo
docker inspect gobull_backend --format "{{.Image}} {{.State.Status}}"
docker inspect gobull_frontend --format "{{.Image}} {{.State.Status}}"
```

## Estado esperado en dev (referencia 2026-09-23)

- `gobull_mysql`: `Up (healthy)`, imagen `mysql:8.0`, volumen `gobullv1_mysql_data`. No tocar.
- `gobull_backend`: `Created`/`Exited` es normal si `node.exe` local ocupa el 3000.
- `gobull_frontend`: `Exited (137)` es normal en modo dev (apagado limpio, imagen `b44e...` vigente).
- Volumen anónimo `30a5b3...` y red `gobullv1_default`: huérfanos de un compose viejo,
  borrar solo tras confirmar que no guardan datos (`docker volume inspect`).
