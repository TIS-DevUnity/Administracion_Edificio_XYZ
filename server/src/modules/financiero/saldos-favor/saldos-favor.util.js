/**
 * Arma el listado de saldos a favor a partir de lo que devuelve la base. Son funciones puras:
 * no tocan la base de datos.
 */
const { Decimal } = require('../expensas/saldo.util')

const CERO = new Decimal(0)

function indexarPor(filas, clave) {
  return new Map(filas.map((fila) => [fila[clave], fila]))
}

/** Persona responsable del inmueble hoy: el propietario vigente; si no hay, el inquilino. */
function responsableDe(ocupaciones) {
  const ordenadas = [...ocupaciones].sort(
    (a, b) => Number(b.esPropietario) - Number(a.esPropietario) || new Date(a.fechaInicio) - new Date(b.fechaInicio)
  )
  const ocupante = ordenadas[0]
  if (!ocupante) return null
  const { id, nombre, apellido, ci, email, telefono } = ocupante.copropietario
  return { id, nombre, apellido, ci, email, telefono, esPropietario: ocupante.esPropietario }
}

/**
 * - `saldos`: una fila por inmueble con saldo a favor, `{ inmuebleId, _sum: { monto } }`.
 * - `abonos`: lo que cada inmueble entrego por adelantado, `{ inmuebleId, _sum: { monto }, _max: { createdAt } }`.
 * - `usos`: lo que ya se descontó de sus expensas, `{ inmuebleId, _sum: { monto } }` (negativo).
 * - `inmuebles`: datos de cada inmueble, con sus ocupaciones vigentes.
 * Ordenado por código de inmueble.
 */
function armarSaldosFavor({ saldos, abonos, usos, inmuebles }) {
  const abonoPorInmueble = indexarPor(abonos, 'inmuebleId')
  const usoPorInmueble = indexarPor(usos, 'inmuebleId')
  const inmueblePorId = indexarPor(inmuebles, 'id')

  return saldos
    .map((saldo) => {
      const inmueble = inmueblePorId.get(saldo.inmuebleId)
      if (!inmueble) return null
      const abono = abonoPorInmueble.get(saldo.inmuebleId)
      const uso = usoPorInmueble.get(saldo.inmuebleId)

      return {
        inmuebleId: inmueble.id,
        codigo: inmueble.codigo,
        piso: inmueble.piso,
        clase: inmueble.clase,
        responsable: responsableDe(inmueble.ocupaciones),
        saldoFavor: new Decimal(saldo._sum.monto ?? 0).toFixed(2),
        totalAbonado: new Decimal(abono?._sum.monto ?? 0).toFixed(2),
        totalAplicado: new Decimal(uso?._sum.monto ?? 0).abs().toFixed(2),
        ultimoAbono: abono?._max.createdAt ?? null
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
}

function totalSaldosFavor(filas) {
  return filas.reduce((suma, fila) => suma.plus(fila.saldoFavor), CERO).toFixed(2)
}

module.exports = { armarSaldosFavor, totalSaldosFavor, responsableDe }
