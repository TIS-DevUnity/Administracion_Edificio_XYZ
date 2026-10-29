const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const cuentas = require('./cuentas.controller')
const movimientosCaja = require('./movimientos-caja.controller')
const conciliacion = require('./conciliacion.controller')
const saldos = require('./saldos.controller')
const cierres = require('./cierres.controller')

const router = Router()

// Caja y bancos: GESTION registra y cambia; SUPERVISION solo consulta.
const GESTION = autorizar('ADMINISTRADOR')
const SUPERVISION = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/caja-bancos/cuentas:
 *   get:
 *     summary: Cuentas de caja y de banco del edificio
 *     description: |
 *       La caja recibe el efectivo y las cuentas de banco el resto de los medios de pago. Por defecto solo
 *       trae las activas. `esPorDefecto` marca la cuenta que se usa cuando un cobro o movimiento no indica
 *       cuenta (una por tipo). `datosPendientes` es true mientras la cuenta conserve los datos de marcador
 *       de la migracion (POR DEFINIR): hay que completarlos con PATCH.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [CAJA, BANCO] }
 *       - in: query
 *         name: incluirInactivas
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200: { description: "{ cuentas: [{ id, nombre, tipo, tipoEtiqueta, banco, numeroCuenta, esPorDefecto, activa, saldoInicial, tieneMovimientos, datosPendientes }] }" }
 *       400: { description: Tipo invalido }
 *       403: { description: Solo Administrador o Directorio }
 *   post:
 *     summary: Crea una cuenta de caja o de banco (solo ADMINISTRADOR)
 *     description: |
 *       Una cuenta de banco exige `banco` y `numeroCuenta`; una caja no los lleva. El nombre y el numero de
 *       cuenta no se repiten. La primera cuenta de cada tipo queda como cuenta por defecto; con
 *       `esPorDefecto: true` la nueva reemplaza a la actual. El tipo no se puede cambiar despues.
 *       `saldoInicial` (por defecto 0, puede ser negativo) es el saldo con el que arranca la cuenta.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, tipo]
 *             properties:
 *               nombre: { type: string, example: Banco Union cuenta corriente }
 *               tipo: { type: string, enum: [CAJA, BANCO] }
 *               banco: { type: string, example: Banco Union }
 *               numeroCuenta: { type: string, example: "10000123456" }
 *               saldoInicial: { type: number, example: 0 }
 *               esPorDefecto: { type: boolean }
 *     responses:
 *       201: { description: "{ cuenta, mensaje }" }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
 *       409: { description: Ya existe una cuenta con ese nombre o numero de cuenta }
 */
router.get('/cuentas', autenticar, SUPERVISION, cuentas.listar)
router.post('/cuentas', autenticar, GESTION, cuentas.crear)

/**
 * @openapi
 * /api/financiero/caja-bancos/cuentas/{id}:
 *   get:
 *     summary: Detalle de una cuenta
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ cuenta }" }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Cuenta no encontrada }
 *   patch:
 *     summary: Edita una cuenta (solo ADMINISTRADOR)
 *     description: |
 *       Solo cambian los campos enviados. Sirve tambien para reemplazar los datos de marcador del banco
 *       creado por la migracion (nombre, banco y numeroCuenta). El tipo no se puede cambiar (se desactiva
 *       la cuenta y se crea otra) y la cuenta por defecto se cambia con POST /cuentas/{id}/por-defecto.
 *       Reglas: no se desactiva la cuenta por defecto ni una con movimientos PENDIENTE o CON_DIFERENCIA;
 *       el saldo inicial no se cambia cuando la cuenta ya tiene periodos cerrados.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               banco: { type: string }
 *               numeroCuenta: { type: string }
 *               saldoInicial: { type: number }
 *               activa: { type: boolean }
 *     responses:
 *       200: { description: "{ cuenta, mensaje }" }
 *       400: { description: Datos invalidos o campo no editable (tipo, esPorDefecto) }
 *       403: { description: Sin permisos }
 *       404: { description: Cuenta no encontrada }
 *       409:
 *         description: |
 *           Nombre o numero duplicado, o codigo CUENTA_POR_DEFECTO_NO_DESACTIVABLE, CUENTA_CON_PENDIENTES
 *           o SALDO_INICIAL_BLOQUEADO
 */
router.get('/cuentas/:id', autenticar, SUPERVISION, cuentas.obtener)
router.patch('/cuentas/:id', autenticar, GESTION, cuentas.actualizar)

/**
 * @openapi
 * /api/financiero/caja-bancos/cuentas/{id}/por-defecto:
 *   post:
 *     summary: Designa la cuenta por defecto de su tipo (solo ADMINISTRADOR)
 *     description: |
 *       Es la cuenta que reciben los cobros y movimientos cuando no se indica `cuentaId`: el efectivo va a
 *       la caja por defecto y el resto de los medios al banco por defecto. La anterior deja de serlo en la
 *       misma operacion. La cuenta debe estar activa.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ cuenta, anterior, mensaje }" }
 *       403: { description: Sin permisos }
 *       404: { description: Cuenta no encontrada }
 *       409: { description: "Cuenta desactivada (codigo CUENTA_INACTIVA)" }
 */
router.post('/cuentas/:id/por-defecto', autenticar, GESTION, cuentas.designarPorDefecto)

/**
 * @openapi
 * /api/financiero/caja-bancos/movimientos:
 *   get:
 *     summary: Libro de caja y bancos - ingresos y egresos con su cuenta y estado de conciliacion
 *     description: |
 *       Cada fila es un asiento que nace solo de un cobro (recibo) o de un movimiento extraordinario.
 *       `medio` indica si fue EFECTIVO (cuenta de caja) o TRANSFERENCIA (cuenta de banco; incluye tarjeta y
 *       cheque, cuyo metodo exacto va en `metodoPago`). `estado`: PENDIENTE, CONCILIADO o CON_DIFERENCIA
 *       (no coincide con el extracto: sigue sin conciliar y pendiente de revision). `bloqueado` es true cuando
 *       el periodo ya esta cerrado. El `resumen` es de todo lo que cumple el filtro, no solo de la pagina.
 *       Use `periodo` o `desde`/`hasta`, no ambos. `noConciliados=true` trae todo menos CONCILIADO.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: periodo
 *         schema: { type: string, example: "2026-10" }
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date, example: "2026-10-01" }
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date, example: "2026-10-31" }
 *       - in: query
 *         name: cuentaId
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         description: Ingreso o Gasto (tambien EGRESO)
 *         schema: { type: string, enum: [INGRESO, EGRESO, GASTO] }
 *       - in: query
 *         name: estado
 *         description: Uno o varios separados por coma
 *         schema: { type: string, example: "PENDIENTE,CON_DIFERENCIA" }
 *       - in: query
 *         name: noConciliados
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: medio
 *         schema: { type: string, enum: [EFECTIVO, TRANSFERENCIA] }
 *       - in: query
 *         name: origen
 *         schema: { type: string, enum: [RECIBO, MOVIMIENTO_FINANCIERO, TRASPASO] }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, maximum: 200 }
 *     responses:
 *       200: { description: "{ filtros, movimientos, resumen: { ingresos, egresos, balance, cantidad, porEstado }, paginacion }" }
 *       400: { description: "Filtros invalidos (periodo, fechas, tipo, estado, medio u origen) o rango de fechas invertido" }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/movimientos', autenticar, SUPERVISION, movimientosCaja.listar)

/**
 * @openapi
 * /api/financiero/caja-bancos/movimientos/{id}:
 *   get:
 *     summary: Detalle de un movimiento de caja o banco con su origen y su historial de conciliaciones
 *     description: |
 *       `origen` es el recibo (folio, inmueble, metodo de pago, enlace al PDF), el movimiento extraordinario
 *       (categoria, comprobante) o el traspaso del que nace. `extracto` trae lo que se comparo en la ultima
 *       conciliacion (fecha, monto, tipo, referencia y diferencia). `historial` son los ultimos 100 eventos.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ movimiento, origen, extracto, registradoPor, conciliadoPor, historial }" }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Movimiento no encontrado }
 */
router.get('/movimientos/:id', autenticar, SUPERVISION, movimientosCaja.obtener)

/**
 * @openapi
 * /api/financiero/caja-bancos/movimientos/{id}/comprobar:
 *   post:
 *     summary: Comprueba un movimiento contra el extracto antes de conciliarlo (no guarda nada)
 *     description: |
 *       Compara fecha (por dia, hora de Bolivia), monto, tipo y referencia del movimiento con lo que indica el
 *       extracto bancario o el arqueo de caja. Devuelve si coincide y, si no, en que campos difiere. Si hay
 *       diferencias, `requiereObservacion` es true: al conciliar hay que explicarlas.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fecha, monto, tipo]
 *             properties:
 *               fecha: { type: string, example: "2026-10-31", description: "Dia que indica el extracto o el arqueo (YYYY-MM-DD). Se compara con el dia del movimiento en hora de Bolivia." }
 *               monto: { type: number, example: 150.5, description: "Monto que indica el extracto (mayor que cero, maximo 2 decimales)" }
 *               tipo: { type: string, enum: [INGRESO, EGRESO, GASTO], description: "Ingreso (abono) o gasto (cargo) segun el extracto" }
 *               referencia: { type: string, maxLength: 200, description: "Referencia del extracto. Se compara sin importar mayusculas ni espacios repetidos." }
 *     responses:
 *       200: { description: "{ movimiento, coincide, diferencias: [{ campo, nuestro, banco }], requiereObservacion, puedeConciliar }" }
 *       400: { description: Datos del extracto invalidos o ausentes (codigo CAMPOS_OBLIGATORIOS) }
 *       403: { description: Solo Administrador }
 *       404: { description: Movimiento no encontrado }
 */
router.post('/movimientos/:id/comprobar', autenticar, GESTION, conciliacion.comprobar)

/**
 * @openapi
 * /api/financiero/caja-bancos/movimientos/{id}/conciliar:
 *   post:
 *     summary: Concilia un movimiento con el extracto
 *     description: |
 *       Si fecha, monto, tipo y referencia coinciden, el movimiento pasa a CONCILIADO y suma al saldo conciliado
 *       de la cuenta. Si algo difiere queda CON_DIFERENCIA (sigue sin conciliar, pendiente de revision) y
 *       `observacion` es obligatoria. Siempre responde 200 con `resultado`: una diferencia no es un error.
 *       Un movimiento CONCILIADO no se concilia otra vez, y tampoco uno de un periodo cerrado. Cada intento
 *       (tambien los rechazados) queda en el historial de conciliaciones.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fecha, monto, tipo]
 *             properties:
 *               fecha: { type: string, example: "2026-10-31", description: "Dia que indica el extracto o el arqueo (YYYY-MM-DD). Se compara con el dia del movimiento en hora de Bolivia." }
 *               monto: { type: number, example: 150.5, description: "Monto que indica el extracto (mayor que cero, maximo 2 decimales)" }
 *               tipo: { type: string, enum: [INGRESO, EGRESO, GASTO], description: "Ingreso (abono) o gasto (cargo) segun el extracto" }
 *               referencia: { type: string, maxLength: 200, description: "Referencia del extracto. Se compara sin importar mayusculas ni espacios repetidos." }
 *               observacion: { type: string, maxLength: 500, description: "Obligatoria cuando hay diferencias" }
 *     responses:
 *       200: { description: "{ movimiento, resultado: CONCILIADO | CON_DIFERENCIA, coincide, diferencias, saldoConciliado: { cuentaId, periodo, saldo }, mensaje }" }
 *       400: { description: "Datos invalidos, o hay diferencias y falta la observacion (codigo OBSERVACION_REQUERIDA, con las diferencias en detalle)" }
 *       403: { description: Solo Administrador }
 *       404: { description: Movimiento no encontrado }
 *       409: { description: "ASIENTO_YA_CONCILIADO (ya estaba conciliado) o PERIODO_CERRADO" }
 */
router.post('/movimientos/:id/conciliar', autenticar, GESTION, conciliacion.conciliar)

/**
 * @openapi
 * /api/financiero/caja-bancos/movimientos/{id}/observacion:
 *   patch:
 *     summary: Agrega o cambia la observacion de un movimiento
 *     description: |
 *       Sirve en cualquier movimiento con el periodo abierto. Un movimiento CON_DIFERENCIA no puede quedarse sin
 *       observacion. Un texto vacio la borra.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [observacion]
 *             properties:
 *               observacion: { type: string, maxLength: 500 }
 *     responses:
 *       200: { description: "{ movimiento, mensaje }" }
 *       400: { description: Observacion ausente o demasiado larga, o vacia en un movimiento con diferencia }
 *       403: { description: Solo Administrador }
 *       404: { description: Movimiento no encontrado }
 *       409: { description: PERIODO_CERRADO }
 */
router.patch('/movimientos/:id/observacion', autenticar, GESTION, conciliacion.actualizarObservacion)

/**
 * @openapi
 * /api/financiero/caja-bancos/conciliaciones:
 *   get:
 *     summary: Historial de conciliaciones, revisiones de diferencia, saldos reales y cierres
 *     description: |
 *       Una fila por operacion, de la mas reciente a la mas antigua: quien, cuando, sobre que movimiento o
 *       cuenta, estado anterior y nuevo, resultado (EXITOSO, CON_DIFERENCIA o RECHAZADO) y el detalle de lo
 *       que se comparo.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: cuentaId
 *         schema: { type: string }
 *       - in: query
 *         name: periodo
 *         schema: { type: string, example: "2026-10" }
 *       - in: query
 *         name: movimientoCajaId
 *         schema: { type: string }
 *       - in: query
 *         name: operacion
 *         schema: { type: string, enum: [CONCILIAR, REVISAR_DIFERENCIA, SALDO_REAL, CIERRE] }
 *       - in: query
 *         name: resultado
 *         schema: { type: string, enum: [EXITOSO, CON_DIFERENCIA, RECHAZADO] }
 *       - in: query
 *         name: usuarioId
 *         schema: { type: string }
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, maximum: 200 }
 *     responses:
 *       200: { description: "{ eventos: [{ fecha, operacion, resultado, estadoAnterior, estadoNuevo, periodo, cuenta, movimiento, usuario, detalle }], paginacion }" }
 *       400: { description: Filtros invalidos }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/conciliaciones', autenticar, SUPERVISION, conciliacion.listarEventos)

/**
 * @openapi
 * /api/financiero/caja-bancos/periodos/{periodo}/saldos:
 *   get:
 *     summary: Saldos de cada cuenta en un periodo - registrado, conciliado, real y diferencia
 *     description: |
 *       Se calculan en cada consulta, no se guardan. `saldoRegistrado` = saldo inicial + ingresos - egresos de
 *       todos los movimientos hasta el periodo; `saldoConciliado` = lo mismo solo con los CONCILIADO (los
 *       PENDIENTE y CON_DIFERENCIA no cuentan); `saldoReal` es el que guarda el Administrador (extracto o arqueo)
 *       y `diferencia` = real - registrado. `diferenciaRevisada` es true solo si la diferencia fue revisada y
 *       ni el saldo real ni el registrado cambiaron desde entonces. `entraAlCierre` indica si la cuenta forma
 *       parte del cierre del mes (activa, con movimientos en el periodo o con saldo distinto de cero).
 *       Si el periodo ya esta cerrado devuelve la foto del cierre (`origen: CIERRE`) en vez de recalcular.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: periodo
 *         required: true
 *         schema: { type: string, example: "2026-10" }
 *       - in: query
 *         name: cuentaId
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ periodo, origen: CALCULADO | CIERRE, periodoCerrado, cuentas, totales }" }
 *       400: { description: Periodo con formato invalido }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Cuenta no encontrada }
 */
router.get('/periodos/:periodo/saldos', autenticar, SUPERVISION, saldos.obtenerSaldos)

/**
 * @openapi
 * /api/financiero/caja-bancos/periodos/{periodo}/cuentas/{cuentaId}/saldo-real:
 *   put:
 *     summary: Guarda el saldo real de una cuenta en un periodo abierto (extracto bancario o arqueo de caja)
 *     description: |
 *       Se puede guardar y corregir mientras el mes esta abierto, y consultarlo en los saldos. Puede ser
 *       negativo (sobregiro). Si el valor cambia, la revision de la diferencia se pierde y hay que repetirla.
 *       No se puede registrar el de un mes que todavia no empieza.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: periodo
 *         required: true
 *         schema: { type: string, example: "2026-10" }
 *       - in: path
 *         name: cuentaId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [saldoReal]
 *             properties:
 *               saldoReal: { type: number, example: 1150.5, description: "Maximo 2 decimales" }
 *               observacion: { type: string, maxLength: 500 }
 *     responses:
 *       200: { description: "{ saldo, mensaje }" }
 *       400: { description: "saldoReal o periodo invalidos (codigo PERIODO_FUTURO si el mes no empieza)" }
 *       403: { description: Solo Administrador }
 *       404: { description: Cuenta no encontrada }
 *       409: { description: PERIODO_CERRADO }
 */
router.put('/periodos/:periodo/cuentas/:cuentaId/saldo-real', autenticar, GESTION, saldos.guardarSaldoReal)

/**
 * @openapi
 * /api/financiero/caja-bancos/periodos/{periodo}/cuentas/{cuentaId}/revisar-diferencia:
 *   post:
 *     summary: Revisa la diferencia entre el saldo real y el registrado de una cuenta
 *     description: |
 *       Una diferencia no se considera resuelta hasta que el Administrador la revisa y la explica. Sin una
 *       revision vigente el periodo no se puede cerrar. Exige que el saldo real ya este guardado y que haya
 *       diferencia.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: periodo
 *         required: true
 *         schema: { type: string, example: "2026-10" }
 *       - in: path
 *         name: cuentaId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [observacion]
 *             properties:
 *               observacion: { type: string, maxLength: 500 }
 *     responses:
 *       200: { description: "{ saldo, mensaje }" }
 *       400: { description: Falta la observacion }
 *       403: { description: Solo Administrador }
 *       404: { description: Cuenta no encontrada }
 *       409: { description: "PERIODO_CERRADO, SALDO_REAL_FALTANTE o SIN_DIFERENCIA" }
 */
router.post('/periodos/:periodo/cuentas/:cuentaId/revisar-diferencia', autenticar, GESTION, saldos.revisarDiferencia)

/**
 * @openapi
 * /api/financiero/caja-bancos/periodos/{periodo}/resumen:
 *   get:
 *     summary: Resumen de conciliacion de un periodo
 *     description: |
 *       Total de ingresos y de egresos, cuantos movimientos estan conciliados, pendientes o con diferencia (con sus
 *       importes), las diferencias de saldo por cuenta (con su revision) y las cuentas que aun no tienen saldo real.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: periodo
 *         required: true
 *         schema: { type: string, example: "2026-10" }
 *       - in: query
 *         name: cuentaId
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ periodo, periodoCerrado, totalIngresos, totalEgresos, balance, cantidad, conciliados, pendientes, conDiferencia, diferenciasDeSaldo, cuentasSinSaldoReal }" }
 *       400: { description: Periodo con formato invalido }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Cuenta no encontrada }
 */
router.get('/periodos/:periodo/resumen', autenticar, SUPERVISION, saldos.resumen)

/**
 * @openapi
 * /api/financiero/caja-bancos/periodos/{periodo}/cierre/vista-previa:
 *   get:
 *     summary: Vista previa del cierre mensual - que impide cerrar el periodo (no guarda nada)
 *     description: |
 *       Devuelve TODOS los bloqueos a la vez. Reglas: el mes debe haber terminado; el primer cierre es el del mes
 *       del movimiento mas antiguo y los demas son consecutivos (ningun mes se salta); no puede haber movimientos
 *       PENDIENTE ni CON_DIFERENCIA; todo cobro y movimiento del mes debe tener su asiento y coincidir con su
 *       origen; cada cuenta del cierre (las activas, las que tienen movimientos en el periodo o saldo distinto de
 *       cero) debe tener saldo real; y cada diferencia de saldo debe estar revisada. Un mes sin movimientos se puede
 *       cerrar si no hay otros bloqueos. Codigos de bloqueo: PERIODO_YA_CERRADO, PERIODO_NO_TERMINADO,
 *       PERIODO_FUERA_DE_ORDEN, SIN_ASIENTOS (solo bloquea el primer cierre), MOVIMIENTOS_SIN_RESOLVER,
 *       ASIENTOS_FALTANTES, ASIENTOS_DESFASADOS, SALDO_REAL_FALTANTE, DIFERENCIA_SIN_REVISAR y (solo al cerrar)
 *       DIFERENCIA_SIN_CONFIRMAR.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: periodo
 *         required: true
 *         schema: { type: string, example: "2026-09" }
 *     responses:
 *       200: { description: "{ periodo, puedeCerrar, periodoEsperado, mesTerminado, bloqueos, sinResolver, asientosFaltantes, desfases, cuentas }" }
 *       400: { description: Periodo con formato invalido }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/periodos/:periodo/cierre/vista-previa', autenticar, SUPERVISION, cierres.vistaPrevia)

/**
 * @openapi
 * /api/financiero/caja-bancos/periodos/{periodo}/cierre:
 *   post:
 *     summary: Cierra el periodo (mes) de caja y bancos
 *     description: |
 *       Vuelve a evaluar todas las reglas dentro de una transaccion con el bloqueo exclusivo de periodos (espera a
 *       los cobros en curso y frena a los nuevos). Si algo impide cerrar responde 409 CIERRE_BLOQUEADO con la lista
 *       completa en `detalle.bloqueos`. Si todo esta bien guarda el cierre y la foto de saldos de cada cuenta
 *       (registrado, conciliado, real y diferencia). Cada cuenta con diferencia debe venir en
 *       `confirmarDiferencias`: la confirmacion es explicita. Un periodo cerrado no se puede reabrir ni modificar,
 *       y sus movimientos no admiten cambios.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: periodo
 *         required: true
 *         schema: { type: string, example: "2026-09" }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               confirmarDiferencias: { type: array, items: { type: string }, description: "Ids de las cuentas cuya diferencia de saldo se confirma" }
 *               observacion: { type: string, maxLength: 500 }
 *     responses:
 *       201: { description: "{ cierre, cuentas, totales, mensaje }" }
 *       400: { description: Periodo o confirmarDiferencias invalidos }
 *       403: { description: Solo Administrador }
 *       409: { description: "CIERRE_BLOQUEADO (con detalle.bloqueos) o PERIODO_YA_CERRADO" }
 */
router.post('/periodos/:periodo/cierre', autenticar, GESTION, cierres.cerrar)

/**
 * @openapi
 * /api/financiero/caja-bancos/cierres:
 *   get:
 *     summary: Historial de periodos cerrados (solo lectura)
 *     description: Del mas reciente al mas antiguo, con quien cerro, cuando y los totales de saldos al cierre.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: pagina
 *         schema: { type: integer }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, maximum: 200 }
 *     responses:
 *       200: { description: "{ cierres: [{ periodo, cerradoEn, cerradoPor, cuentas, totales }], paginacion }" }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/cierres', autenticar, SUPERVISION, cierres.listar)

/**
 * @openapi
 * /api/financiero/caja-bancos/cierres/{periodo}:
 *   get:
 *     summary: Resultado mensual de un periodo cerrado - saldos de cada cuenta al momento del cierre
 *     description: |
 *       Es la foto que quedo al cerrar (registrado, conciliado, real, diferencia, observacion y si la diferencia fue
 *       confirmada), mas el resumen de conciliacion del mes. No cambia aunque despues entren movimientos en otros
 *       meses.
 *     tags: [Caja y bancos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: periodo
 *         required: true
 *         schema: { type: string, example: "2026-09" }
 *     responses:
 *       200: { description: "{ cierre, cuentas, totales, resumen }" }
 *       400: { description: Periodo con formato invalido }
 *       403: { description: Solo Administrador o Directorio }
 *       404: { description: Ese periodo no esta cerrado }
 */
router.get('/cierres/:periodo', autenticar, SUPERVISION, cierres.obtener)

module.exports = router
