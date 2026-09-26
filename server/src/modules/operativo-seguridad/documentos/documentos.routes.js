const { Router } = require("express");
const { autenticar } = require("../../../middlewares/auth.middleware");
const { autorizar } = require("../../../middlewares/rbac.middleware");
const { upload } = require("../../../middlewares/upload.middleware");
const controller = require("./documentos.controller");

const router = Router();

const GESTION = autorizar("ADMINISTRADOR", "DIRECTORIO");
const LECTURA = autorizar("ADMINISTRADOR", "DIRECTORIO", "CONSULTA");
const ELIMINAR = autorizar("ADMINISTRADOR");

/**
 * @openapi
 * /api/documentos:
 *   get:
 *     summary: Lista documentos (actas, reglamentos, contratos, facturas, fotos, cotizaciones)
 *     tags: [Documentos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: categoria
 *         schema: { type: string, enum: [ACTA, REGLAMENTO, CONTRATO, FACTURA, FOTOGRAFIA, COTIZACION, OTRO] }
 *       - in: query
 *         name: entidad
 *         schema: { type: string }
 *       - in: query
 *         name: entidadId
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Sin permisos }
 *   post:
 *     summary: Sube un nuevo documento (solo ADMINISTRADOR/DIRECTORIO)
 *     tags: [Documentos]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivo: { type: string, format: binary }
 *               categoria: { type: string, enum: [ACTA, REGLAMENTO, CONTRATO, FACTURA, FOTOGRAFIA, COTIZACION, OTRO] }
 *               entidad: { type: string }
 *               entidadId: { type: string }
 *     responses:
 *       201: { description: Documento creado }
 *       400: { description: Datos invalidos }
 */
router.get("/", autenticar, LECTURA, controller.listar);
router.post("/", autenticar, GESTION, upload.single("archivo"), controller.crear);

/**
 * @openapi
 * /api/documentos/{id}:
 *   get:
 *     summary: Obtiene metadata y un enlace de descarga temporal (5 min) de un documento
 *     tags: [Documentos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Documento no encontrado }
 *   delete:
 *     summary: Elimina un documento (solo ADMINISTRADOR)
 *     tags: [Documentos]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Documento eliminado }
 *       404: { description: Documento no encontrado }
 */
router.get("/:id", autenticar, LECTURA, controller.obtener);
router.delete("/:id", autenticar, ELIMINAR, controller.eliminar);

module.exports = router;
