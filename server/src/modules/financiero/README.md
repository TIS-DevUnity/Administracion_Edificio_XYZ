# Modulo Financiero — Dev Backend 1

Responsable: Dev Backend 1 (segun cronograma de Sprint).

Todavia vacio: aca van a vivir, en las proximas semanas del cronograma,
las carpetas de:
- `expensas/` — generacion mensual, pagos, moras, estados de cuenta
- `ingresos-egresos/` — ingresos extraordinarios, gastos, categorias
- `caja-bancos/` — control de caja, movimientos bancarios, conciliacion
- `personal/` — salarios, anticipos, bonificaciones, descuentos
- `reportes/` — estado financiero, balance, flujo de caja, morosos

Las tablas correspondientes se agregan al mismo `prisma/schema.prisma`
compartido (no es una base de datos separada).

## Pagos, recibos y comprobantes (HU4)

Todos los pagos que entran dinero generan un **recibo** con folio unico (`REC-000123`).
Un recibo puede repartirse en varios `Pago` (uno por expensa cubierta) y dejar un sobrante
como saldo a favor.

| Endpoint | Rol | Que hace |
|---|---|---|
| `POST /api/financiero/inmuebles/:id/pagos` | Administrador | Pago del inmueble: se aplica a las expensas con deuda desde la mas antigua; el sobrante (o todo, si no debe nada) queda como saldo a favor. Requiere `monto`, `metodoPago` y `fechaPago` (YYYY-MM-DD, no futura). |
| `POST /api/financiero/expensas/:id/pagos` | Administrador | Pago sobre una expensa concreta. `fechaPago` opcional. |
| `POST /api/financiero/inmuebles/:id/pagos-anticipados` | Administrador | Todo el monto queda como saldo a favor. `fechaPago` opcional. |
| `GET /api/financiero/inmuebles/:id/pagos` | Admin / Directorio / Consulta | Historial de pagos (monto, fecha, metodo, folio, estado de la expensa). Filtros `desde` y `hasta`. |
| `GET /api/financiero/recibos/:id` | Admin / Directorio / Consulta | Detalle del recibo. |
| `GET /api/financiero/recibos/:id/pdf` | Admin / Directorio / Consulta | Recibo en PDF. |
| `POST /api/financiero/recibos/:id/comprobante` | Administrador | Adjunta la foto del comprobante (`multipart`, campo `archivo`: JPG, PNG o WEBP, max 5MB). Reemplaza el anterior. |
| `GET /api/financiero/recibos/:id/comprobante` | Admin / Directorio / Consulta | Enlace temporal (5 min) a la foto. |

- El comprobante se guarda en el bucket de Supabase (`SUPABASE_STORAGE_BUCKET`), en la carpeta `comprobantes-pago/`.
- Los pagos anteriores a los recibos y los cubiertos con saldo a favor no tienen folio.
- Migracion: `20261003150000_recibos_comprobante_folio` (agrega la tabla `recibos` y `reciboId` en `pagos` y `movimientos_saldo`).
