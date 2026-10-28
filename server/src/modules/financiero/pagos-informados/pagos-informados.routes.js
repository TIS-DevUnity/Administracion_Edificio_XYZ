const { Router } = require('express')
const multer = require('multer')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./pagos-informados.controller')
const { MENSAJE_FORMATOS, MAX_COMPROBANTE_BYTES } = require('../recibos/recibos.service')

const router = Router()

// Informa el copropietario (rol CONSULTA, solo de sus inmuebles); confirma o rechaza el administrador.
const INFORMAR = autorizar('CONSULTA')
const GESTION = autorizar('ADMINISTRADOR')
const LECTURA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

// Solo imagenes; el contenido real se vuelve a verificar en el servicio.
const subirImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COMPROBANTE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const permitido = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    cb(permitido ? null : Object.assign(new Error(MENSAJE_FORMATOS), { status: 400 }), permitido)
  }
}).single('archivo')

/** Traduce los errores de multer a mensajes claros (el archivo demasiado grande, etc). */
function recibirComprobante(req, res, next) {
  subirImagen(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      return next(Object.assign(new Error(MENSAJE_FORMATOS), { status: 400 }))
    }
    next(err)
  })
}

/**
 * @openapi
 * /api/financiero/pagos-informados:
 *   post:
 *     summary: El copropietario (rol CONSULTA) informa un pago de su expensa hecho fuera del sistema
 *     description: |
 *       No cobra nada por si solo: el aviso queda PENDIENTE hasta que el administrador lo confirme. Solo se
 *       puede informar un pago del departamento que el usuario ocupa. `multipart/form-data`; el comprobante
 *       (JPG, PNG o WEBP, max 5MB, campo `archivo`) es opcional. Con la cabecera `Idempotency-Key`, reenviar la
 *       misma solicitud no crea otro aviso (responde 200 con `duplicado: true`).
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [inmuebleId, monto, metodoPago, fechaPago]
 *             properties:
 *               inmuebleId: { type: string }
 *               monto: { type: number }
 *               metodoPago: { type: string, enum: [EFECTIVO, TRANSFERENCIA, TARJETA, CHEQUE] }
 *               referencia: { type: string }
 *               fechaPago: { type: string, description: YYYY-MM-DD, no futura }
 *               archivo: { type: string, format: binary }
 *     responses:
 *       201: { description: Pago informado }
 *       400: { description: Datos invalidos }
 *       403: { description: No es un inmueble del usuario, o el usuario no esta vinculado a un copropietario }
 *   get:
 *     summary: Lista los pagos informados (CONSULTA solo ve los de sus inmuebles)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [PENDIENTE, CONFIRMADO, RECHAZADO] }
 *       - in: query
 *         name: inmuebleId
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ pagos: [...] }" }
 */
router.post('/', autenticar, INFORMAR, recibirComprobante, controller.informar)
router.get('/', autenticar, LECTURA, controller.listar)

/**
 * @openapi
 * /api/financiero/pagos-informados/{id}:
 *   get:
 *     summary: Detalle de un pago informado (CONSULTA solo si es de su inmueble; si no, 403)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ pago }" }
 *       403: { description: No es de un inmueble del usuario }
 *       404: { description: No encontrado }
 */
router.get('/:id', autenticar, LECTURA, controller.obtener)

/**
 * @openapi
 * /api/financiero/pagos-informados/{id}/comprobante:
 *   get:
 *     summary: Enlace temporal (5 min) a la foto del comprobante del pago informado
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ nombre, mimeType, url, venceEnSegundos }" }
 *       403: { description: No es de un inmueble del usuario }
 *       404: { description: No encontrado o sin comprobante }
 */
router.get('/:id/comprobante', autenticar, LECTURA, controller.obtenerComprobante)

/**
 * @openapi
 * /api/financiero/pagos-informados/{id}/confirmar:
 *   post:
 *     summary: El administrador confirma el pago informado
 *     description: |
 *       Registra el pago normal del inmueble (con su recibo, orden de meses y mora primero) y el aviso queda
 *       CONFIRMADO. Si el pago no se puede registrar (por ejemplo un mes atrasado que se debe pagar completo) responde
 *       el error de siempre y el aviso sigue PENDIENTE. `cuentaId` (opcional) indica la caja o cuenta que recibio el dinero.
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cuentaId: { type: string }
 *     responses:
 *       200: { description: "{ pago, recibo }" }
 *       409: { description: El aviso ya fue revisado, o el pago no cumple las reglas de pago }
 */
router.post('/:id/confirmar', autenticar, GESTION, controller.confirmar)

/**
 * @openapi
 * /api/financiero/pagos-informados/{id}/rechazar:
 *   post:
 *     summary: El administrador rechaza el pago informado
 *     tags: [Financiero]
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
 *             required: [motivo]
 *             properties:
 *               motivo: { type: string }
 *     responses:
 *       200: { description: "{ pago }" }
 *       400: { description: Falta el motivo }
 *       409: { description: El aviso ya fue revisado }
 */
router.post('/:id/rechazar', autenticar, GESTION, controller.rechazar)

module.exports = router
