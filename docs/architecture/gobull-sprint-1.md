# GoBull - Arquitectura del Sprint 1

## 1. Objetivo

Construir la base de autenticacion de GoBull para que cada usuario pueda crear su cuenta, iniciar y cerrar sesion, y recuperar su contrasena de forma segura.

Este sprint no incluye el dashboard de operaciones ni los modulos de reportes, noticias o indicadores.

## 2. Alcance funcional

- Registro de usuarios.
- Inicio de sesion.
- Cierre de sesion.
- Consulta del usuario autenticado.
- Solicitud de recuperacion de contrasena.
- Restablecimiento de contrasena mediante enlace enviado por SMTP.
- Proteccion de rutas frontend y endpoints privados.

## 3. Arquitectura general

GoBull se organizara como un monorepo con dos aplicaciones y una base de datos:

```text
GoBullv1/
├── frontend/              # Aplicacion Angular
├── backend/               # API Node.js + Express
├── prisma/                # Esquema y migraciones de base de datos
├── docs/
│   └── architecture/
├── docker-compose.yml     # MySQL para desarrollo
└── .env.example           # Variables de entorno documentadas
```

### Componentes

| Componente | Tecnologia | Responsabilidad |
| --- | --- | --- |
| Cliente web | Angular + TypeScript | Formularios, navegacion, estado de autenticacion y proteccion de rutas |
| API | Node.js + Express + TypeScript | Reglas de negocio, autenticacion, validaciones y respuestas HTTP |
| Persistencia | MySQL + Prisma | Usuarios, tokens de recuperacion y migraciones |
| Correo | SMTP configurable | Envio de enlaces de recuperacion |
| Entorno local | Docker Compose | Ejecucion reproducible de MySQL |

## 4. Flujo de autenticacion

### Registro

1. Angular envia nombre, correo y contrasena a `POST /api/v1/auth/register`.
2. Express valida los datos y comprueba que el correo no exista.
3. La contrasena se transforma con bcrypt y nunca se almacena en texto plano.
4. Prisma crea el usuario en MySQL.
5. La API crea la sesion y devuelve una cookie JWT `HttpOnly`.

### Inicio de sesion

1. Angular envia correo y contrasena.
2. La API busca el usuario por correo.
3. bcrypt compara la contrasena recibida con `passwordHash`.
4. Si las credenciales son validas, se emite un JWT con expiracion.
5. El JWT se almacena en una cookie `HttpOnly`.

### Cierre de sesion

La API invalida la cookie JWT mediante `POST /api/v1/auth/logout`.

### Recuperacion de contrasena

1. El usuario solicita recuperar su cuenta mediante su correo.
2. La API genera un token aleatorio de un solo uso.
3. Solo el hash del token se almacena en MySQL.
4. El token se envia mediante un enlace SMTP configurable.
5. Angular envia el token y la nueva contrasena a `POST /api/v1/auth/reset-password`.
6. La API valida que el token exista, no haya sido usado y no este expirado.
7. La contrasena se reemplaza y el token se marca como utilizado.

La respuesta de solicitud de recuperacion sera generica para no revelar si un correo esta registrado.

## 5. Modelo de datos

### `User`

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `id` | UUID | Clave primaria |
| `name` | String | Obligatorio |
| `email` | String | Obligatorio, unico y normalizado |
| `passwordHash` | String | Obligatorio, generado con bcrypt |
| `createdAt` | DateTime | Generado automaticamente |
| `updatedAt` | DateTime | Actualizado automaticamente |

### `PasswordResetToken`

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `id` | UUID | Clave primaria |
| `userId` | UUID | Relacion con `User` |
| `tokenHash` | String | Obligatorio, nunca se almacena el token original |
| `expiresAt` | DateTime | Fecha limite de uso |
| `usedAt` | DateTime nullable | Se completa despues del uso |
| `createdAt` | DateTime | Generado automaticamente |

Un usuario puede tener varios registros historicos de recuperacion, pero solo los tokens no expirados y no utilizados seran validos.

## 6. API REST

Prefijo comun: `/api/v1`

| Metodo | Endpoint | Acceso | Proposito |
| --- | --- | --- | --- |
| `GET` | `/health` | Publico | Verificar disponibilidad de la API |
| `POST` | `/auth/register` | Publico | Crear una cuenta |
| `POST` | `/auth/login` | Publico | Iniciar sesion |
| `POST` | `/auth/logout` | Autenticado | Cerrar sesion |
| `GET` | `/auth/me` | Autenticado | Obtener el usuario actual |
| `POST` | `/auth/forgot-password` | Publico | Solicitar enlace de recuperacion |
| `POST` | `/auth/reset-password` | Publico | Establecer una nueva contrasena |

Las respuestas de error tendran un formato consistente:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son validos",
    "details": {}
  }
}
```

## 7. Seguridad

- Contrasenas protegidas con bcrypt.
- JWT en cookie `HttpOnly` para evitar acceso desde JavaScript.
- Cookie `Secure` en produccion.
- Cookie `SameSite` configurada segun el despliegue.
- CORS limitado al origen del frontend.
- Validacion estricta de cuerpos de peticion.
- Rate limiting para login y recuperacion de contrasena.
- Helmet para cabeceras HTTP de seguridad.
- Tokens de recuperacion aleatorios, con expiracion y un solo uso.
- No se devuelven contrasenas ni hashes en las respuestas.
- Secretos y credenciales solo mediante variables de entorno.
- Si frontend y API se despliegan en sitios distintos, se debe anadir proteccion CSRF compatible con cookies.

## 8. Variables de entorno

El archivo `.env.example` documentara, como minimo:

```text
NODE_ENV=development
PORT=3000
DATABASE_URL=mysql://gobull:gobull_password@localhost:3306/gobull
JWT_SECRET=change_me
JWT_EXPIRES_IN=1h
FRONTEND_URL=http://localhost:4200
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=change_me
SMTP_PASSWORD=change_me
SMTP_FROM=no-reply@example.com
PASSWORD_RESET_URL=http://localhost:4200/reset-password
```

Los valores reales no deben incluirse en el repositorio.

## 9. Docker Compose

El entorno local incluira un servicio MySQL con:

- Imagen oficial de MySQL.
- Base de datos, usuario y contrasena configurables.
- Volumen persistente.
- Puerto local configurable.
- Healthcheck para indicar cuando MySQL este listo.

Prisma sera responsable de crear y aplicar las migraciones desde el backend.

## 10. Frontend Angular

La interfaz del Sprint 1 seguira el sistema visual definido en [`gobull-design-system.md`](./gobull-design-system.md). En particular, las pantallas usaran canvas claro, superficies blancas, sidebar azul, tipografia Inter/Inter Tight y componentes con bordes de color que se rellenan en hover o foco.

Rutas iniciales:

```text
/login
/register
/forgot-password
/reset-password
/dashboard
```

Elementos principales:

- `AuthService`: registro, login, logout, usuario actual y recuperacion.
- `authGuard`: impide acceder al dashboard sin sesion.
- `authInterceptor`: envia peticiones con `withCredentials`.
- Componentes de formularios para cada flujo de autenticacion.
- Componente inicial de dashboard protegido como punto de extension del Sprint 2.

## 11. Estructura recomendada del backend

```text
backend/src/
├── config/                # Variables de entorno y configuracion
├── middleware/            # Auth, errores, validacion y seguridad
├── modules/
│   └── auth/
│       ├── auth.controller.ts
│       ├── auth.routes.ts
│       ├── auth.service.ts
│       ├── auth.schemas.ts
│       └── auth.types.ts
├── prisma/                # Cliente Prisma y acceso a datos
├── services/              # JWT, bcrypt y correo SMTP
├── app.ts
└── server.ts
```

La logica de negocio permanecera en servicios y las rutas se limitaran a recibir peticiones, validar entrada y devolver respuestas.

## 12. Verificacion del Sprint 1

Se deben cubrir como minimo los siguientes casos:

- Registro exitoso.
- Rechazo de correo duplicado.
- Rechazo de contrasena invalida.
- Login exitoso.
- Login con credenciales incorrectas.
- Acceso autorizado a `/auth/me`.
- Rechazo de `/auth/me` sin cookie valida.
- Logout y eliminacion de cookie.
- Solicitud de recuperacion con respuesta generica.
- Token expirado o ya utilizado.
- Restablecimiento exitoso de contrasena.
- Inicio de sesion con la nueva contrasena.
- Compilacion correcta de Angular y backend.

## 13. Fuera de alcance

- Registro y captura de operaciones de trading.
- Dashboard de compras y ventas.
- Exportacion a Excel o PDF.
- Noticias macroeconomicas.
- Favoritos y notificaciones.
- Indicadores en tiempo real.
- Interpretacion y comparacion de indicadores.
