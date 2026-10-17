# Modulo Financiero — Dev Backend 1

Responsable: Dev Backend 1 (segun cronograma de Sprint).

Carpetas implementadas:
- `expensas/` — generacion mensual, pagos, mora por mes, reglas de pago
- `configuracion-mora/` — dia de generacion, dia de vencimiento, dias de gracia y valor de la mora
- `cuenta-inmueble/` — saldo, estado de cuenta, pagos por inmueble y pagos anticipados
- `recibos/` — recibos con folio, PDF y comprobante
- `movimientos/` — gastos e ingresos extraordinarios, categorias, comprobantes y balance (HU6)
- `planes-pago/` — planes de pago en cuotas (HU3 CA11)
- `jobs/` y `notificaciones/` — cron de generacion, mora y avisos; correos con registro; campanita del residente (HU3 CA15 y CA16)

Pendientes del cronograma (existe el modelo en `schema.prisma`, sin codigo todavia):
`ingresos-egresos/`, `caja-bancos/`, `personal/` y `reportes/`.

## Como se calcula lo que paga un departamento

- **Quien paga:** solo los departamentos activos con alguien asignado (propietario o inquilino),
  aunque nadie viva fisicamente en ellos. Baulera, parqueo y departamentos sin asignar no
  generan expensa. La regla vive en
  `operativo-seguridad/inmuebles/asignacion.util.js`.
- **Expensa fija:** `TipoInmueble.montoBase` (tipo A, B, C...), igual todos los meses. Solo el
  ADMINISTRADOR cambia los tipos (`/api/tipos-inmueble`) y el cambio vale para las expensas que
  se generen despues: cada expensa guarda una foto de su monto base y tipo.
- **Agua:** se carga a mano, departamento por departamento. La expensa nace con agua 0 y el
  ADMINISTRADOR pone el importe de cada departamento con
  `PATCH /api/financiero/expensas/{id}/agua` (`{ "montoAgua": 45 }`). No hay factura del
  edificio ni reparto: lo que se carga en un departamento no afecta a los demas.
  - `montoTotal = montoBase + montoAgua`; el estado se recalcula con lo ya pagado.
  - Se puede corregir mientras la expensa no tenga mora generada (`EXPENSA_CON_MORA`) y el
    nuevo total no quede por debajo de lo ya pagado (`AGUA_MENOR_A_LO_PAGADO`).
  - Si el agua sube y al inmueble le sobraba saldo a favor y esa expensa es su deuda mas
    antigua, el saldo cubre el aumento (`saldoFavorAplicado` en la respuesta).
  - `aguaRegistradaEn` indica cuando se cargo (null = todavia falta). Para ver a quien le
    falta: `GET /api/financiero/expensas?periodo=2026-10&aguaCargada=false`.
  - Cada carga o correccion queda en la auditoria con el monto anterior y el nuevo.
- **Baulera y parqueo:** no generan expensa propia ni llevan agua. Su cuota se suma a la
  expensa del departamento de la persona responsable que los ocupa (`expensas/cargos.util.js`):
  - Monto: el `cuotaMensual` propio del inmueble o, si no tiene, la tarifa de su clase
    (`/api/tarifas-inmueble`, solo ADMINISTRADOR). 0 o clase sin tarifa = no se cobra.
  - Se cobran una sola vez por periodo, en el primer departamento (por codigo) del que la
    persona es responsable. Sin departamento a su cargo no se les genera cobro.
  - Cada concepto queda como una linea (`CargoExpensa`) de la expensa y `montoBase` es su
    suma. Un cambio de tarifa o de alta/baja rige desde la proxima expensa generada.
  - `GET /api/financiero/copropietarios/{id}/cuenta` consolida por residente cargo mensual por
    concepto, deuda y saldo a favor.
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
| `PATCH /api/financiero/expensas/{id}/agua` | Administrador | Carga o corrige el agua de una expensa (`montoAgua` 0 o mayor, max. 2 decimales). Recalcula total y estado. |
| `GET /api/financiero/expensas?aguaCargada=false` | Admin / Directorio / Consulta | Expensas a las que todavia falta cargarles el agua (`true` = las que ya la tienen). |

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
  `20261010120000_expensa_por_tipo_agua_mora_mensual` (clase de inmueble, tipos, agua, mora por
  mes y desglose de pagos) y `20261017120000_agua_manual_por_expensa` (el agua pasa a cargarse a
  mano por expensa: elimina `facturas_agua` y los pesos, agrega `aguaRegistradaEn`).

## Estado de cuenta por periodo (HU5)

`GET /api/financiero/inmuebles/{id}/estado-cuenta` acepta `mes=YYYY-MM` o un rango `desde` / `hasta`
(inclusivos). Si `desde` es posterior a `hasta` responde 400 (`RANGO_INVALIDO`). Sin periodo muestra todo.

- **Cabecera:** `inmueble`, `ocupantes` (propietario / inquilino), `responsable`, `periodo` y `generadoEn`.
- **`movimientos`:** lo ocurrido en el periodo en orden cronologico (los mas antiguos primero), cada uno con su
  `saldoCorrido`. Tipos: `EXPENSA` (con `desglose`: tarifa fija, baulera/parqueo y agua por separado), `MORA`,
  `PAGO` (fecha, importe, metodo, recibo y la `obligacion` a la que se aplico con su saldo pendiente),
  `SALDO_A_FAVOR` (pago anticipado o exceso, como concepto independiente) y `APLICACION_SALDO` (uso del saldo
  a favor: baja la deuda y el saldo a favor por igual, por eso no cambia el saldo total).
- **Saldos sin contar dos veces:** `saldoAnterior` (de donde se parte), `resumenPeriodo` (cargos, abonos y
  `saldoFinal`) y `deudasPendientes` (obligaciones no pagadas completas al cierre). Sin `hasta`, el saldo final
  coincide con `GET .../saldo`. `saldoAdeudado` nunca es negativo: si el saldo a favor supera la deuda se
  informa `saldoAFavorRestante`, no una deuda inexistente.
- **Sin movimientos:** `sinMovimientos: true` y `mensaje: "No existen movimientos para el periodo seleccionado"`.
- **PDF:** `GET .../estado-cuenta/pdf` (solo Administrador; `inline=true` abre en el navegador). Mismo contenido
  que la pantalla, con el inmueble y el periodo en cada pagina y renglones que no se cortan al cambiar de pagina.
- **Errores:** un fallo inesperado responde 500 `ERROR_ESTADO_CUENTA` sin datos parciales. `expensas`,
  `movimientosSaldo` y `resumen` conservan su formato anterior.
- La impresion en papel (vista previa y boton Imprimir) es del frontend: puede usar el PDF con `inline=true`.

## Gastos e ingresos extraordinarios (HU6)

Base `/api/financiero/movimientos`. Solo el Administrador registra y edita; Administrador, Directorio y Consulta
consultan.

| Endpoint | Que hace |
|---|---|
| `GET /categorias?tipo=` | Categorias activas; cada una es de un solo tipo (Gasto o Ingreso). |
| `POST /categorias`, `PATCH /categorias/{id}` | Crea, renombra o desactiva categorias (Administrador). Vienen cargadas 7 de gasto y 5 de ingreso. |
| `POST /` | Registra un gasto o ingreso: `tipo` (GASTO/EGRESO o INGRESO), `monto` (> 0), `fecha` (YYYY-MM-DD), `categoriaId` y `concepto`. Comprobante opcional en la misma solicitud (`multipart`, campo `comprobante`). |
| `GET /` | Listado (mas recientes primero) con tipo, fecha, categoria, concepto y monto; `montoConSigno` es negativo en gastos. Filtros `tipo`, `categoriaId`, `desde`, `hasta`, `pagina`. `resumen` totaliza todo lo filtrado. |
| `GET /{id}` | Detalle con la informacion del comprobante. |
| `PUT /{id}` | Edita solo los campos enviados (JSON o `multipart` para reemplazar el comprobante). |
| `POST /{id}/comprobante` | Adjunta o reemplaza el comprobante. |
| `GET /{id}/comprobante` | Enlace temporal (5 min); `descargar=true` lo entrega como descarga, sin alterar el archivo. |
| `GET /balance` | `ingresos`, `gastos` y `balance` (ingresos - gastos) con detalle por categoria; filtros `desde` y `hasta`. |

- **Validaciones:** si faltan campos obligatorios la respuesta los lista todos (`CAMPOS_OBLIGATORIOS`); monto <= 0 se
  rechaza ("debe ser mayor que cero"); fecha con formato invalido se rechaza; la categoria debe ser del mismo tipo
  que el movimiento (`CATEGORIA_INCOMPATIBLE`) y estar activa.
- **Comprobante:** JPG, PNG o PDF de hasta 5 MB (se revisa el contenido real, no solo el tipo declarado). Es opcional.
  Se guarda en Supabase, carpeta `comprobantes-movimientos/`, y el archivo reemplazado se borra.
- **Balance:** se calcula siempre desde los movimientos guardados, asi coincide con el listado. Un gasto lo
  disminuye y un ingreso lo aumenta; editar un movimiento lo actualiza solo. Solo cuenta los extraordinarios.
- **Reenvios:** con la cabecera `Idempotency-Key` (o, sin ella, los mismos datos de la misma persona en menos de un
  minuto) la solicitud repetida no se registra dos veces: responde 200 con `duplicado: true`.
- Todo alta y cambio queda en la auditoria (con el valor anterior y el nuevo).

## Planes de pago en cuotas (HU3 CA11)

Base `/api/financiero/planes-pago`. El Administrador divide la deuda de un departamento (mora incluida) en cuotas.

- `POST /`: `inmuebleId` y las cuotas: lista `cuotas: [{ monto, fechaVencimiento }]` o `cantidadCuotas` +
  `primerVencimiento` (cuotas iguales, una por mes). `expensaIds` es opcional (por defecto toda la deuda pendiente que
  no este en otro plan). El importe total acordado debe ser igual a la deuda incluida y la suma de las cuotas igual al
  total; entre 2 y 60 cuotas, fechas en orden y la primera no anterior a hoy.
- Cada cuota tiene importe, vencimiento, pagado, saldo y estado: `PENDIENTE`, `PARCIAL`, `PAGADA` o `VENCIDA`.
  Una cuota impaga con fecha pasada es `VENCIDA` (el proceso diario tambien la deja guardada).
- `POST /{id}/pagos`: aplica el monto a las cuotas de la mas antigua a la mas nueva y cubre las expensas del plan
  (mora primero, la mas antigua primero), con recibo y auditoria; actualiza el saldo de cada cuota y el saldo total del
  acuerdo. No puede superar el saldo del plan. Al pagar la ultima cuota el plan queda `COMPLETADO`.
- `GET /` y `GET /{id}`: planes con sus cuotas, pagos recibidos y lo que falta de cada expensa.
- `POST /{id}/cancelar`: solo si todavia no recibio pagos; sus expensas vuelven al cobro normal.
- **Mientras el plan esta activo** las expensas que cubre se cobran solo por cuotas: no entran en el pago normal
  (`409 EXPENSA_EN_PLAN`), no generan mora nueva y no se les cambia el agua. La deuda sigue contando en
  `GET .../saldo`, en el estado de cuenta y en la cuenta del residente (`deudaEnPlanDePagos`).

## Notificaciones: campanita y correos (HU3 CA15 y CA16)

Base `/api/financiero/notificaciones`.

- **Campanita (`GET /`):** cada usuario ve las de su ficha de residente (el usuario debe estar vinculado a un
  copropietario; no hace falta un rol nuevo). Tipos: `PROXIMO_VENCIMIENTO` (desde 3 dias antes del limite),
  `PROXIMA_MORA` (ultimos 2 dias de la gracia; sin gracia, el dia del vencimiento), `OBLIGACION_VENCIDA`,
  `MORA_APLICADA` (con el importe del recargo), `DEUDA_CON_MORA` (recordatorio mensual) y `PAGO_REGISTRADO`.
  Cada una trae motivo, importe y `expensaId`; `GET /{id}` da el detalle de la obligacion y la marca como leida;
  tambien `PATCH /{id}/leida` y `POST /marcar-leidas`. Administrador y Directorio pueden ver las de otra persona con
  `?copropietarioId=`.
- **Sin repetidos y al dia:** un mismo hecho no se avisa dos veces. Al registrar un pago o cambiar la deuda, los
  recordatorios se actualizan con el importe actual y dejan de estar vigentes si la deuda se pago (`historial=true`
  los muestra).
- **Cuando se generan:** la mora y los pagos al momento de ocurrir; los demas, en el proceso diario de las 07:00
  (`POST /api/financiero/jobs/ejecutar-notificaciones` lo dispara a mano; se puede repetir sin duplicar).
- **Correos (`GET /correos`, Administrador y Directorio):** cada aviso por correo deja constancia: `ENVIADO`,
  `FALLIDO` (correo invalido o error del servidor de correo) u `OMITIDO` (sin correo registrado, sin ocupantes o SMTP
  sin configurar), con el motivo. La expensa se genera igual y la campanita no depende del correo. El aviso trae
  periodo, importe y fecha limite de pago.

## Cobros repetidos

Los tres cobros (`POST /inmuebles/{id}/pagos`, `POST /inmuebles/{id}/pagos-anticipados`, `POST /expensas/{id}/pagos`)
y el pago a un plan aceptan la cabecera `Idempotency-Key`: si la misma solicitud llega otra vez (mala conexion,
respuesta tardia), no se cobra dos veces; responde 200 con `duplicado: true` y el recibo ya registrado. La generacion
de expensas y de mora ya era repetible sin duplicar (una expensa por inmueble y periodo, una linea de mora por mes).

## Migraciones de esta entrega

- `20261017120000_agua_manual_por_expensa`: el agua se carga a mano por expensa.
- `20261017130000_movimientos_planes_pago_notificaciones`: categorias y movimientos financieros (convierte los que
  existian), clave de solicitud en recibos, planes de pago y cuotas, notificaciones y registro de correos.
