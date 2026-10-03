const { Router } = require('express')
const multer = require('multer')
const { autenticar } = require('../../../middlewares/auth.middleware')
const { autorizar } = require('../../../middlewares/rbac.middleware')
const controller = require('./recibos.controller')
const { MENSAJE_FORMATOS, MAX_COMPROBANTE_BYTES } = require('./recibos.service')

const router = Router()

const GESTION = autorizar('ADMINISTRADOR')
const CONSULTA = autorizar('ADMINISTRADOR', 'DIRECTORIO', 'CONSULTA')

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
 * /api/financiero/recibos/{id}:
 *   get:
 *     summary: Detalle de un recibo - folio, monto, a que expensas se aplico y saldo a favor generado
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Detalle del recibo }
 *       404: { description: Recibo no encontrado }
 */
router.get('/:id', autenticar, CONSULTA, controller.obtener)

/**
 * @openapi
 * /api/financiero/recibos/{id}/pdf:
 *   get:
 *     summary: Descarga el recibo en PDF (inmueble, monto, fecha, metodo, estado y folio)
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF del recibo
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       404: { description: Recibo no encontrado }
 */
router.get('/:id/pdf', autenticar, CONSULTA, controller.descargarPdf)

/**
 * @openapi
 * /api/financiero/recibos/{id}/comprobante:
 *   post:
 *     summary: Adjunta la foto del comprobante de pago a un recibo (si ya tenia una, la reemplaza)
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [archivo]
 *             properties:
 *               archivo: { type: string, format: binary, description: "JPG, PNG o WEBP, maximo 5MB" }
 *     responses:
 *       201: { description: Comprobante adjuntado }
 *       400: { description: "Falta el archivo o el formato no es valido (acepta JPG, PNG o WEBP de hasta 5MB)" }
 *       404: { description: Recibo no encontrado }
 *   get:
 *     summary: Enlace temporal (5 minutos) para ver la foto del comprobante
 *     tags: [Financiero]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Enlace firmado, nombre y tipo del archivo }
 *       404: { description: Recibo no encontrado o sin comprobante adjunto }
 */
router.post('/:id/comprobante', autenticar, GESTION, recibirComprobante, controller.adjuntarComprobante)
router.get('/:id/comprobante', autenticar, CONSULTA, controller.obtenerComprobante)

module.exports = router
