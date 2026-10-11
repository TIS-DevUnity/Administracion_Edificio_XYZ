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
 *     summary: Obtiene la configuracion de mora vigente (dia de generacion, dia de vencimiento, dias de gracia, valor)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       404: { description: No hay configuracion vigente }
 *   post:
 *     summary: Crea una nueva configuracion de mora (queda como la vigente, se conserva historial). Solo ADMINISTRADOR.
 *     description: |
 *       La mora corre desde el dia siguiente al ultimo dia sin mora (`diaVencimiento` + `diasGracia`)
 *       y se cobra por cada mes calendario de atraso, sobre lo que falta pagar de la expensa
 *       (porcentaje) o como monto fijo por mes.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [diaGeneracion, diasGracia, tipoValor, valor]
 *             properties:
 *               diaGeneracion: { type: integer, example: 1, description: "Dia del mes (1-28) en que se generan las expensas" }
 *               diaVencimiento: { type: integer, example: 10, description: "Dia del mes (1-28) en que vence la expensa; no puede ser anterior al dia de generacion. Si se omite se conserva el de la configuracion anterior." }
 *               diasGracia: { type: integer, example: 0, description: "Dias extra despues del vencimiento antes de que corra la mora" }
 *               tipoValor: { type: string, enum: [PORCENTAJE, MONTO_FIJO], example: PORCENTAJE }
 *               valor: { type: number, example: 10, description: "No puede ser negativo; si el tipo es PORCENTAJE, maximo 100" }
 *               modoMora:
 *                 type: string
 *                 enum: [UNICA, MENSUAL]
 *                 default: MENSUAL
 *                 description: "MENSUAL genera una mora por cada mes de atraso; UNICA solo la del primer mes"
 *               vigenteDesde:
 *                 type: string
 *                 example: "2026-11-01"
 *                 description: "Desde cuando rige (YYYY-MM-DD, hoy o futura). Opcional: rige desde ahora. La nueva regla solo aplica hacia adelante: cada expensa conserva la configuracion que regia en su periodo."
 *     responses:
 *       201: { description: Configuracion creada }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
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
