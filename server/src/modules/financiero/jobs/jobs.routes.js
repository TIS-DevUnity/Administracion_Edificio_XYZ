const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./jobs.controller')

const router = Router()

const GESTION = autorizar('ADMINISTRADOR')

/**
 * @openapi
 * /api/financiero/jobs/ejecutar-generacion:
 *   post:
 *     summary: Dispara manualmente la generacion automatica de expensas
 *     description: >
 *       Por defecto respeta el dia de generacion configurado (igual que el
 *       cron real). Usar ?forzar=true para saltarse esa validacion y generar
 *       de inmediato, util solo para pruebas o demostraciones. Se puede volver a
 *       ejecutar sin duplicar: lo ya generado se conserva y solo se intenta lo pendiente.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: forzar
 *         schema: { type: boolean }
 *         description: Si es true, genera sin importar el dia configurado
 *     responses:
 *       200:
 *         description: >
 *           { periodo, generadas, omitidas, yaGeneradas: [codigos que ya tenian expensa],
 *           pendientes: [{ codigo, motivo }] (fallaron: corregir y volver a ejecutar),
 *           excluidos: [{ codigo, motivo }] (departamentos sin nadie asignado o inactivos) }
 *       403: { description: Sin permisos }
 */
router.post('/ejecutar-generacion', autenticar, GESTION, controller.ejecutarGeneracion)

/**
 * @openapi
 * /api/financiero/jobs/ejecutar-mora:
 *   post:
 *     summary: Dispara manualmente la aplicacion de mora a expensas vencidas
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       403: { description: Sin permisos }
 */
router.post('/ejecutar-mora', autenticar, GESTION, controller.ejecutarMora)

/**
 * @openapi
 * /api/financiero/jobs/ejecutar-notificaciones:
 *   post:
 *     summary: Dispara manualmente el proceso diario de avisos de la campanita
 *     description: |
 *       Crea las notificaciones que correspondan hoy (proximo vencimiento, fin del periodo de gracia, obligacion
 *       vencida y recordatorio mensual de deuda con mora), pone al dia los recordatorios existentes y marca
 *       como VENCIDAS las cuotas de planes de pago que no se pagaron a tiempo. Se puede repetir sin duplicar.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ cuotasMarcadasVencidas, revisadas, creadas, porTipo }" }
 *       403: { description: Sin permisos }
 */
router.post('/ejecutar-notificaciones', autenticar, GESTION, controller.ejecutarNotificaciones)

module.exports = router
