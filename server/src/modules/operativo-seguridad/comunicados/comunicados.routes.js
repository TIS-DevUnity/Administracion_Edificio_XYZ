const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { permitir } = require("../../../middlewares/permisos");
const controller = require("./comunicados.controller");

const router = Router();

const GESTION = permitir("comunicados", "gestionar");
const LECTURA = permitir("comunicados", "ver");

/**
 * @openapi
 * /api/comunicados:
 *   get:
 *     summary: Historial de comunicados. El ADMINISTRADOR ve todos (incluidos borradores); DIRECTORIO y CONSULTA solo los enviados o fallidos
 *     tags: [Comunicados]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [BORRADOR, ENVIADO, FALLIDO] }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Estado invalido }
 *       403: { description: Sin permisos }
 *   post:
 *     summary: Crea un comunicado en estado BORRADOR (solo ADMINISTRADOR)
 *     tags: [Comunicados]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [titulo, cuerpo, canales]
 *             properties:
 *               titulo: { type: string, maxLength: 150, example: "Corte de agua el sabado" }
 *               cuerpo: { type: string, maxLength: 5000, example: "El sabado de 8:00 a 12:00 no habra servicio de agua." }
 *               canales:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: string, enum: [CORREO, WHATSAPP] }
 *                 example: [CORREO, WHATSAPP]
 *     responses:
 *       201: { description: Comunicado creado como borrador }
 *       400: { description: "Datos invalidos (campos faltantes, canal invalido o mensaje de WhatsApp de mas de 1024 caracteres)" }
 *       403: { description: Sin permisos }
 */
router.get("/", autenticar, LECTURA, controller.listar);
router.post("/", autenticar, GESTION, controller.crear);

/**
 * @openapi
 * /api/comunicados/{id}:
 *   get:
 *     summary: Obtiene un comunicado. Un borrador solo lo ve el ADMINISTRADOR (para los demas responde 404)
 *     tags: [Comunicados]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Comunicado no encontrado }
 *   patch:
 *     summary: Edita titulo, cuerpo y/o canales de un BORRADOR (solo ADMINISTRADOR)
 *     tags: [Comunicados]
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
 *               titulo: { type: string, maxLength: 150 }
 *               cuerpo: { type: string, maxLength: 5000 }
 *               canales:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: string, enum: [CORREO, WHATSAPP] }
 *     responses:
 *       200: { description: Comunicado actualizado }
 *       400: { description: Datos invalidos }
 *       404: { description: Comunicado no encontrado }
 *       409: { description: El comunicado ya fue enviado y no se puede editar }
 *   delete:
 *     summary: Elimina un BORRADOR (solo ADMINISTRADOR)
 *     tags: [Comunicados]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Eliminado }
 *       404: { description: Comunicado no encontrado }
 *       409: { description: El comunicado ya fue enviado y no se puede eliminar }
 */
router.get("/:id", autenticar, LECTURA, controller.obtener);
router.patch("/:id", autenticar, GESTION, controller.actualizar);
router.delete("/:id", autenticar, GESTION, controller.eliminar);

module.exports = router;
