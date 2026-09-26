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
 *         schema: { type: string }
 *       - in: query
 *         name: accion
 *         schema: { type: string }
 *       - in: query
 *         name: desde
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: hasta
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Sin permisos }
 */
router.get("/", autenticar, LECTURA, controller.listar);

module.exports = router;
