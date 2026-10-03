const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { autorizar } = require("../../../middlewares/rbac.middleware");
const controller = require("./auditoria.controller");

const router = Router();

const LECTURA = autorizar("ADMINISTRADOR", "DIRECTORIO");

/**
 * @openapi
 * /api/auditoria:
 *   get:
 *     summary: Lista el historial de auditoria (logs) del sistema, paginado
 *     tags: [Auditoria]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: usuarioId
 *         schema: { type: string }
 *       - in: query
 *         name: entidad
 *         description: "Tipo de registro afectado, ej. Documento, Expensa, Pago, MovimientoSaldo, ConfiguracionMora, Usuario"
 *         schema: { type: string }
 *       - in: query
 *         name: entidadId
 *         description: Id del registro afectado (todo el historial de una expensa, un pago, un documento...)
 *         schema: { type: string }
 *       - in: query
 *         name: accion
 *         description: "CREATE, UPDATE, DELETE, LOGIN, LOGIN_FALLIDO, ACTIVAR, DESACTIVAR"
 *         schema: { type: string }
 *       - in: query
 *         name: desde
 *         description: Inicio del dia indicado, hora de Bolivia
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: hasta
 *         description: Final del dia indicado, hora de Bolivia (el dia completo queda incluido)
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Fecha invalida }
 *       403: { description: Sin permisos }
 */
router.get("/", autenticar, LECTURA, controller.listar);

/**
 * @openapi
 * /api/auditoria/{id}:
 *   get:
 *     summary: Obtiene un registro de la bitacora de auditoria
 *     tags: [Auditoria]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Sin permisos }
 *       404: { description: Registro no encontrado }
 */
router.get("/:id", autenticar, LECTURA, controller.obtener);

module.exports = router;
