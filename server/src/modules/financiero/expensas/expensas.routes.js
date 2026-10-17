const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./expensas.controller')

const router = Router()

const GESTION = autorizar('ADMINISTRADOR')
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

/**
 * @openapi
 * /api/financiero/expensas:
 *   get:
 *     summary: Lista las expensas generadas (con filtros opcionales; con `pagina` devuelve { expensas, paginacion })
 *     description: |
 *       Cada expensa trae `cargos` (una linea por concepto: departamento, parqueo, baulera),
 *       `saldoFavorInmueble` (saldo a favor vigente del inmueble) y `pagadoConSaldoFavor` (lo
 *       que ya se cubrio de esa expensa con saldo a favor). `aguaRegistradaEn` es la fecha en
 *       que se cargo el agua (null = todavia falta cargarla).
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: periodo
 *         schema: { type: string, example: "2026-09" }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [PENDIENTE, PARCIAL, PAGADA, VENCIDA] }
 *       - in: query
 *         name: inmuebleId
 *         schema: { type: string }
 *       - in: query
 *         name: aguaCargada
 *         description: "true = solo las que ya tienen el agua cargada; false = solo las que todavia falta cargarla"
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: pagina
 *         description: Si se envia, la respuesta se pagina y viene como { expensas, paginacion }
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Filtro invalido }
 *   post:
 *     summary: Genera la expensa de un departamento (expensa fija segun su tipo; usa el saldo a favor si es su deuda mas antigua)
 *     description: |
 *       Solo pagan expensa los departamentos activos con alguien asignado (propietario o
 *       inquilino); baulera, parqueo y departamentos sin asignar se rechazan con 409. El monto es
 *       la expensa fija del tipo mas la cuota de cada baulera y parqueo con cobro que ocupa la
 *       persona responsable (`montoBase`, desglosado en `cargos`; ver `/api/tarifas-inmueble`).
 *       Quien tiene mas de un departamento paga baulera y parqueo una sola vez, en el primero
 *       por codigo. El agua (`montoAgua`) nace en 0 y el administrador la carga despues en
 *       `PATCH /api/financiero/expensas/{id}/agua`; baulera y parqueo no llevan agua. Si no se
 *       envia `fechaVencimiento` se usa el dia de vencimiento de la configuracion de mora.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [inmuebleId, periodo]
 *             properties:
 *               inmuebleId: { type: string }
 *               periodo: { type: string, example: "2026-09" }
 *               fechaVencimiento: { type: string, example: "2026-09-10", description: "Opcional: por defecto el dia de vencimiento configurado dentro del periodo" }
 *     responses:
 *       201: { description: "Expensa generada (incluye saldoFavorAplicado, montoBase, cargos, montoAgua, tipoNombre y moras)" }
 *       400: { description: Datos invalidos }
 *       404: { description: Inmueble no encontrado }
 *       409: { description: "Inmueble inactivo, no es departamento, sin nadie asignado, o expensa duplicada" }
 */
router.get('/', autenticar, CONSULTA, controller.listar)
router.post('/', autenticar, GESTION, controller.generar)

/**
 * @openapi
 * /api/financiero/expensas/{id}/aplicar-mora:
 *   post:
 *     summary: Genera las lineas de mora que falten de una expensa segun la configuracion vigente
 *     description: |
 *       Una linea por cada mes calendario de atraso (la primera corre desde el dia siguiente al
 *       ultimo dia sin mora: vencimiento + dias de gracia). Cada linea se calcula sobre lo que
 *       faltaba pagar de la expensa en ese momento y no se edita nunca. Si ya esta al dia no
 *       agrega nada.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Expensa con sus lineas de mora (`moras`); `moraActualizada` indica si se agrego alguna" }
 *       404: { description: Expensa no encontrada }
 *       409: { description: No hay configuracion de mora vigente }
 */
router.post('/:id/aplicar-mora', autenticar, GESTION, controller.aplicarMora)

/**
 * @openapi
 * /api/financiero/expensas/{id}/pagos:
 *   post:
 *     summary: Registra un pago sobre una expensa (cuotas solo estando al dia). Si se paga de mas, el exceso queda como saldo a favor del inmueble.
 *     description: |
 *       Reglas: la expensa debe ser la deuda mas antigua del inmueble; un mes atrasado (ya hay una
 *       expensa de un periodo posterior) se paga completo, sin cuotas; la expensa actual admite
 *       cuotas aunque tenga mora. En cada expensa el pago cubre primero la mora y luego el monto.
 *       Respuesta 409 con `codigo`: DEUDA_ATRASADA, DEUDA_ATRASADA_INCOMPLETA, ORDEN_DE_PAGO o
 *       EXPENSA_EN_PLAN (la expensa esta en un plan de pagos: se paga en el plan).
 *       Con la cabecera `Idempotency-Key`, reenviar la misma solicitud no cobra dos veces: responde
 *       200 con `duplicado: true` y el recibo ya registrado.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         description: Texto unico por solicitud para evitar cobros duplicados por reenvio
 *         schema: { type: string, maxLength: 100 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monto: { type: number, example: 350, description: "Mayor que cero, maximo 2 decimales" }
 *               metodoPago: { type: string, enum: [EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE] }
 *               referencia: { type: string, example: "Comprobante 00123", maxLength: 200 }
 *               fechaPago: { type: string, example: "2026-10-03", description: "Dia en que se pago (YYYY-MM-DD, hora de Bolivia). Opcional: sin ella se usa el momento actual. No puede ser futura." }
 *     responses:
 *       201: { description: "Pago registrado. Incluye montoRecibido, montoAplicado (montoAplicadoMora y montoAplicadoExpensa), saldoFavorGenerado, tipoPago (CUOTA | PAGO_COMPLETO | ANTICIPADO) y el recibo (folio y enlace al PDF)" }
 *       400: { description: monto, metodoPago o fechaPago invalidos o ausentes }
 *       404: { description: Expensa no encontrada }
 *       409: { description: "La expensa ya esta pagada, o el pago incumple las reglas (orden de meses, mes atrasado incompleto)" }
 */
router.post('/:id/pagos', autenticar, GESTION, controller.registrarPago)

/**
 * @openapi
 * /api/financiero/expensas/{id}/aplicar-saldo:
 *   post:
 *     summary: Cubre lo pendiente de una expensa con el saldo a favor del inmueble
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Saldo aplicado, devuelve la expensa y saldoFavorAplicado }
 *       404: { description: Expensa no encontrada }
 *       409: { description: "La expensa ya esta pagada, el inmueble no tiene saldo a favor, no es la deuda mas antigua o el saldo no completa un mes atrasado" }
 */
router.post('/:id/aplicar-saldo', autenticar, GESTION, controller.aplicarSaldoFavor)

/**
 * @openapi
 * /api/financiero/expensas/{id}/agua:
 *   patch:
 *     summary: Carga (o corrige) el agua de una expensa ya generada (solo ADMINISTRADOR)
 *     description: |
 *       El administrador pone a mano el importe de agua de cada departamento; no hay factura
 *       del edificio ni reparto. `montoTotal = montoBase + montoAgua` y el estado se recalcula con
 *       lo ya pagado. Se puede corregir mientras la expensa no tenga mora generada y el nuevo total
 *       no quede por debajo de lo ya pagado. Si el agua sube y el inmueble tiene saldo a favor,
 *       este cubre el aumento (`saldoFavorAplicado`). Cada cambio queda en la auditoria.
 *     tags: [Financiero]
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
 *             required: [montoAgua]
 *             properties:
 *               montoAgua: { type: number, example: 45, description: "0 o mayor, maximo 2 decimales" }
 *     responses:
 *       200: { description: "Expensa actualizada (montoAgua, montoTotal, estado, aguaRegistradaEn) y saldoFavorAplicado" }
 *       400: { description: montoAgua invalido o ausente }
 *       403: { description: Sin permisos }
 *       404: { description: Expensa no encontrada }
 *       409: { description: "La expensa ya tiene mora, el nuevo total queda por debajo de lo pagado o el monto es el mismo (codigo EXPENSA_CON_MORA, AGUA_MENOR_A_LO_PAGADO o SIN_CAMBIO)" }
 */
router.patch('/:id/agua', autenticar, GESTION, controller.cargarAgua)

/**
 * @openapi
 * /api/financiero/expensas/{id}/vencimiento:
 *   patch:
 *     summary: Cambia la fecha de vencimiento de una expensa ya generada (solo ADMINISTRADOR)
 *     description: |
 *       Solo mientras la expensa no tenga mora generada y no este pagada. Cada cambio queda en
 *       el historial de la expensa (`cambiosVencimiento`: quien, cuando, fecha anterior y nueva)
 *       y en la auditoria. El nuevo plazo se usa para calcular la mora a partir de entonces.
 *     tags: [Financiero]
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
 *             required: [fechaVencimiento]
 *             properties:
 *               fechaVencimiento: { type: string, example: "2026-10-15", description: "YYYY-MM-DD; no anterior al dia en que se genero la expensa" }
 *               motivo: { type: string, maxLength: 300, example: "Feriado" }
 *     responses:
 *       200: { description: Expensa con su historial de cambios de vencimiento }
 *       400: { description: Fecha invalida }
 *       403: { description: Sin permisos }
 *       404: { description: Expensa no encontrada }
 *       409: { description: "La expensa esta pagada, ya tiene mora generada o la fecha es la misma (codigo EXPENSA_PAGADA, EXPENSA_CON_MORA o SIN_CAMBIO)" }
 */
router.patch('/:id/vencimiento', autenticar, GESTION, controller.cambiarVencimiento)

module.exports = router
