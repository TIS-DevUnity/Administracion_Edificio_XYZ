const service = require('./agua.service')

async function registrar(req, res, next) {
  try {
    const { periodo, montoFactura } = req.body
    if (!periodo || montoFactura === undefined) {
      return res.status(400).json({ error: 'periodo y montoFactura son requeridos' })
    }
    const resultado = await service.registrar({
      periodo,
      montoFactura,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json(resultado)
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    res.json({ facturas: await service.listar() })
  } catch (err) {
    next(err)
  }
}

async function obtenerPorPeriodo(req, res, next) {
  try {
    res.json(await service.obtenerPorPeriodo(req.params.periodo))
  } catch (err) {
    next(err)
  }
}

module.exports = { registrar, listar, obtenerPorPeriodo }
