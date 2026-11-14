const prisma = require('../../../config/prisma')
const saldoEdificio = require('../saldo-edificio/saldo-edificio.service')
const { registrarGeneracion, usuarioGenerador } = require('./registro-generacion.service')
const { validarRango } = require('./morosos.util')
const util = require('./flujo-caja.util')
const { generarFlujoCajaPdf, nombreArchivoFlujoCaja } = require('./flujo-caja-pdf.service')

/**
 * Consulta (solo lectura) y arma el flujo de caja. La vista previa JSON y el PDF salen de esta misma funcion.
 * Lee las mismas fuentes y aplica los mismos filtros de fecha que saldo-edificio (recibos e instantes en hora de
 * Bolivia, UTC-4; movimientos y anticipos por dia), sin depender de CAJA_BANCOS_ASIENTOS.
 */
async function flujoCaja({ desde, hasta, tipo, usuarioId } = {}) {
  const rango = validarRango({ desde, hasta })
  util.validarTipo(tipo)
  const generadoEn = new Date()

  const instantes = {
    gte: new Date(`${rango.desde}T00:00:00.000-04:00`),
    lte: new Date(`${rango.hasta}T23:59:59.999-04:00`)
  }
  const dias = { gte: new Date(`${rango.desde}T00:00:00Z`), lte: new Date(`${rango.hasta}T00:00:00Z`) }

  const [recibos, extraordinarios, nominas, anticipos, inicial, alCierre, generadoPor] = await Promise.all([
    prisma.recibo.findMany({
      where: { fechaPago: instantes },
      select: {
        id: true,
        montoTotal: true,
        fechaPago: true,
        inmueble: { select: { codigo: true } },
        pagos: { select: { expensa: { select: { periodo: true } } } }
      }
    }),
    prisma.movimientoFinanciero.findMany({
      where: { fecha: dias },
      select: { id: true, tipo: true, monto: true, fecha: true, concepto: true, createdAt: true, categoria: { select: { nombre: true } } }
    }),
    prisma.nomina.findMany({
      where: { estado: 'PAGADA', montoPagado: { gt: 0 }, fechaPago: instantes },
      include: { empleado: { select: { nombres: true, apellidos: true } } }
    }),
    prisma.anticipoSalarial.findMany({
      where: { fecha: dias },
      include: { empleado: { select: { nombres: true, apellidos: true } } }
    }),
    saldoEdificio.obtener({ hasta: util.diaAnterior(rango.desde), porPagina: 1 }),
    saldoEdificio.obtener({ hasta: rango.hasta, porPagina: 1 }),
    usuarioGenerador(usuarioId)
  ])

  return util.construirFlujoCaja({
    ...rango,
    tipo,
    saldoInicial: inicial.saldoActual,
    saldoEdificioAlCierre: alCierre.saldoActual,
    recibos,
    extraordinarios,
    nominas,
    anticipos,
    generadoPor,
    generadoEn
  })
}

/** Genera el flujo de caja en `formato` ("JSON" o "PDF") y lo registra. Devuelve { datos } o { datos, pdf, nombreArchivo }. */
async function generar({ formato, desde, hasta, tipo, usuarioId, ip }) {
  try {
    const datos = await flujoCaja({ desde, hasta, tipo, usuarioId })
    const salida = formato === 'PDF' ? { datos, pdf: await generarFlujoCajaPdf(datos), nombreArchivo: nombreArchivoFlujoCaja(datos) } : { datos }
    await registrarGeneracion({ tipo: util.TIPO_REPORTE, usuarioId, ip, desde: datos.rango.desde, hasta: datos.rango.hasta, formato, extra: { filtroTipo: datos.tipo } })
    return salida
  } catch (err) {
    await registrarGeneracion({ tipo: util.TIPO_REPORTE, usuarioId, ip, desde, hasta, formato, extra: { filtroTipo: tipo ?? null }, error: err })
    throw err
  }
}

module.exports = { flujoCaja, generar }
