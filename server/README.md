# Backend - Sistema de Administracion Edificio XYZ

Arquitectura: **monolito modular** (un solo proyecto Express + un solo `schema.prisma`),
compartido entre el modulo Financiero y el modulo Operativo/Seguridad.

## Stack

- Node.js + Express
- PostgreSQL (Supabase)
- Prisma ORM
- JWT + bcrypt (autenticacion y RBAC)
- Supabase Storage (gestion documental)
- Swagger (`/api-docs`)

## Estructura

```
backend/
  prisma/
    schema.prisma      # modelo de datos (Usuario, Rol, Copropietario, Inmueble, Auditoria)
    seed.js             # crea el usuario administrador inicial
  src/
    app.js               # configuracion de express
    server.js            # arranque del servidor
    config/              # prisma client, swagger
    middlewares/         # auth (JWT), rbac (roles), manejo de errores
    modules/
      auth/               # login, perfil, ruta de prueba RBAC
      usuarios/           # (siguiente sprint) CRUD usuarios
      copropietarios/     # (siguiente sprint) CRUD copropietarios/inmuebles
      auditoria/          # servicio de registro de auditoria
  postman/
    EdificioXYZ.postman_collection.json
```

## Setup local

1. Crear un proyecto en [Supabase](https://supabase.com) (Postgres administrado).
2. Copiar `.env.example` a `.env` y completar `DATABASE_URL`, `DIRECT_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y un `JWT_SECRET` propio.
3. Instalar dependencias:
   ```
   npm install
   ```
4. Generar cliente Prisma y crear las tablas:
   ```
   npm run prisma:generate
   npm run prisma:deploy
   ```
5. Sembrar el usuario administrador inicial (`admin@edificioxyz.com` / `Admin123!`):
   ```
   npm run seed
   ```
   Para probar expensas, agua y mora con datos de muestra (tipos A/B/C, departamentos, una
   baulera, un parqueo y ocupantes), tambien:
   ```
   npm run seed:ejemplo
   ```
6. Levantar el servidor:
   ```
   npm run dev
   ```
7. Probar:
   - Swagger: http://localhost:4000/api-docs
   - Postman: importar `postman/EdificioXYZ.postman_collection.json`

## Roles (RBAC)

`ADMINISTRADOR` | `DIRECTORIO` | `CONSULTA` (enum `RolNombre` en `schema.prisma`).

Para proteger un endpoint:

```js
router.post("/", autenticar, autorizar("ADMINISTRADOR"), controller.crear);
```

## Auditoria

Toda accion sensible (login, altas, bajas, modificaciones) debe registrarse con:

```js
const { registrarAuditoria } = require("../auditoria/auditoria.service");
await registrarAuditoria({ usuarioId, accion: "UPDATE", entidad: "Copropietario", entidadId, detalle });
```

Queda persistida en la tabla `historial_auditoria` con usuario, accion, entidad, detalle e IP.
