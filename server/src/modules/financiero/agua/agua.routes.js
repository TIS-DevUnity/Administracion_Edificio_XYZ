const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./agua.controller')

const router = Router()

const GESTION = autorizar('ADMINISTRADOR')
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

/**
 * @openapi
 * /api/financiero/agua:
 *   get:
 *     summary: Lista las facturas de agua registradas (la mas reciente primero)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Registra (o corrige) la factura de agua del mes y la reparte entre los departamentos (solo ADMINISTRADOR)
 *     description: |
 *       El edificio tiene un solo medidor, asi que llega una factura total por mes. El monto se
 *       reparte entre las expensas generadas del periodo segun el peso de agua de cada tipo
 *       (`pesoAgua`): unidad = factura / suma de pesos, y cada departamento paga peso x unidad.
 *       El agua se suma a la expensa fija (`montoTotal = montoBase + montoAgua`); los pagos ya
 *       hechos siguen valiendo y solo cambia lo pendiente. Si el periodo ya tenia factura, se
 *       corrige y se reparte de nuevo (se rechaza si alguna expensa quedaria por debajo de lo
 *       ya pagado).
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [periodo, montoFactura]
 *             properties:
 *               periodo: { type: string, example: "2026-10" }
 *               montoFactura: { type: number, example: 1000 }
 *     responses:
 *       201: { description: Factura registrada y repartida }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
 *       409: { description: No hay expensas del periodo, o el monto dejaria una expensa por debajo de lo pagado }
 */
router.get('/', autenticar, CONSULTA, controller.listar)
router.post('/', autenticar, GESTION, controller.registrar)

/**
 * @openapi
 * /api/financiero/agua/{periodo}:
 *   get:
 *     summary: Factura de agua de un periodo y como se repartio entre los departamentos
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: periodo
 *         required: true
 *         schema: { type: string, example: "2026-10" }
 *     responses:
 *       200: { description: OK }
 *       404: { description: No hay factura para ese periodo }
 */
router.get('/:periodo', autenticar, CONSULTA, controller.obtenerPorPeriodo)

module.exports = router
