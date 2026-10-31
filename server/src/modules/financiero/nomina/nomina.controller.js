const service = require('./nomina.service')

async function generar(req, res, next) {
  try {
    const resultado = await service.generar({ periodo: req.body?.periodo, usuarioId: req.usuario.id, ip: req.ip })
    res.status(resultado.creadas > 0 ? 201 : 200).json({
      ...resultado,
      mensaje:
        resultado.creadas > 0
          ? `Nomina de ${resultado.periodo} generada: ${resultado.creadas} creada(s), ${resultado.omitidas} omitida(s)`
          : `No habia nominas nuevas que generar para ${resultado.periodo}`
    })
  } catch (err) {
    next(err)
  }
}

async function listar(req, res, next) {
  try {
    const { periodo, estado, q, pagina, porPagina } = req.query
    res.json(await service.listar({ periodo, estado, q, pagina, porPagina }))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    res.json(await service.obtener(req.params.id))
  } catch (err) {
    next(err)
  }
}

async function agregarConcepto(req, res, next) {
  try {
    const resultado = await service.agregarConcepto(req.params.id, {
      datos: req.body ?? {},
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.status(201).json({ ...resultado, mensaje: 'Concepto agregado y sueldo neto recalculado' })
  } catch (err) {
    next(err)
  }
}

async function editarConcepto(req, res, next) {
  try {
    const resultado = await service.editarConcepto(req.params.id, req.params.conceptoId, {
      datos: req.body ?? {},
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.json({ ...resultado, mensaje: 'Concepto actualizado y sueldo neto recalculado' })
  } catch (err) {
    next(err)
  }
}

async function quitarConcepto(req, res, next) {
  try {
    const resultado = await service.quitarConcepto(req.params.id, req.params.conceptoId, {
      usuarioId: req.usuario.id,
      ip: req.ip
    })
    res.json({ ...resultado, mensaje: 'Concepto quitado y sueldo neto recalculado' })
  } catch (err) {
    next(err)
  }
}

async function pagar(req, res, next) {
  try {
    const resultado = await service.pagar(req.params.id, { datos: req.body ?? {}, usuarioId: req.usuario.id, ip: req.ip })
    res.json({ ...resultado, mensaje: 'Pago de nomina confirmado' })
  } catch (err) {
    next(err)
  }
}

module.exports = { generar, listar, obtener, agregarConcepto, editarConcepto, quitarConcepto, pagar }
