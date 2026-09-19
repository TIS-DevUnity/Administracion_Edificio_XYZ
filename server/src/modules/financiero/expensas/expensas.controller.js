const service = require('./expensas.service')

async function generar(req, res, next) {
  try {
    const { inmuebleId, periodo, fechaVencimiento } = req.body
    if (!inmuebleId || !periodo || !fechaVencimiento) {
      return res.status(400).json({
        error: 'inmuebleId, periodo y fechaVencimiento son requeridos'
      })
    }
    const expensa = await service.generar({ inmuebleId, periodo, fechaVencimiento })
    res.status(201).json(expensa)
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    const expensas = await service.listar()
    res.json(expensas)
  } catch (err) {
    next(err)
  }
}

async function aplicarMora(req, res, next) {
  try {
    const { id } = req.params
    const resultado = await service.aplicarMora(id)
    res.json(resultado)
  } catch (err) {
    next(err)
  }
}

module.exports = { generar, listar, aplicarMora }
