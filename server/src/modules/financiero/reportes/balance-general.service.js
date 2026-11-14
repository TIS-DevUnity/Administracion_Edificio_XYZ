const prisma = require('../../../config/prisma')
const saldoEdificio = require('../saldo-edificio/saldo-edificio.service')
const { registrarGeneracion, usuarioGenerador } = require('./registro-generacion.service')
const util = require('./balance-general.util')
const { generarBalanceGeneralPdf, nombreArchivoBalanceGeneral } = require('./balance-general-pdf.service')
const { generarBalanceGeneralExcel, nombreArchivoBalanceGeneralExcel } = require('./balance-general-excel.service')

/**
 * Consulta (solo lectura) y arma el balance a la fecha de emision. La vista previa JSON y el PDF salen de esta
 * misma funcion. El saldo, lo que deben los residentes y el saldo a favor vienen de saldo-edificio, asi el balance
 * coincide con esa pantalla; los anticipos y las nominas pendientes se leen aqui.
 */
async function balanceGeneral({ usuarioId } = {}) {
  const generadoEn = new Date()
  const [saldo, anticipos, nominas, generadoPor] = await Promise.all([
    saldoEdificio.obtener({ porPagina: 1 }),
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
    generadoPor,
    generadoEn
  })
}

/** Genera el balance en `formato` ("JSON", "PDF" o "EXCEL") y lo registra. Devuelve { datos } o { datos, archivo, nombreArchivo }. */
async function generar({ formato, usuarioId, ip }) {
  try {
    const datos = await balanceGeneral({ usuarioId })
    const salida =
      formato === 'PDF'
        ? { datos, archivo: await generarBalanceGeneralPdf(datos), nombreArchivo: nombreArchivoBalanceGeneral(datos) }
        : formato === 'EXCEL'
          ? { datos, archivo: await generarBalanceGeneralExcel(datos), nombreArchivo: nombreArchivoBalanceGeneralExcel(datos) }
          : { datos }
    await registrarGeneracion({ tipo: util.TIPO_REPORTE, usuarioId, ip, desde: datos.fechaCorte, hasta: datos.fechaCorte, formato, extra: { fechaCorte: datos.fechaCorte } })
    return salida
  } catch (err) {
    await registrarGeneracion({ tipo: util.TIPO_REPORTE, usuarioId, ip, formato, error: err })
    throw err
  }
}

module.exports = { balanceGeneral, generar }
