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

## Correo (SMTP)

El sistema envia avisos por correo (expensa generada y mora aplicada) a los ocupantes de cada
inmueble. Cada envio, sea `ENVIADO`, `FALLIDO` u `OMITIDO`, queda registrado con su motivo
(`GET /api/financiero/notificaciones/correos`).

> **ADVERTENCIA: en produccion `NODE_ENV` debe ser `production`.**
> La base de datos (Supabase) es compartida y contiene los correos de los residentes. Por eso, con
> cualquier valor de `NODE_ENV` distinto de `production` (`development`, `test`, vacio o sin definir)
> el sistema **nunca escribe a los residentes**:
> - con `SMTP_REDIRIGIR_A`: todo se envia a esa bandeja de pruebas y el destinatario real se escribe en
>   el asunto (`[PRUEBA - para residente@correo.com] ...`);
> - sin `SMTP_REDIRIGIR_A`: no se envia nada y el aviso queda `OMITIDO` con el motivo.
>
> Si en produccion `NODE_ENV` no es `production`, los residentes **no recibiran sus avisos**.

### Variables (en `server/.env`, que no se sube al repositorio)

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `SMTP_HOST` | Si | Servidor SMTP |
| `SMTP_PORT` | Si | Puerto (465 usa TLS directo; 587 usa STARTTLS) |
| `SMTP_USER` | Si | Usuario de la cuenta de correo |
| `SMTP_PASS` | Si | Contrasena (en Gmail, una contrasena de aplicacion) |
| `SMTP_FROM` | No | Remitente; si falta se usa `SMTP_USER` |
| `SMTP_REDIRIGIR_A` | Fuera de produccion | Bandeja de pruebas a la que va todo fuera de produccion |

Si falta alguna de las cuatro primeras, los envios quedan `OMITIDO` ("SMTP no configurado"). Las
conexiones tienen un limite de 10 a 15 segundos para que un servidor que no responde no deje colgada
la peticion. Cambiar el `.env` requiere reiniciar el servidor.

### Configurar Gmail con contrasena de aplicacion

1. Usar una cuenta de Gmail **dedicada al equipo para pruebas**, no una personal.
2. Activar la verificacion en dos pasos de esa cuenta.
3. Crear una contrasena de aplicacion: Cuenta de Google -> Seguridad -> Contrasenas de aplicaciones.
   Google entrega 16 caracteres; se pegan **sin espacios** en `SMTP_PASS`.
4. En `server/.env` (cada integrante en el suyo, sin subirlo al repositorio):
   - `SMTP_HOST` = `smtp.gmail.com`
   - `SMTP_PORT` = `465` (o `587`)
   - `SMTP_USER` = el correo de Gmail completo
   - `SMTP_PASS` = la contrasena de aplicacion
   - `SMTP_FROM` = nombre y el mismo correo de Gmail (Gmail reescribe un remitente distinto)
   - `SMTP_REDIRIGIR_A` = la bandeja donde se revisaran las pruebas
5. Reiniciar el servidor y comprobar con `GET /api/financiero/notificaciones/correos/estado`.

Limite de Gmail: unos 500 destinatarios por dia en una cuenta normal. Nunca subir la contrasena al
repositorio ni pegarla en capturas, issues o chats.

### Comprobar el estado

`GET /api/financiero/notificaciones/correos/estado` (ADMINISTRADOR y DIRECTORIO) devuelve
`{ configurado, faltan, modo }`, sin mostrar valores:

- `modo: PRODUCCION`: se escribe a los residentes.
- `modo: REDIRIGIDO`: fuera de produccion, todo va a la bandeja de pruebas.
- `modo: BLOQUEADO`: fuera de produccion y sin `SMTP_REDIRIGIR_A`: no se envia nada.

Con `?verificar=true` (solo ADMINISTRADOR) tambien prueba la conexion y la autenticacion con el
servidor, **sin enviar ningun correo**, y agrega `conexion: "OK" | "ERROR"` con el motivo.

## Auditoria

Toda accion sensible (login, altas, bajas, modificaciones) debe registrarse con:

```js
const { registrarAuditoria } = require("../auditoria/auditoria.service");
await registrarAuditoria({ usuarioId, accion: "UPDATE", entidad: "Copropietario", entidadId, detalle });
```

Queda persistida en la tabla `historial_auditoria` con usuario, accion, entidad, detalle e IP.
