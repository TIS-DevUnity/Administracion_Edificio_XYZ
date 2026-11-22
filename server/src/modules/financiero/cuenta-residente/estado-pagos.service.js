const prisma = require('../../../config/prisma')
const cargosUtil = require('../expensas/cargos.util')
const { saldoFavorDe } = require('../expensas/saldo.util')
const { evaluarEstadoPagos, normalizarHoy } = require('./estado-pagos.util')

/**
 * Indica si un copropietario esta al dia con sus pagos (requisito para reservar areas comunes).
 * Solo lectura. `hoy` (YYYY-MM-DD o Date) es opcional y sirve para probar; por defecto, hoy en Bolivia.
 * Devuelve { alDia, deudaVencida, detalle: [{ concepto, periodo, monto, vencimiento }] }.
 * Las reglas estan en estado-pagos.util.js.
 */
async function estaAlDia(copropietarioId, { hoy } = {}) {
  const dia = normalizarHoy(hoy)
  const aCargo = await cargosUtil.departamentosACargo(prisma, copropietarioId, new Date())

  const departamentos = []
  for (const departamento of aCargo) {
    const [expensas, cuotas, saldoFavor] = await Promise.all([
      prisma.expensa.findMany({
        where: { inmuebleId: departamento.id, planPagoId: null, estado: { not: 'PAGADA' } },
        include: { pagos: true }
      }),
      prisma.cuotaPlan.findMany({
        where: { estado: { not: 'PAGADA' }, plan: { inmuebleId: departamento.id, estado: 'ACTIVO' } }
      }),
      saldoFavorDe(prisma, departamento.id)
    ])
    departamentos.push({ inmuebleId: departamento.id, codigo: departamento.codigo, expensas, cuotas, saldoFavor })
  }

  return evaluarEstadoPagos({ departamentos, hoy: dia })
}

module.exports = { estaAlDia }
