# Modulo Operativo / Seguridad — Dev Backend 2

Responsable: Dev Backend 2 (segun cronograma de Sprint).

Contiene:
- `auth/` — login, JWT, ruta de perfil y ruta de prueba RBAC
- `auditoria/` — servicio de registro (`registrarAuditoria`) y endpoint de consulta `GET /api/auditoria` (logs)
- `usuarios/` — CRUD de usuarios y roles
- `copropietarios/` — CRUD de copropietarios
- `inmuebles/` — inmuebles (clase, tipo, ocupantes) y la regla de "a quien se le cobra expensa" (`asignacion.util.js`)
- `tipos-inmueble/` — tipos de departamento (A, B, C...) con su expensa fija y su peso de agua
- `documentos/` — gestion documental (actas, reglamentos, contratos, facturas, fotos, cotizaciones), archivos en Supabase Storage

Tambien usa `src/middlewares/auth.middleware.js`, `src/middlewares/rbac.middleware.js` y `src/middlewares/upload.middleware.js` (multer, para `documentos/`).

## Clase y tipo de inmueble

- Cada inmueble tiene una `clase`: `DEPARTAMENTO`, `BAULERA` o `PARQUEO`.
- **Solo el departamento tiene tipo** (A, B, C...). Baulera y parqueo no tienen tipo y no pagan
  expensa; en la API su `tipoInmuebleId` es `null` y `tipoInmueble` es un objeto de
  compatibilidad (nombre = clase, monto 0) para quien ya consume `tipoInmueble.nombre`.
- Los tipos los crea y edita solo el ADMINISTRADOR (`POST` / `PUT /api/tipos-inmueble`) con
  `montoBase` (expensa fija mensual) y `pesoAgua` (peso en el reparto de la factura de agua).
  Cada cambio queda en la auditoria con el valor anterior y el nuevo, y solo afecta a las
  expensas que se generen despues.
- `asignado` indica si el inmueble tiene un ocupante vigente (propietario o inquilino). Un
  departamento activo y asignado paga expensa aunque nadie viva en el.

## Asignaciones

- No se puede asignar una persona a un inmueble **inactivo** (409 `INMUEBLE_INACTIVO`) ni
  asociarla dos veces al mismo inmueble con la misma relacion (409 `ASOCIACION_DUPLICADA`).
- `GET /api/copropietarios/{id}/inmuebles` devuelve los inmuebles de una persona: `vigentes`,
  `anteriores` (historial con fechas) y un `resumen` por clase. Cada uno trae clase, tipo
  (A, B, C en departamentos), piso y rol (propietario o inquilino).
