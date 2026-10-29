/**
 * CARGOS POR CONCEPTO de una expensa.
 *
 * La expensa de un departamento suma, ademas de la cuota fija de su tipo, la cuota de cada
 * baulera y parqueo que paga la persona responsable:
 *  - Solo se cobran los que estan activos y tienen un ocupante vigente que es esa persona.
 *  - El monto es el `cuotaMensual` propio del inmueble o, si no tiene, la tarifa de su clase.
 *    Un monto de 0 (o una clase sin tarifa) no se cobra.
 *  - Se suman una sola vez por periodo: a la expensa del primer departamento (por codigo) del
 *    que la persona es responsable. Asi, quien tiene dos departamentos no paga dos veces.
 *  - Una persona sin departamento a su cargo no genera cobro por baulera ni parqueo.
 *  - Baulera y parqueo nunca generan expensa propia ni llevan agua.
 */
const { Decimal } = require('./saldo.util')
const { filtroOcupanteVigente, filtroPagaExpensa } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const { obtenerMapa, montoEfectivo } = require('../../operativo-seguridad/tarifas-inmueble/tarifas-inmueble.service')

const CLASES_EXTRA = ['PARQUEO', 'BAULERA']

/** Persona responsable de un departamento hoy: propietario vigente; si no hay, el inquilino. */
async function responsableDe(db, inmuebleId, fecha = new Date()) {
  const ocupante = await db.ocupanteInmueble.findFirst({
    where: { inmuebleId, ...filtroOcupanteVigente(fecha) },
    orderBy: [{ esPropietario: 'desc' }, { fechaInicio: 'asc' }],
    select: { copropietarioId: true }
  })
  return ocupante ? ocupante.copropietarioId : null
}

/**
 * Departamentos que pagan expensa y de los que `copropietarioId` es la persona responsable,
 * ordenados por codigo.
 */
async function departamentosACargo(db, copropietarioId, fecha = new Date()) {
  const candidatos = await db.inmueble.findMany({
    where: {
      ...filtroPagaExpensa(fecha),
      ocupaciones: { some: { copropietarioId, ...filtroOcupanteVigente(fecha) } }
    },
    select: { id: true, codigo: true },
    orderBy: { codigo: 'asc' }
  })

  const aCargo = []
  for (const candidato of candidatos) {
    if ((await responsableDe(db, candidato.id, fecha)) === copropietarioId) {
      aCargo.push(candidato)
    }
  }
  return aCargo
}

/**
 * Bauleras y parqueos que `copropietarioId` ocupa hoy y que generan cobro, con su monto.
 * Devuelve [{ inmuebleId, clase, codigo, monto: Decimal }], parqueos primero y luego bauleras.
 */
async function extrasDePersona(db, copropietarioId, fecha = new Date()) {
  // En orden (no en paralelo): `db` puede ser una transaccion interactiva.
  const inmuebles = await db.inmueble.findMany({
    where: {
      clase: { in: CLASES_EXTRA },
      activo: true,
      ocupaciones: { some: { copropietarioId, ...filtroOcupanteVigente(fecha) } }
    },
    select: { id: true, codigo: true, clase: true, cuotaMensual: true }
  })
  const tarifas = await obtenerMapa(db)

  return inmuebles
    .map((inmueble) => ({
      inmuebleId: inmueble.id,
      clase: inmueble.clase,
      codigo: inmueble.codigo,
      monto: montoEfectivo(inmueble, tarifas)
    }))
    .filter((extra) => extra.monto.gt(0))
    .sort(
      (a, b) =>
        CLASES_EXTRA.indexOf(a.clase) - CLASES_EXTRA.indexOf(b.clase) || a.codigo.localeCompare(b.codigo)
    )
}

/**
 * Cargos de baulera y parqueo que se suman a la expensa del departamento `inmuebleId`
 * generada para `responsableId`. Vacio si ese departamento no es el que los lleva.
 */
async function extrasParaExpensa(db, { inmuebleId, responsableId, fecha = new Date() }) {
  const aCargo = await departamentosACargo(db, responsableId, fecha)
  if (aCargo.length === 0 || aCargo[0].id !== inmuebleId) return []
  return extrasDePersona(db, responsableId, fecha)
}

function sumarMontos(cargos) {
  return cargos.reduce((acc, cargo) => acc.plus(cargo.monto), new Decimal(0))
}

module.exports = {
  responsableDe,
  departamentosACargo,
  extrasDePersona,
  extrasParaExpensa,
  sumarMontos
}
