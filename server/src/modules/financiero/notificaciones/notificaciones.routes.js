const { Router } = require('express')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./notificaciones.controller')

const router = Router()

const SUPERVISION = autorizar('ADMINISTRADOR', 'DIRECTORIO')

/**
 * @openapi
 * /api/financiero/notificaciones:
 *   get:
 *     summary: Campanita - notificaciones del usuario (las de su ficha de residente), las mas recientes primero
 *     description: |
 *       Cualquier usuario autenticado ve las suyas (el usuario debe estar vinculado a un residente). Tipos:
 *       PROXIMO_VENCIMIENTO (recuerda la fecha limite), PROXIMA_MORA (se acerca el fin del periodo de
 *       gracia), OBLIGACION_VENCIDA, MORA_APLICADA (con el importe del recargo), DEUDA_CON_MORA
 *       (recordatorio mensual) y PAGO_REGISTRADO. Un mismo hecho no se avisa dos veces; cuando se registra
 *       un pago o cambia la deuda, los recordatorios se actualizan con el importe actual o dejan de
 *       estar vigentes si la deuda se pago. Cada aviso trae `expensaId` para consultar su detalle.
 *       ADMINISTRADOR y DIRECTORIO pueden ver las de otra persona con `copropietarioId`.
 *     tags: [Notificaciones]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: soloNoLeidas
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: historial
 *         description: "true incluye los avisos que ya dejaron de aplicar"
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: limite
 *         schema: { type: integer, default: 100, maximum: 300 }
 *       - in: query
 *         name: copropietarioId
 *         description: Solo ADMINISTRADOR y DIRECTORIO
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ notificaciones, noLeidas, total }" }
 *       401: { description: No autenticado }
 *       403: { description: Sin permisos para ver las de otra persona }
 */
router.get('/', autenticar, controller.listar)

/**
 * @openapi
 * /api/financiero/notificaciones/correos:
 *   get:
 *     summary: Registro de avisos por correo (para revisar los que no se pudieron enviar)
 *     description: |
 *       Cada aviso por correo (expensa generada o mora aplicada) deja constancia: ENVIADO, FALLIDO (correo
 *       invalido o error del servidor de correo) u OMITIDO (sin correo registrado, sin ocupantes o correo
 *       no configurado, o fuera de produccion sin bandeja de pruebas), con el motivo. Fuera de produccion
 *       los ENVIADO van a la bandeja de pruebas, no al residente. La expensa se genera igual aunque el
 *       correo falle y la campanita sigue disponible.
 *     tags: [Notificaciones]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [ENVIADO, FALLIDO, OMITIDO] }
 *       - in: query
 *         name: expensaId
 *         schema: { type: string }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer }
 *     responses:
 *       200: { description: "{ envios, paginacion }" }
 *       403: { description: Solo Administrador o Directorio }
 */
router.get('/correos', autenticar, SUPERVISION, controller.listarCorreos)

/**
 * @openapi
 * /api/financiero/notificaciones/correos/estado:
 *   get:
 *     summary: Estado del servicio de correo (si esta configurado y como se esta enviando)
 *     description: |
 *       Nunca devuelve valores de las variables de entorno, solo si estan y el nombre de las que faltan.
 *       `modo` indica a quien se escribe: PRODUCCION (a los residentes), REDIRIGIDO (fuera de produccion,
 *       todo va a una bandeja de pruebas con el destinatario real en el asunto) o BLOQUEADO (fuera de
 *       produccion y sin bandeja de pruebas: no se envia nada y los avisos quedan OMITIDOS).
 *       Con `verificar=true` (solo ADMINISTRADOR) tambien prueba la conexion y la autenticacion con el
 *       servidor de correo, sin enviar ningun correo.
 *     tags: [Notificaciones]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: verificar
 *         description: "true prueba la conexion con el servidor SMTP (solo Administrador)"
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200:
 *         description: |
 *           { configurado, faltan: [nombres de variables], modo }. Con verificar=true se agrega
 *           { conexion: "OK" | "ERROR", motivo? }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configurado: { type: boolean }
 *                 faltan: { type: array, items: { type: string }, example: ["SMTP_HOST", "SMTP_PASS"] }
 *                 modo: { type: string, enum: [PRODUCCION, REDIRIGIDO, BLOQUEADO] }
 *                 conexion: { type: string, enum: [OK, ERROR] }
 *                 motivo: { type: string }
 *       401: { description: No autenticado }
 *       403: { description: Solo Administrador o Directorio; verificar=true solo el Administrador }
 */
router.get('/correos/estado', autenticar, SUPERVISION, controller.estadoCorreo)

/**
 * @openapi
 * /api/financiero/notificaciones/marcar-leidas:
 *   post:
 *     summary: Marca todas las notificaciones del usuario como leidas
 *     tags: [Notificaciones]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ marcadas }" }
 */
router.post('/marcar-leidas', autenticar, controller.marcarTodasLeidas)

/**
 * @openapi
 * /api/financiero/notificaciones/{id}:
 *   get:
 *     summary: Detalle de una notificacion con la obligacion a la que se refiere
 *     description: |
 *       Devuelve el aviso y su `obligacion`: periodo, desglose (tarifa fija, baulera/parqueo y agua), mora,
 *       pagado y saldo pendiente. Al abrirla, su dueño la marca como leida.
 *     tags: [Notificaciones]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ notificacion, obligacion }" }
 *       404: { description: Notificacion no encontrada }
 */
router.get('/:id', autenticar, controller.obtenerDetalle)

/**
 * @openapi
 * /api/financiero/notificaciones/{id}/leida:
 *   patch:
 *     summary: Marca una notificacion como leida
 *     tags: [Notificaciones]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Notificacion marcada como leida }
 *       403: { description: Solo la persona a quien va dirigida puede marcarla }
 *       404: { description: Notificacion no encontrada }
 */
router.patch('/:id/leida', autenticar, controller.marcarLeida)

module.exports = router
