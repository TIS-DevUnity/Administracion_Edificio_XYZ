# Modulo Operativo / Seguridad — Dev Backend 2

Responsable: Dev Backend 2 (segun cronograma de Sprint).

Contiene:
- `auth/` — login, JWT, ruta de perfil y ruta de prueba RBAC
- `auditoria/` — servicio de registro (`registrarAuditoria`) y endpoint de consulta `GET /api/auditoria` (logs)
- `usuarios/` — CRUD de usuarios y roles
- `copropietarios/` — CRUD de copropietarios
- `inmuebles/` — inmuebles (clase, tipo, ocupantes) y la regla de "a quien se le cobra expensa" (`asignacion.util.js`)
- `tipos-inmueble/` — tipos de departamento (A, B, C...) con su expensa fija
- `documentos/` — gestion documental (actas, reglamentos, contratos, facturas, fotos, cotizaciones), archivos en Supabase Storage

Tambien usa `src/middlewares/auth.middleware.js`, `src/middlewares/rbac.middleware.js` y `src/middlewares/upload.middleware.js` (multer, para `documentos/`).

## Rol CONSULTA: solo lo propio

CONSULTA es el rol del copropietario. Solo ve y usa lo suyo; Administrador y Directorio no cambian.

- **Que es "lo suyo":** el copropietario al que esta vinculado su usuario (`Usuario.copropietarioId`) y los
  inmuebles que ocupa hoy (propietario o inquilino con ocupacion vigente). El Administrador vincula al crear
  (`POST /api/usuarios`) o editar (`PUT /api/usuarios/{id}`) con `copropietarioId`; `null` quita el vinculo.
  Un usuario CONSULTA sin vinculo recibe 403 `USUARIO_SIN_COPROPIETARIO`.
- **Copropietarios:** la lista (`GET /api/copropietarios`) es 403 para CONSULTA. El detalle y
  `/{id}/inmuebles` solo del propio copropietario (otro `id`: 403 `SOLO_INFORMACION_PROPIA`).
- **Inmuebles:** la lista trae solo los que ocupa; `/{id}` y `/{id}/ocupantes` solo si son suyos. De las demas
  personas del inmueble solo se ve nombre y apellido.
- **Financiero:** lo mismo para la cuenta, pagos, saldo y estado de cuenta del inmueble, recibos, la cuenta del
  residente, las expensas y los planes de pago. El saldo del edificio no es para CONSULTA (su historial muestra
  los pagos de cada departamento).
- La regla vive en `src/middlewares/acceso-propio.js` (`soloSuInmueble()`, `soloSuCopropietario()`,
  `soloSuRecibo()`, `soloSuPlanDePago()` y, para listas, `inmueblesPropios(req)`); cualquier modulo nuevo la puede usar.
- Ya estaban bloqueados para CONSULTA (403) y no cambian: asignar ocupantes, registrar personas, la lista de
  usuarios, caja y bancos y registrar cobros.

## Clase y tipo de inmueble

- Cada inmueble tiene una `clase`: `DEPARTAMENTO`, `BAULERA` o `PARQUEO`.
- **Solo el departamento tiene tipo** (A, B, C...). Baulera y parqueo no tienen tipo y no pagan
  expensa; en la API su `tipoInmuebleId` es `null` y `tipoInmueble` es un objeto de
  compatibilidad (nombre = clase, monto 0) para quien ya consume `tipoInmueble.nombre`.
- Los tipos los crea y edita solo el ADMINISTRADOR (`POST` / `PUT /api/tipos-inmueble`) con
  `montoBase` (expensa fija mensual). El agua no depende del tipo: se carga a mano en cada expensa.
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
