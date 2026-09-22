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
 *     summary: Lista todas las expensas generadas
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Genera una expensa para un inmueble (monto calculado segun su tipo)
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
 *       201: { description: Expensa generada }
 *       404: { description: Inmueble no encontrado }
 *       409: { description: Inmueble inactivo o expensa duplicada }
 */
router.get('/', autenticar, CONSULTA, controller.listar)
router.post('/', autenticar, GESTION, controller.generar)

/**
 * @openapi
 * /api/financiero/expensas/{id}/aplicar-mora:
 *   post:
 *     summary: Revisa una expensa vencida y le aplica el recargo por mora segun la configuracion vigente
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Mora aplicada o expensa aun dentro del periodo de gracia }
 *       404: { description: Expensa no encontrada }
 *       409: { description: No hay configuracion de mora vigente }
 */
router.post('/:id/aplicar-mora', autenticar, GESTION, controller.aplicarMora)

/**
 * @openapi
 * /api/financiero/expensas/{id}/pagos:
 *   post:
 *     summary: Registra un pago sobre una expensa (permite pagos parciales) y actualiza su estado
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
 *               monto: { type: number, example: 350 }
 *               metodoPago: { type: string, enum: [EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE] }
 *               referencia: { type: string, example: "Comprobante 00123" }
 *     responses:
 *       201: { description: Pago registrado, estado de la expensa actualizado }
 *       400: { description: monto y metodoPago son requeridos }
 *       404: { description: Expensa no encontrada }
 *       409: { description: La expensa ya esta pagada }
 */
router.post('/:id/pagos', autenticar, GESTION, controller.registrarPago)

module.exports = router
