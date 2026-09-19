const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { autorizar } = require("../../../middlewares/rbac.middleware");
const controller = require("./tipos-inmueble.controller");

const router = Router();

const LECTURA = autorizar("ADMINISTRADOR", "DIRECTORIO", "CONSULTA");

/**
 * @openapi
 * /api/tipos-inmueble:
 *   get:
 *     summary: Lista los tipos de inmueble disponibles (departamento, parqueo, baulera) con su monto base
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get("/", autenticar, LECTURA, controller.listar);

/**
 * @openapi
 * /api/tipos-inmueble/{id}:
 *   get:
 *     summary: Obtiene un tipo de inmueble por id
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Tipo de inmueble no encontrado }
 */
router.get("/:id", autenticar, LECTURA, controller.obtener);

module.exports = router;
