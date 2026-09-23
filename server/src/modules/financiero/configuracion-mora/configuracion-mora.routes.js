const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./configuracion-mora.controller')

const router = Router()

const GESTION = autorizar('ADMINISTRADOR')
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

/**
 * @openapi
 * /api/financiero/configuracion-mora:
 *   get:
 *     summary: Obtiene la configuracion de mora vigente (dia de generacion, dias de gracia, valor)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       404: { description: No hay configuracion vigente }
 *   post:
 *     summary: Crea una nueva configuracion de mora (queda como la vigente, se conserva historial)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               diaGeneracion: { type: integer, example: 1, description: "Dia del mes (1-28) en que se generan las expensas" }
 *               diasGracia: { type: integer, example: 5 }
 *               tipoValor: { type: string, enum: [PORCENTAJE, MONTO_FIJO], example: PORCENTAJE }
 *               valor: { type: number, example: 2 }
 *     responses:
 *       201: { description: Configuracion creada }
 *       400: { description: Datos invalidos }
 */
router.get('/', autenticar, CONSULTA, controller.obtenerVigente)
router.post('/', autenticar, GESTION, controller.crear)

/**
 * @openapi
 * /api/financiero/configuracion-mora/historial:
 *   get:
 *     summary: Lista el historial completo de configuraciones de mora
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get('/historial', autenticar, CONSULTA, controller.listarHistorial)

module.exports = router
