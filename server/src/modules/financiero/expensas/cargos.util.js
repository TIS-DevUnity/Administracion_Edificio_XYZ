/**
 * REGLA DEMO: solo el departamento paga cuota fija por tipo.
 * Parqueo y baulera son informacion vinculada al departamento, sin importe.
 * El unico adicional de la demostracion es el agua, cargado en la expensa.
 * No se modifica el calculo vigente de mora, vencimientos ni pagos.
 */
const { Decimal } = require('./saldo.util')
const { filtroOcupanteVigente, filtroPagaExpensa } = require('../../operativo-seguridad/inmuebles/asignacion.util')


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
 * Compatibilidad con llamadas actuales del servicio de expensas.
 * Nunca se genera un CargoExpensa por parqueo ni baulera.
 */
async function extrasDeDepartamento(_db, _inmuebleId) {
  return []
}

async function extrasDePersona(_db, _copropietarioId, _fecha = new Date()) {
  return []
}

async function extrasParaExpensa(_db, _opciones) {
  return []
}

function sumarMontos(cargos) {
  return cargos.reduce((acc, cargo) => acc.plus(cargo.monto), new Decimal(0))
}

module.exports = {
  responsableDe,
  departamentosACargo,
  extrasDePersona,
  extrasDeDepartamento,
  extrasParaExpensa,
  sumarMontos
}
