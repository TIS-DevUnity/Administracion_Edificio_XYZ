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
 *     summary: Genera una expensa para un inmueble (monto segun su tipo; usa el saldo a favor del inmueble si lo tiene)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inmuebleId: { type: string }
 *               periodo: { type: string, example: "2026-09" }
 *               fechaVencimiento: { type: string, example: "2026-09-30" }
 *     responses:
 *       201: { description: Expensa generada (incluye saldoFavorAplicado) }
 *       400: { description: Datos invalidos }
 *       404: { description: Inmueble no encontrado }
 *       409: { description: Inmueble inactivo o expensa duplicada }
 */
router.get('/', autenticar, CONSULTA, controller.listar)
router.post('/', autenticar, GESTION, controller.generar)

/**
 * @openapi
 * /api/financiero/expensas/{id}/aplicar-mora:
 *   post:
 *     summary: Calcula el recargo por mora de una expensa segun la configuracion vigente (UNICA o MENSUAL). La mora corre desde el dia siguiente al ultimo dia de gracia.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Expensa con la mora al dia; `moraActualizada` indica si el monto cambio" }
 *       404: { description: Expensa no encontrada }
 *       409: { description: No hay configuracion de mora vigente }
 */
router.post('/:id/aplicar-mora', autenticar, GESTION, controller.aplicarMora)

/**
 * @openapi
 * /api/financiero/expensas/{id}/pagos:
 *   post:
 *     summary: Registra un pago sobre una expensa (permite pagos parciales). Si se paga de mas, el exceso queda como saldo a favor del inmueble.
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
 *             properties:
 *               monto: { type: number, example: 350, description: "Mayor que cero, maximo 2 decimales" }
 *               metodoPago: { type: string, enum: [EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE] }
 *               referencia: { type: string, example: "Comprobante 00123", maxLength: 200 }
 *     responses:
 *       201: { description: "Pago registrado. Incluye montoRecibido, montoAplicado y saldoFavorGenerado" }
 *       400: { description: monto o metodoPago invalidos o ausentes }
 *       404: { description: Expensa no encontrada }
 *       409: { description: La expensa ya esta pagada }
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
 *       409: { description: La expensa ya esta pagada o el inmueble no tiene saldo a favor }
 */
router.post('/:id/aplicar-saldo', autenticar, GESTION, controller.aplicarSaldoFavor)

module.exports = router
