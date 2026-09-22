const service = require('./configuracion-mora.service')

async function obtenerVigente(req, res, next) {
  try {
    const config = await service.obtenerVigente()
    res.json(config)
  } catch (err) {
    next(err)
  }
}

async function listarHistorial(req, res, next) {
  try {
    const historial = await service.listarHistorial()
    res.json(historial)
  } catch (err) {
    next(err)
  }
}

async function crear(req, res, next) {
  try {
    const { diaGeneracion, diasGracia, tipoValor, valor } = req.body
    if (
      diaGeneracion === undefined ||
      diasGracia === undefined ||
      !tipoValor ||
      valor === undefined
    ) {
      return res.status(400).json({
        error: 'diaGeneracion, diasGracia, tipoValor y valor son requeridos'
      })
    }
    const config = await service.crear({ diaGeneracion, diasGracia, tipoValor, valor })
    res.status(201).json(config)
  } catch (err) {
    next(err)
  }
}

module.exports = { obtenerVigente, listarHistorial, crear }
