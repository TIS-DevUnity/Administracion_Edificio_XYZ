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
 *     summary: Historial de comunicados. El ADMINISTRADOR ve todos (incluidos borradores); DIRECTORIO solo los enviados o fallidos; CONSULTA no tiene acceso (403)
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
 *               destinatarios:
 *                 type: object
 *                 description: "Opcional en el borrador. TODOS = todos los residentes vigentes (se resuelve al enviar); SELECCIONADOS = los copropietarios indicados"
 *                 required: [modo]
 *                 properties:
 *                   modo: { type: string, enum: [TODOS, SELECCIONADOS] }
 *                   copropietarioIds: { type: array, items: { type: string }, description: "Obligatorio con SELECCIONADOS" }
 *     responses:
 *       201: { description: Comunicado creado como borrador }
 *       400: { description: "Datos invalidos (campos faltantes, canal invalido o mensaje de WhatsApp de mas de 1024 caracteres)" }
 *       403: { description: Sin permisos }
 */
router.get("/", autenticar, LECTURA, controller.listar);
router.post("/", autenticar, GESTION, controller.crear);

/**
 * @openapi
 * /api/comunicados/destinatarios:
 *   get:
 *     summary: Residentes entre los que se eligen los destinatarios (solo ADMINISTRADOR). Copropietarios con ocupacion vigente en inmuebles activos; cada uno aparece una vez
 *     tags: [Comunicados]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Lista de { id, nombre, apellido, email, telefono, inmuebles: [{ codigo, esPropietario }] }" }
 *       403: { description: Sin permisos }
 */
// Va antes de /:id para que "destinatarios" no se tome como un id.
router.get("/destinatarios", autenticar, GESTION, controller.listarDestinatarios);

/**
 * @openapi
 * /api/comunicados/{id}:
 *   get:
 *     summary: Obtiene un comunicado. Un borrador solo lo ve el ADMINISTRADOR (para DIRECTORIO responde 404); CONSULTA no tiene acceso (403)
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
 *               destinatarios:
 *                 type: object
 *                 required: [modo]
 *                 properties:
 *                   modo: { type: string, enum: [TODOS, SELECCIONADOS] }
 *                   copropietarioIds: { type: array, items: { type: string } }
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

/**
 * @openapi
 * /api/comunicados/{id}/vista-previa:
 *   get:
 *     summary: Vista previa antes de enviar un BORRADOR (solo ADMINISTRADOR). Titulo, mensaje, canales y numero de destinatarios; no envia nada
 *     tags: [Comunicados]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ vistaPrevia: { comunicadoId, titulo, mensaje, canales, destinatariosModo, totalDestinatarios, sinOcupacionVigente, puedeEnviar } }" }
 *       400: { description: Comunicado incompleto (campos, limite de WhatsApp o destinatarios sin elegir) }
 *       404: { description: Comunicado no encontrado }
 *       409: { description: El comunicado ya fue enviado }
 */
router.get("/:id/vista-previa", autenticar, GESTION, controller.vistaPrevia);

/**
 * @openapi
 * /api/comunicados/{id}/enviar:
 *   post:
 *     summary: Envia un BORRADOR por sus canales (solo ADMINISTRADOR). Exige confirmar. Queda ENVIADO si llego a alguien o FALLIDO (con la causa) si no llego a nadie; no hay reintentos
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
 *             required: [confirmar]
 *             properties:
 *               confirmar: { type: boolean, enum: [true], description: "Debe ser true, despues de revisar la vista previa" }
 *     responses:
 *       200: { description: "{ comunicado, resumen: { estado, causaFallo, totalDestinatarios, enviados, fallidos, omitidos, omitidosLista, fallidosLista } }" }
 *       400: { description: Falta confirmar, comunicado incompleto o ningun destinatario vigente }
 *       404: { description: Comunicado no encontrado }
 *       409: { description: El comunicado ya se envio o se esta enviando }
 */
router.post("/:id/enviar", autenticar, GESTION, controller.enviar);

/**
 * @openapi
 * /api/comunicados/{id}/resultado:
 *   get:
 *     summary: Resultado del envio por residente y canal, con el resumen de enviados y omitidos y la lista de omitidos (ADMINISTRADOR y DIRECTORIO)
 *     tags: [Comunicados]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ comunicado, resumen, destinatarios: [{ nombre, canal, email, telefono, destinoReal, estado, motivo }] }" }
 *       403: { description: Sin permisos }
 *       404: { description: Comunicado no encontrado }
 */
router.get("/:id/resultado", autenticar, LECTURA, controller.resultado);

module.exports = router;
