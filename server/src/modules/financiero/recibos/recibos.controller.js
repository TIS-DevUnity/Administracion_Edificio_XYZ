const service = require('./recibos.service')
const { generarReciboPdf } = require('./recibo-pdf.service')

async function obtener(req, res, next) {
  try {
    res.json(await service.obtener(req.params.id))
  } catch (err) {
    next(err)
  }
}

async function adjuntarComprobante(req, res, next) {
  try {
    const resultado = await service.adjuntarComprobante(req.params.id, {
      archivo: req.file,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function obtenerComprobante(req, res, next) {
  try {
    res.json(await service.obtenerEnlaceComprobante(req.params.id))
  } catch (err) {
    next(err)
  }
}

async function descargarPdf(req, res, next) {
  try {
    const datos = await service.datosParaPdf(req.params.id)
    const pdf = await generarReciboPdf(datos)
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': `inline; filename="recibo-${datos.folio}.pdf"`,
      'Cache-Control': 'private, no-store'
    })
    res.send(pdf)
  } catch (err) {
    next(err)
  }
}

module.exports = { obtener, adjuntarComprobante, obtenerComprobante, descargarPdf }
