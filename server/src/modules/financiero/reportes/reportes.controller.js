const service = require('./morosos.service')
const flujoCaja = require('./flujo-caja.service')
const balanceGeneral = require('./balance-general.service')
const { enviarPdf } = require('../nomina/pdf-comun.util')
const { enviarExcel } = require('./excel-comun.util')

async function morosos(req, res, next) {
  try {
    const { desde, hasta, orden } = req.query
    const { datos } = await service.generar({ formato: 'JSON', desde, hasta, orden, usuarioId: req.usuario.id, ip: req.ip })
    res.json(datos)
  } catch (err) {
    next(err)
  }
}

async function morososPdf(req, res, next) {
  try {
    const { desde, hasta, orden } = req.query
    const { archivo, nombreArchivo } = await service.generar({ formato: 'PDF', desde, hasta, orden, usuarioId: req.usuario.id, ip: req.ip })
    enviarPdf(res, archivo, nombreArchivo, req.query.inline === 'true')
  } catch (err) {
    next(err)
  }
}

async function flujoCajaJson(req, res, next) {
  try {
    const { desde, hasta, tipo } = req.query
    const { datos } = await flujoCaja.generar({ formato: 'JSON', desde, hasta, tipo, usuarioId: req.usuario.id, ip: req.ip })
    res.json(datos)
  } catch (err) {
    next(err)
  }
}

async function flujoCajaPdf(req, res, next) {
  try {
    const { desde, hasta, tipo } = req.query
    const { archivo, nombreArchivo } = await flujoCaja.generar({ formato: 'PDF', desde, hasta, tipo, usuarioId: req.usuario.id, ip: req.ip })
    enviarPdf(res, archivo, nombreArchivo, req.query.inline === 'true')
  } catch (err) {
    next(err)
  }
}

async function balanceGeneralJson(req, res, next) {
  try {
    const { datos } = await balanceGeneral.generar({ formato: 'JSON', usuarioId: req.usuario.id, ip: req.ip })
    res.json(datos)
  } catch (err) {
    next(err)
  }
}

async function balanceGeneralPdf(req, res, next) {
  try {
    const { archivo, nombreArchivo } = await balanceGeneral.generar({ formato: 'PDF', usuarioId: req.usuario.id, ip: req.ip })
    enviarPdf(res, archivo, nombreArchivo, req.query.inline === 'true')
  } catch (err) {
    next(err)
  }
}

async function morososExcel(req, res, next) {
  try {
    const { desde, hasta, orden } = req.query
    const { archivo, nombreArchivo } = await service.generar({ formato: 'EXCEL', desde, hasta, orden, usuarioId: req.usuario.id, ip: req.ip })
    enviarExcel(res, archivo, nombreArchivo)
  } catch (err) {
    next(err)
  }
}

async function flujoCajaExcel(req, res, next) {
  try {
    const { desde, hasta, tipo } = req.query
    const { archivo, nombreArchivo } = await flujoCaja.generar({ formato: 'EXCEL', desde, hasta, tipo, usuarioId: req.usuario.id, ip: req.ip })
    enviarExcel(res, archivo, nombreArchivo)
  } catch (err) {
    next(err)
  }
}

async function balanceGeneralExcel(req, res, next) {
  try {
    const { archivo, nombreArchivo } = await balanceGeneral.generar({ formato: 'EXCEL', usuarioId: req.usuario.id, ip: req.ip })
    enviarExcel(res, archivo, nombreArchivo)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  morosos,
  morososPdf,
  morososExcel,
  flujoCajaJson,
  flujoCajaPdf,
  flujoCajaExcel,
  balanceGeneralJson,
  balanceGeneralPdf,
  balanceGeneralExcel
}
