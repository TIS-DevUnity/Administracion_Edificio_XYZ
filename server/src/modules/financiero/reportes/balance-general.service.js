const prisma = require('../../../config/prisma')
const saldoEdificio = require('../saldo-edificio/saldo-edificio.service')
const { fechaEnZona } = require('../expensas/mora.util')
const { registrarGeneracion, usuarioGenerador } = require('./registro-generacion.service')
const util = require('./balance-general.util')
const { generarBalanceGeneralPdf, nombreArchivoBalanceGeneral } = require('./balance-general-pdf.service')
const { generarBalanceGeneralExcel, nombreArchivoBalanceGeneralExcel } = require('./balance-general-excel.service')

/**
 * Consulta (solo lectura) y arma el balance a la fecha de emision. La vista previa JSON y el PDF salen de esta
 * misma funcion. El saldo, lo que deben los residentes y el saldo a favor vienen de saldo-edificio, asi el balance
 * coincide con esa pantalla; los anticipos y las nominas pendientes se leen aqui.
 *
 * `hasta` (opcional, YYYY-MM-DD, no futura en hora de Bolivia) es la fecha de corte: solo el efectivo se calcula a
 * esa fecha. Cuentas por cobrar, anticipos, saldos a favor y sueldos por pagar siguen a la fecha de emision porque
 * no hay historial de esos saldos. Sin `hasta` el balance es el de siempre. Se valida antes de consultar la base.
 */
async function balanceGeneral({ hasta, usuarioId } = {}) {
  const generadoEn = new Date()
  const fechaCorte = util.validarFechaCorte(hasta, fechaEnZona(generadoEn))
  const [saldo, anticipos, nominas, generadoPor] = await Promise.all([
    saldoEdificio.obtener({ ...(fechaCorte ? { hasta: fechaCorte } : {}), porPagina: 1 }),
    prisma.anticipoSalarial.findMany({
      where: { estado: { in: ['PENDIENTE', 'PARCIAL'] } },
      select: { monto: true, montoDescontado: true }
    }),
    prisma.nomina.aggregate({ where: { estado: 'PENDIENTE' }, _sum: { sueldoNeto: true }, _count: { _all: true } }),
    usuarioGenerador(usuarioId)
  ])

  return util.construirBalanceGeneral({
    efectivo: saldo.saldoActual,
    cuentasPorCobrar: { monto: saldo.pendienteDeCobro.deudaPendienteDeCobro, cantidad: saldo.pendienteDeCobro.expensasPendientes },
    anticiposPendientes: util.anticiposPendientes(anticipos),
    saldosAFavor: saldo.pendienteDeCobro.saldoAFavorDeResidentes,
    sueldosPorPagar: { monto: nominas._sum.sueldoNeto ?? 0, cantidad: nominas._count._all },
    fechaCorte,
    generadoPor,
    generadoEn
  })
}

/** Genera el balance en `formato` ("JSON", "PDF" o "EXCEL") y lo registra. Devuelve { datos } o { datos, archivo, nombreArchivo }. */
async function generar({ formato, hasta, usuarioId, ip }) {
  const usoHasta = !(hasta === undefined || hasta === null || (typeof hasta === 'string' && hasta.trim() === ''))
  try {
    const datos = await balanceGeneral({ hasta, usuarioId })
    const salida =
      formato === 'PDF'
        ? { datos, archivo: await generarBalanceGeneralPdf(datos), nombreArchivo: nombreArchivoBalanceGeneral(datos) }
        : formato === 'EXCEL'
          ? { datos, archivo: await generarBalanceGeneralExcel(datos), nombreArchivo: nombreArchivoBalanceGeneralExcel(datos) }
          : { datos }
    await registrarGeneracion({ tipo: util.TIPO_REPORTE, usuarioId, ip, desde: datos.fechaCorte, hasta: datos.fechaCorte, formato, extra: { fechaCorte: datos.fechaCorte, usoHasta } })
    return salida
  } catch (err) {
    await registrarGeneracion({
      tipo: util.TIPO_REPORTE,
      usuarioId,
      ip,
      ...(usoHasta ? { desde: String(hasta), hasta: String(hasta) } : {}),
      formato,
      extra: { usoHasta },
      error: err
    })
    throw err
  }
}

module.exports = { balanceGeneral, generar }
