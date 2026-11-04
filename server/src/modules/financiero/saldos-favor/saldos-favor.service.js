/**
 * SALDOS A FAVOR: listado de todos los inmuebles que tienen saldo a favor (por pagos anticipados o
 * excesos de pago) y cuanto les queda por descontar de sus proximas expensas.
 *
 * Reemplaza pedir el saldo de cada departamento uno por uno: son tres consultas agrupadas sin
 * importar cuantos inmuebles haya. El saldo se calcula igual que `saldoFavorDe` (suma de abonos y
 * usos del libro `movimientos_saldo`); no existe un saldo guardado.
 */
const prisma = require('../../../config/prisma')
const { filtroOcupanteVigente } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const { armarSaldosFavor, totalSaldosFavor } = require('./saldos-favor.util')

async function listar() {
  const saldos = await prisma.movimientoSaldo.groupBy({
    by: ['inmuebleId'],
    _sum: { monto: true },
    having: { monto: { _sum: { gt: 0 } } }
  })
  const inmuebleIds = saldos.map((saldo) => saldo.inmuebleId)

  const [abonos, usos, inmuebles] = await Promise.all([
    prisma.movimientoSaldo.groupBy({
      by: ['inmuebleId'],
      where: { inmuebleId: { in: inmuebleIds }, monto: { gt: 0 } },
      _sum: { monto: true },
      _max: { createdAt: true }
    }),
    prisma.movimientoSaldo.groupBy({
      by: ['inmuebleId'],
      where: { inmuebleId: { in: inmuebleIds }, monto: { lt: 0 } },
      _sum: { monto: true }
    }),
    prisma.inmueble.findMany({
      where: { id: { in: inmuebleIds } },
      select: {
        id: true,
        codigo: true,
        piso: true,
        clase: true,
        ocupaciones: {
          where: filtroOcupanteVigente(new Date()),
          select: {
            esPropietario: true,
            fechaInicio: true,
            copropietario: { select: { id: true, nombre: true, apellido: true, ci: true, email: true, telefono: true } }
          }
        }
      }
    })
  ])

  const filas = armarSaldosFavor({ saldos, abonos, usos, inmuebles })
  return {
    resumen: { cantidad: filas.length, totalSaldoFavor: totalSaldosFavor(filas) },
    saldos: filas
  }
}

module.exports = { listar }
