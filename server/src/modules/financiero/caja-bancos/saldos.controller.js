const service = require('./saldos.service')

async function obtenerSaldos(req, res, next) {
  try {
    res.json(await service.obtenerSaldos(req.params.periodo, { cuentaId: req.query.cuentaId }))
  } catch (err) {
    next(err)
  }
}

async function guardarSaldoReal(req, res, next) {
  try {
    const { saldoReal, observacion } = req.body ?? {}
    const saldo = await service.guardarSaldoReal(
      req.params.periodo,
      req.params.cuentaId,
      { saldoReal, observacion },
      { usuarioId: req.usuario.id }
    )
    res.json({ saldo, mensaje: 'Saldo real guardado correctamente' })
  } catch (err) {
    next(err)
  }
}

async function revisarDiferencia(req, res, next) {
  try {
    const saldo = await service.revisarDiferencia(
      req.params.periodo,
      req.params.cuentaId,
      { observacion: (req.body ?? {}).observacion },
      { usuarioId: req.usuario.id }
    )
    res.json({ saldo, mensaje: 'Diferencia revisada correctamente' })
  } catch (err) {
    next(err)
  }
}

async function resumen(req, res, next) {
  try {
    res.json(await service.resumenPeriodo(req.params.periodo, { cuentaId: req.query.cuentaId }))
  } catch (err) {
    next(err)
  }
}

module.exports = { obtenerSaldos, guardarSaldoReal, revisarDiferencia, resumen }
