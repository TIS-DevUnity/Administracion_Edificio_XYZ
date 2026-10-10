const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { autorizar } = require("../../../middlewares/rbac.middleware");
const controller = require("./tipos-inmueble.controller");

const router = Router();

const LECTURA = autorizar("ADMINISTRADOR", "DIRECTORIO", "CONSULTA");
const GESTION = autorizar("ADMINISTRADOR");

/**
 * @openapi
 * /api/tipos-inmueble:
 *   get:
 *     summary: Lista los tipos de departamento (A, B, C...) con su expensa fija y su peso de agua
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Crea un tipo de departamento (solo ADMINISTRADOR)
 *     description: |
 *       `montoBase` es la expensa fija mensual del tipo. `pesoAgua` (mayor que 0, 1 por
 *       defecto) es el peso con el que el tipo participa en el reparto de la factura de agua.
 *     tags: [Inmuebles]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, montoBase]
 *             properties:
 *               nombre: { type: string, example: A }
 *               montoBase: { type: number, example: 300 }
 *               pesoAgua: { type: number, example: 1 }
 *     responses:
 *       201: { description: Tipo creado }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
 *       409: { description: Ya existe un tipo con ese nombre }
 */
router.get("/", autenticar, LECTURA, controller.listar);
router.post("/", autenticar, GESTION, controller.crear);

/**
 * @openapi
 * /api/tipos-inmueble/{id}:
 *   get:
 *     summary: Obtiene un tipo de departamento por id
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
 *   put:
 *     summary: Edita nombre, expensa fija o peso de agua de un tipo (solo ADMINISTRADOR)
 *     description: Solo afecta a las expensas que se generen despues; las ya generadas no cambian.
 *     tags: [Inmuebles]
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
 *               nombre: { type: string }
 *               montoBase: { type: number }
 *               pesoAgua: { type: number }
 *     responses:
 *       200: { description: Tipo actualizado }
 *       400: { description: Datos invalidos }
 *       403: { description: Sin permisos }
 *       404: { description: Tipo de inmueble no encontrado }
 *       409: { description: Ya existe un tipo con ese nombre }
 */
router.get("/:id", autenticar, LECTURA, controller.obtener);
router.put("/:id", autenticar, GESTION, controller.actualizar);

module.exports = router;
