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
    const { diaGeneracion, diaVencimiento, diasGracia, tipoValor, valor, modoMora, vigenteDesde } = req.body
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
    const config = await service.crear({
      diaGeneracion,
      diaVencimiento,
      diasGracia,
      tipoValor,
      valor,
      modoMora: modoMora || undefined,
      vigenteDesde: vigenteDesde || undefined,
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json(config)
  } catch (err) {
    next(err)
  }
}

module.exports = { obtenerVigente, listarHistorial, crear }
