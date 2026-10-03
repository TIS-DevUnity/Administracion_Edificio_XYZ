const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./cuenta-inmueble.controller')

const router = Router()

const GESTION = autorizar('ADMINISTRADOR')
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

/**
 * @openapi
 * /api/financiero/inmuebles/{id}/pagos-anticipados:
 *   post:
 *     summary: Registra un pago por adelantado de un inmueble; queda como saldo a favor
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id del inmueble
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [monto, metodoPago]
 *             properties:
 *               monto: { type: number, example: 1000, description: "Mayor que cero, maximo 2 decimales" }
 *               metodoPago: { type: string, enum: [EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE] }
 *               referencia: { type: string, example: "Transferencia 4521", maxLength: 200 }
 *     responses:
 *       201: { description: Saldo a favor registrado (devuelve el saldo vigente) }
 *       400: { description: monto o metodoPago invalidos }
 *       404: { description: Inmueble no encontrado }
 */
router.post('/:id/pagos-anticipados', autenticar, GESTION, controller.registrarPagoAnticipado)

/**
 * @openapi
 * /api/financiero/inmuebles/{id}/saldo:
 *   get:
 *     summary: Cuanto debe un inmueble hoy (deuda pendiente menos saldo a favor)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "deudaPendiente, saldoFavor y saldoNeto (positivo = debe, negativo = a favor); situacion: DEBE | AL_DIA | A_FAVOR"
 *       404: { description: Inmueble no encontrado }
 */
router.get('/:id/saldo', autenticar, CONSULTA, controller.obtenerSaldo)

/**
 * @openapi
 * /api/financiero/inmuebles/{id}/estado-cuenta:
 *   get:
 *     summary: Estado de cuenta de un inmueble - expensas, pagos, mora, movimientos de saldo y resumen
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: desde
 *         description: Filtra expensas por fecha de vencimiento (y movimientos de saldo por fecha) desde esta fecha
 *         schema: { type: string, format: date, example: "2026-01-01" }
 *       - in: query
 *         name: hasta
 *         description: Hasta esta fecha, inclusive
 *         schema: { type: string, format: date, example: "2026-12-31" }
 *     responses:
 *       200: { description: Estado de cuenta }
 *       400: { description: Fechas invalidas }
 *       404: { description: Inmueble no encontrado }
 */
router.get('/:id/estado-cuenta', autenticar, CONSULTA, controller.obtenerEstadoCuenta)

/**
 * @openapi
 * /api/financiero/inmuebles/{id}/saldo-favor/movimientos:
 *   get:
 *     summary: Historial de abonos y usos del saldo a favor de un inmueble (ultimos 200)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Saldo vigente y movimientos, del mas reciente al mas antiguo }
 *       404: { description: Inmueble no encontrado }
 */
router.get('/:id/saldo-favor/movimientos', autenticar, CONSULTA, controller.listarMovimientosSaldo)

module.exports = router
