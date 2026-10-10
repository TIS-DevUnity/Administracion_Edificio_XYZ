# Modulo Financiero — Dev Backend 1

Responsable: Dev Backend 1 (segun cronograma de Sprint).

Carpetas implementadas:
- `expensas/` — generacion mensual, pagos, mora por mes, reglas de pago
- `agua/` — factura mensual de agua y su reparto por pesos
- `configuracion-mora/` — dia de generacion, dia de vencimiento, dias de gracia y valor de la mora
- `cuenta-inmueble/` — saldo, estado de cuenta, pagos por inmueble y pagos anticipados
- `recibos/` — recibos con folio, PDF y comprobante
- `jobs/` y `notificaciones/` — cron de generacion y mora, correos

Pendientes del cronograma (existe el modelo en `schema.prisma`, sin codigo todavia):
`ingresos-egresos/`, `caja-bancos/`, `personal/` y `reportes/`.

## Como se calcula lo que paga un departamento

- **Quien paga:** solo los departamentos activos con alguien asignado (propietario o inquilino),
  aunque nadie viva fisicamente en ellos. Baulera, parqueo y departamentos sin asignar no
  generan expensa. La regla vive en
  `operativo-seguridad/inmuebles/asignacion.util.js`.
- **Expensa fija:** `TipoInmueble.montoBase` (tipo A, B, C...), igual todos los meses. Solo el
  ADMINISTRADOR cambia los tipos (`/api/tipos-inmueble`) y el cambio vale para las expensas que
  se generen despues: cada expensa guarda una foto de su monto base, tipo y peso de agua.
- **Agua:** el edificio tiene un solo medidor. El ADMINISTRADOR registra la factura del mes
  (`POST /api/financiero/agua`) y se reparte entre las expensas del periodo segun el peso
  (`TipoInmueble.pesoAgua`, 1 por defecto): `unidad = factura / suma de pesos` y cada
  departamento paga `peso x unidad`. Los centavos de redondeo se ajustan en la ultima expensa
  para que la suma sea exactamente la factura. Si la expensa ya estaba generada o pagada en
  parte, el agua se suma despues: los pagos hechos siguen valiendo y solo sube lo pendiente.
  Si al inmueble le sobraba saldo a favor y esa expensa es su deuda mas antigua, el saldo se
  usa para cubrir el aumento del agua (`saldoFavorAplicado` en la respuesta).
- **Total de la expensa:** `montoTotal = montoBase + montoAgua` (sin mora).

## Responsable y fecha de generacion

Cada expensa guarda quien era el responsable al generarla (el propietario vigente; si no hay,
el inquilino) y la fecha de generacion (`createdAt`), asi se sabe a quien se le cobro ese mes
aunque despues cambie el propietario. El estado de cuenta los muestra por expensa.

## Vencimiento y mora

- El vencimiento es `ConfiguracionMora.diaVencimiento` dentro del periodo (o la fecha que se
  envie al generar a mano).
- Una expensa ya generada puede cambiar de vencimiento con
  `PATCH /api/financiero/expensas/{id}/vencimiento` (solo Administrador), mientras no tenga
  mora generada y no este pagada. Cada cambio queda en `cambiosVencimiento` y en la auditoria.
- **La mora solo aplica hacia adelante.** Cada expensa guarda la configuracion que regia al
  generarla (`configuracionMoraId`) y toda su mora, incluidos los meses que falten, se calcula
  con esa regla. Un cambio de porcentaje solo afecta a las expensas que se generen despues.
  Al crear una configuracion se puede indicar `vigenteDesde` (hoy o futura; no pasada): la
  vigente en una fecha es la mas reciente con `vigenteDesde <= fecha`.
- La mora corre desde el dia siguiente a `vencimiento + diasGracia`. Cada mes calendario de
  atraso genera **una linea** (`MoraExpensa`): `11 oct`, `11 nov`, `11 dic`... si vence el 10.
- Cada linea se calcula sobre **lo que faltaba pagar de la expensa** al ultimo dia sin mora de
  ese mes (porcentaje de esa base, o monto fijo) y no se edita nunca. Sin saldo no hay mora.
- `Expensa.montoMora` es la suma de las lineas. El detalle por mes sale en `moras` y en el
  estado de cuenta.

## Reglas de pago (version 2)

Viven en `expensas/reglas-pago.util.js`; si cambia la politica se cambia solo ahi.

1. Los pagos van **del mes mas antiguo al mas nuevo**.
2. Un mes **atrasado** (ya existe una expensa de un periodo posterior) se paga **completo**,
   un mes a la vez. No admite cuotas ni adelantar.
3. La expensa **actual** admite cuotas, aunque tenga mora, hasta que se genere la siguiente.
4. En cada expensa el pago cubre **primero la mora y luego el monto**.
5. Si el pago cubre toda la deuda, lo que sobra queda como **pago anticipado** (saldo a favor),
   que se descuenta solo de la proxima expensa que se genere.
6. `POST /inmuebles/{id}/pagos-anticipados` solo aplica si no se debe nada.

Un pago que incumple se rechaza con 409 y un `codigo` (`DEUDA_ATRASADA`,
`DEUDA_ATRASADA_INCOMPLETA`, `ORDEN_DE_PAGO`, `DEUDA_PENDIENTE`) con `detalle` del monto
requerido. Las respuestas de pago incluyen `tipoPago`: `CUOTA`, `PAGO_COMPLETO` o `ANTICIPADO`.

`GET /api/financiero/inmuebles/{id}/saldo` informa `alDia`, `deudaAtrasada` y `proximoPago`
(el mes que hay que pagar primero y su `montoMinimo`).

## Generacion automatica

`POST /api/financiero/jobs/ejecutar-generacion` (y el cron diario) generan la expensa del
periodo para cada departamento activo con alguien asignado. Se puede repetir sin duplicar. La
respuesta informa `generadas`, `yaGeneradas` (codigos que ya tenian expensa), `pendientes`
(`{ codigo, motivo }` de los que fallaron: se corrige y se vuelve a ejecutar) y `excluidos`
(departamentos sin nadie asignado o inactivos).

## Agua

| Endpoint | Rol | Que hace |
|---|---|---|
| `POST /api/financiero/agua` | Administrador | Registra o corrige la factura del mes y la reparte entre las expensas del periodo. Se rechaza si alguna expensa quedaria por debajo de lo ya pagado. |
| `GET /api/financiero/agua` | Admin / Directorio / Consulta | Lista las facturas registradas. |
| `GET /api/financiero/agua/{periodo}` | Admin / Directorio / Consulta | Factura y reparto del periodo. |

## Pagos, recibos y comprobantes (HU4)

Todos los pagos que entran dinero generan un **recibo** con folio unico (`REC-000123`).
Un recibo puede repartirse en varios `Pago` (uno por expensa cubierta, con su parte de mora
y su parte de expensa) y dejar un sobrante como saldo a favor.

| Endpoint | Rol | Que hace |
|---|---|---|
| `POST /api/financiero/inmuebles/:id/pagos` | Administrador | Pago del inmueble: se aplica a las expensas con deuda desde la mas antigua; el sobrante (o todo, si no debe nada) queda como saldo a favor. Requiere `monto`, `metodoPago` y `fechaPago` (YYYY-MM-DD, no futura). |
| `POST /api/financiero/expensas/:id/pagos` | Administrador | Pago sobre una expensa concreta (debe ser la deuda mas antigua). `fechaPago` opcional. |
| `POST /api/financiero/inmuebles/:id/pagos-anticipados` | Administrador | Todo el monto queda como saldo a favor (solo si no debe nada). `fechaPago` opcional. |
| `GET /api/financiero/inmuebles/:id/pagos` | Admin / Directorio / Consulta | Historial de pagos (monto, mora/expensa, fecha, metodo, folio, estado de la expensa). Filtros `desde` y `hasta`. |
| `GET /api/financiero/recibos/:id` | Admin / Directorio / Consulta | Detalle del recibo. |
| `GET /api/financiero/recibos/:id/pdf` | Admin / Directorio / Consulta | Recibo en PDF. |
| `POST /api/financiero/recibos/:id/comprobante` | Administrador | Adjunta la foto del comprobante (`multipart`, campo `archivo`: JPG, PNG o WEBP, max 5MB). Reemplaza el anterior. |
| `GET /api/financiero/recibos/:id/comprobante` | Admin / Directorio / Consulta | Enlace temporal (5 min) a la foto. |

- El comprobante se guarda en el bucket de Supabase (`SUPABASE_STORAGE_BUCKET`), en la carpeta `comprobantes-pago/`.
- Los pagos cubiertos con saldo a favor no tienen folio.
- Migraciones: `20261003150000_recibos_comprobante_folio` (recibos) y
  `20261010120000_expensa_por_tipo_agua_mora_mensual` (clase de inmueble, tipos con peso de agua,
  agua, mora por mes y desglose de pagos).
