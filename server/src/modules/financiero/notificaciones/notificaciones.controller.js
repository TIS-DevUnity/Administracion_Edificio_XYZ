const campanita = require('./campanita.service')
const notificaciones = require('./notificaciones.service')

async function listar(req, res, next) {
  try {
    const { soloNoLeidas, historial, limite, copropietarioId } = req.query
    res.json(await campanita.listar(req.usuario, { soloNoLeidas, historial, limite, copropietarioId }))
  } catch (err) {
    next(err)
  }
}

async function obtenerDetalle(req, res, next) {
  try {
    res.json(await campanita.obtenerDetalle(req.usuario, req.params.id))
  } catch (err) {
    next(err)
  }
}

async function marcarLeida(req, res, next) {
  try {
    res.json({ notificacion: await campanita.marcarLeida(req.usuario, req.params.id) })
  } catch (err) {
    next(err)
  }
}

async function marcarTodasLeidas(req, res, next) {
  try {
    res.json(await campanita.marcarTodasLeidas(req.usuario))
  } catch (err) {
    next(err)
  }
}

async function listarCorreos(req, res, next) {
  try {
    const { estado, expensaId, pagina, porPagina } = req.query
    res.json(await notificaciones.listarEnvios({ estado, expensaId, pagina, porPagina }))
  } catch (err) {
    next(err)
  }
}

/**
 * Estado del servicio de correo. Solo el ADMINISTRADOR puede pedir `verificar=true` (prueba la
 * conexion con el servidor SMTP, sin enviar ningun correo); el resto solo ve si esta configurado.
 */
async function estadoCorreo(req, res, next) {
  try {
    const verificar = req.query.verificar === 'true'
    if (verificar && req.usuario.rol !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el Administrador puede verificar la conexion con el servidor de correo' })
    }
    res.json(await notificaciones.estadoCorreo({ verificar }))
  } catch (err) {
    next(err)
  }
}

module.exports = { listar, obtenerDetalle, marcarLeida, marcarTodasLeidas, listarCorreos, estadoCorreo }
