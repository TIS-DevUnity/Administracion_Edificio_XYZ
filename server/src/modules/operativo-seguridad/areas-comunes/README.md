# Areas comunes (HU14)

El copropietario reserva turnos de las areas comunes del edificio (salon de eventos, churrasquera, gimnasio...)
y el administrador gestiona areas, horarios y bloqueos. Montado en `/api/areas-comunes`; Swagger en `/api-docs`
(etiqueta "Areas comunes").

Archivos: `areas-comunes.util.js` (reglas puras, sin Prisma), `areas-comunes.service.js` (Prisma),
`.controller.js`, `.routes.js` y las pruebas `*.test.js`.

## Permisos

Tabla `areasComunes` en `src/middlewares/permisos.js`:

| Accion | Roles | Endpoints |
|---|---|---|
| `ver` | ADMINISTRADOR, DIRECTORIO, CONSULTA | consultar areas y disponibilidad |
| `reservar` | CONSULTA | reservar, mis reservas, cancelar las propias |
| `gestionar` | ADMINISTRADOR | areas, horarios, bloqueos, todas las reservas, cancelar cualquiera |

El copropietario sale de `Usuario.copropietarioId` (`acceso-propio.js`). Un usuario CONSULTA sin ese vinculo recibe
403 `USUARIO_SIN_COPROPIETARIO`.

## Endpoints

| Metodo y ruta | Permiso | Descripcion |
|---|---|---|
| `GET /api/areas-comunes` | ver | Areas activas con sus horarios activos |
| `GET /api/areas-comunes/:id` | ver | Area con horarios y condiciones. Solo el ADMINISTRADOR ve areas inactivas y horarios desactivados |
| `GET /api/areas-comunes/:id/disponibilidad?desde=&hasta=` | ver | Calendario por dia; estados `DISPONIBLE`, `RESERVADO`, `BLOQUEADO`, `PASADO`. Maximo 31 dias |
| `POST /api/areas-comunes/:id/reservas` | reservar | Reserva un turno `{ fecha, horaInicio, horaFin }` |
| `GET /api/areas-comunes/mis-reservas?estado=` | reservar | Reservas propias, las proximas primero y luego las pasadas |
| `POST /api/areas-comunes/reservas/:reservaId/cancelar` | reservar (propias) o gestionar (cualquiera) | `{ motivo? }`; obligatorio para el administrador |
| `GET /api/areas-comunes/reservas?areaId=&fecha=&estado=` | gestionar | Todas las reservas |
| `POST /api/areas-comunes` | gestionar | Crea un area `{ nombre, descripcion?, condiciones?, activa? }` |
| `PUT /api/areas-comunes/:id` | gestionar | Edita el area (incluye `activa`) |
| `POST /api/areas-comunes/:id/horarios` | gestionar | Agrega un horario `{ diaSemana, horaInicio, horaFin }` |
| `PUT /api/areas-comunes/:id/horarios/:horarioId` | gestionar | Edita un horario (incluye `activo`) |
| `DELETE /api/areas-comunes/:id/horarios/:horarioId` | gestionar | Elimina un horario; las reservas ya hechas no cambian |
| `GET /api/areas-comunes/:id/bloqueos?desde=&hasta=` | gestionar | Lista bloqueos (necesaria para conocer el id al borrarlos) |
| `POST /api/areas-comunes/:id/bloqueos` | gestionar | Bloquea un dia (sin horas) o una franja `{ fecha, horaInicio?, horaFin?, motivo }` |
| `DELETE /api/areas-comunes/:id/bloqueos/:bloqueoId` | gestionar | Elimina un bloqueo |

Las altas, cambios y bajas de areas, horarios y bloqueos, y reservar y cancelar, se registran con
`registrarAuditoria` (modulo "Areas comunes" en `GET /api/auditoria?modulo=Areas comunes`).

## Reglas de negocio

- **Hora y fecha de referencia:** America/La_Paz (`fechaEnZona`). `diaSemana`: 0 = domingo ... 6 = sabado. Las fechas
  son `YYYY-MM-DD` reales y se guardan en columnas `@db.Date` (medianoche UTC).
- **Turno:** es exactamente un horario activo del area para ese dia de la semana. Solo se acepta reservar con
  `horaInicio` y `horaFin` iguales a las de un horario activo, asi los turnos nunca se cruzan. Los horarios de una
  misma area y dia no pueden solaparse.
- **Ventana:** de hoy hasta `DIAS_MAXIMOS_ANTICIPACION` = 60 dias. Un turno ya iniciado o pasado hoy no se reserva.
- **Turno no disponible** si: el area esta inactiva, hay una reserva vigente (`estado = RESERVADA`, `vigente = true`)
  para area, fecha y `horaInicio`, o un bloqueo lo cubre (sin horas = todo el dia; con horas = se solapa con el turno).
- **Al dia con los pagos:** para reservar, `estaAlDia(copropietarioId)` (financiero/cuenta-residente) debe devolver
  `alDia: true`. Si no, 409 `NO_AL_DIA`.
- **Doble reserva:** se valida antes y ademas la restriccion unica `reserva_area_unica` (`areaId, fecha, horaInicio,
  vigente`) lo garantiza aun con peticiones simultaneas: un `P2002` se responde 409 `TURNO_NO_DISPONIBLE`.
- **Cancelar:** `estado = CANCELADA`, `vigente = NULL` (nunca `false`), `canceladaEn = ahora` y `motivoCancelacion`.
  Como los `NULL` no chocan en la restriccion unica, el turno puede volver a reservarse. El copropietario solo cancela
  las suyas y antes de que empiece el turno; el administrador cancela cualquiera y debe dar el motivo.
- **Bloqueos:** crear uno que coincida con reservas vigentes responde 409 con esas reservas y no las cancela: el
  administrador las cancela (con motivo) y vuelve a bloquear.
- No hay limite de reservas por copropietario ni cobro por la reserva.

## Codigos de error

Las respuestas de error llevan `{ error, codigo, detalle? }`.

| Estado | `codigo` | Cuando |
|---|---|---|
| 400 | `FECHA_REQUERIDA`, `FECHA_INVALIDA` | Falta la fecha o no es una fecha real `YYYY-MM-DD` |
| 400 | `HORA_INVALIDA`, `FRANJA_INVALIDA`, `FRANJA_INCOMPLETA`, `DIA_INVALIDO` | Hora fuera de `HH:MM`, `horaFin <= horaInicio`, bloqueo con una sola hora, dia fuera de 0-6 |
| 400 | `FECHA_PASADA` | Reservar en un dia anterior a hoy |
| 400 | `FUERA_DE_VENTANA` | Mas de 60 dias de anticipacion (`detalle.fechaMaxima`) |
| 400 | `TURNO_INEXISTENTE` | Las horas no son exactamente las de un horario activo (`detalle.turnosDelDia` lista los validos) |
| 400 | `RANGO_INVALIDO`, `RANGO_MUY_GRANDE` | `desde > hasta` o mas de 31 dias en la disponibilidad |
| 400 | `MOTIVO_REQUERIDO` | Cancelacion del administrador o bloqueo sin motivo |
| 400 | `ESTADO_INVALIDO` | `estado` distinto de `RESERVADA` o `CANCELADA` |
| 403 | `RESERVA_AJENA` | El copropietario intenta cancelar una reserva de otro |
| 403 | `USUARIO_SIN_COPROPIETARIO` | El usuario CONSULTA no esta vinculado a un copropietario |
| 403 | `SIN_PERMISO` | Rol sin acceso a la accion |
| 404 | — | Area, horario, bloqueo o reserva inexistente |
| 409 | `TURNO_NO_DISPONIBLE` | Area inactiva, turno ya iniciado, bloqueado o ya reservado. `detalle.motivo`: `AREA_INACTIVA`, `TURNO_INICIADO`, `BLOQUEADO`, `RESERVADO` |
| 409 | `NO_AL_DIA` | Tiene deuda vencida. Incluye `deudaVencida` y `detalle` |
| 409 | `YA_CANCELADA` | La reserva ya estaba cancelada |
| 409 | `TURNO_INICIADO` | El copropietario cancela un turno que ya empezo |
| 409 | `RESERVAS_EN_CONFLICTO` | El bloqueo coincide con reservas vigentes; incluye `reservas` |
| 409 | `HORARIO_SOLAPADO` | El horario se cruza con otro del mismo area y dia |
| 409 | `NOMBRE_DUPLICADO` | Ya existe un area con ese nombre |

## Ejemplos

### Reservar

`POST /api/areas-comunes/3f2c.../reservas` (usuario CONSULTA)

```json
{ "fecha": "2026-11-15", "horaInicio": "08:00", "horaFin": "13:00" }
```

`201 Created`

```json
{
  "reserva": {
    "id": "9b1e...",
    "areaId": "3f2c...",
    "area": { "id": "3f2c...", "nombre": "Salon de eventos" },
    "copropietarioId": "c0a8...",
    "copropietario": { "id": "c0a8...", "nombre": "Ana", "apellido": "Rojas" },
    "fecha": "2026-11-15",
    "horaInicio": "08:00",
    "horaFin": "13:00",
    "estado": "RESERVADA",
    "canceladaEn": null,
    "motivoCancelacion": null,
    "createdAt": "2026-11-14T14:30:00.000Z"
  }
}
```

### Reservar sin estar al dia (`NO_AL_DIA`)

`409 Conflict`

```json
{
  "error": "Debe estar al dia con sus pagos para reservar un area comun",
  "codigo": "NO_AL_DIA",
  "deudaVencida": "515.00",
  "detalle": [
    { "concepto": "Expensa", "periodo": "2026-09", "monto": "215.00", "vencimiento": "2026-09-10" },
    { "concepto": "Cuota 2 plan de pago", "periodo": "2026-10", "monto": "300.00", "vencimiento": "2026-10-10" }
  ]
}
```

### Turno ocupado

`409 Conflict`

```json
{ "error": "Ese turno ya esta reservado", "codigo": "TURNO_NO_DISPONIBLE", "detalle": { "motivo": "RESERVADO" } }
```

### Disponibilidad

`GET /api/areas-comunes/3f2c.../disponibilidad?desde=2026-11-14&hasta=2026-11-15`

```json
{
  "area": { "id": "3f2c...", "nombre": "Salon de eventos", "activa": true },
  "desde": "2026-11-14",
  "hasta": "2026-11-15",
  "dias": [
    { "fecha": "2026-11-14", "diaSemana": 6, "turnos": [
      { "horaInicio": "08:00", "horaFin": "13:00", "estado": "PASADO" },
      { "horaInicio": "14:00", "horaFin": "19:00", "estado": "DISPONIBLE" }
    ] },
    { "fecha": "2026-11-15", "diaSemana": 0, "turnos": [
      { "horaInicio": "08:00", "horaFin": "13:00", "estado": "RESERVADO" },
      { "horaInicio": "14:00", "horaFin": "19:00", "estado": "BLOQUEADO", "motivo": "Mantenimiento", "bloqueoId": "b7..." }
    ] }
  ]
}
```

### Bloqueo con reservas en conflicto

`POST /api/areas-comunes/3f2c.../bloqueos` con `{ "fecha": "2026-11-15", "motivo": "Pintura" }` responde 409:

```json
{
  "error": "El bloqueo coincide con reservas vigentes: cancelelas antes de bloquear",
  "codigo": "RESERVAS_EN_CONFLICTO",
  "reservas": [ { "id": "9b1e...", "fecha": "2026-11-15", "horaInicio": "08:00", "horaFin": "13:00", "estado": "RESERVADA" } ]
}
```

## Datos de ejemplo

`npm run seed:ejemplo` (en `server/`) crea, de forma idempotente, Salon de eventos (sabado y domingo), Churrasquera
(todos los dias) y Gimnasio (lunes a viernes), con dos turnos por dia.

## Pruebas

```
node --test server/src/modules/operativo-seguridad/areas-comunes/areas-comunes.util.test.js
node --test server/src/modules/operativo-seguridad/areas-comunes/areas-comunes.service.test.js
```

El servicio se prueba con un prisma en memoria que imita la restriccion unica `reserva_area_unica`.
