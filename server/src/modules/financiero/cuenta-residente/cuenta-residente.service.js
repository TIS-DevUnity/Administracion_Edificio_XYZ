const prisma = require('../../../config/prisma')
const { filtroOcupanteVigente } = require('../../operativo-seguridad/inmuebles/asignacion.util')
const { obtenerMapa, montoEfectivo } = require('../../operativo-seguridad/tarifas-inmueble/tarifas-inmueble.service')
const { Decimal, errorHttp, saldoFavorDe } = require('../expensas/saldo.util')
const reglas = require('../expensas/reglas-pago.util')
const cargosUtil = require('../expensas/cargos.util')

const ETIQUETA_CLASE = { DEPARTAMENTO: 'Departamento', BAULERA: 'Baulera', PARQUEO: 'Parqueo' }

function situacionDe(saldoNeto) {
  if (saldoNeto.gt(0)) return 'DEBE'
  if (saldoNeto.lt(0)) return 'A_FAVOR'
  return 'AL_DIA'
}

/**
 * Cuenta consolidada de una persona: todo lo que tiene asociado hoy (departamentos, bauleras y
 * parqueos), cuanto suma cada mes por concepto y como esta su deuda y su saldo a favor.
 *
 * - `cargoMensual.conceptos` es lo que se le cobrara en la proxima expensa, con las mismas
 *   reglas que la generacion (cargos.util.js): la cuota de cada departamento a su cargo y, en
 *   el primero de ellos, la de sus bauleras y parqueos con cobro.
 * - La deuda y el saldo a favor suman solo los departamentos a su cargo (de los que es la
 *   persona responsable); los demas se listan en `inmuebles` pero no cuentan.
 */
async function obtenerCuenta(copropietarioId) {
  const copropietario = await prisma.copropietario.findUnique({
    where: { id: copropietarioId },
    select: { id: true, nombre: true, apellido: true, ci: true, email: true, telefono: true }
  })
  if (!copropietario) {
    throw errorHttp('Copropietario no encontrado', 404)
  }

  const ahora = new Date()
  const ocupaciones = await prisma.ocupanteInmueble.findMany({
    where: { copropietarioId, ...filtroOcupanteVigente(ahora) },
    include: { inmueble: { include: { tipoInmueble: true } } }
  })
  const tarifas = await obtenerMapa(prisma)

  const aCargo = await cargosUtil.departamentosACargo(prisma, copropietarioId, ahora)
  const idsACargo = new Set(aCargo.map((departamento) => departamento.id))
  const ancla = aCargo[0] ?? null

  const extrasConCobro = await cargosUtil.extrasDePersona(prisma, copropietarioId, ahora)
  const idsExtrasCobrados = new Set(ancla ? extrasConCobro.map((extra) => extra.inmuebleId) : [])

  // Inmuebles que tiene asociados hoy, departamentos primero y luego por codigo.
  const inmuebles = ocupaciones
    .map((ocupacion) => {
      const { inmueble } = ocupacion
      const esDepartamento = inmueble.clase === 'DEPARTAMENTO'

      let cargoMensual = new Decimal(0)
      if (inmueble.activo) {
        cargoMensual = esDepartamento
          ? new Decimal(inmueble.tipoInmueble?.montoBase ?? 0)
          : montoEfectivo(inmueble, tarifas)
      }

      return {
        inmuebleId: inmueble.id,
        codigo: inmueble.codigo,
        clase: inmueble.clase,
        tipo: inmueble.tipoInmueble?.nombre ?? ETIQUETA_CLASE[inmueble.clase] ?? inmueble.clase,
        activo: inmueble.activo,
        rol: ocupacion.esPropietario ? 'PROPIETARIO' : 'INQUILINO',
        cuotaMensual: inmueble.cuotaMensual === null ? null : new Decimal(inmueble.cuotaMensual).toFixed(2),
        cargoMensual: cargoMensual.toFixed(2),
        // Departamento: la persona es la responsable. Baulera o parqueo: se le esta cobrando.
        seCobra: esDepartamento ? idsACargo.has(inmueble.id) : idsExtrasCobrados.has(inmueble.id)
      }
    })
    .sort(
      (a, b) =>
        Number(b.clase === 'DEPARTAMENTO') - Number(a.clase === 'DEPARTAMENTO') ||
        a.codigo.localeCompare(b.codigo)
    )

  // Lo que se le cobrara cada mes, por concepto.
  const conceptos = []
  for (const departamento of aCargo) {
    const ocupado = ocupaciones.find((ocupacion) => ocupacion.inmueble.id === departamento.id)
    conceptos.push({
      clase: 'DEPARTAMENTO',
      codigo: departamento.codigo,
      inmuebleId: departamento.id,
      monto: new Decimal(ocupado?.inmueble.tipoInmueble?.montoBase ?? 0)
    })
  }
  if (ancla) {
    for (const extra of extrasConCobro) {
      conceptos.push({
        clase: extra.clase,
        codigo: extra.codigo,
        inmuebleId: extra.inmuebleId,
        monto: extra.monto
      })
    }
  }
  const totalMensual = conceptos.reduce((acc, concepto) => acc.plus(concepto.monto), new Decimal(0))

  // Deuda y saldo a favor de los departamentos a su cargo.
  const departamentos = []
  let deudaPendiente = new Decimal(0)
  let saldoFavor = new Decimal(0)
  for (const departamento of aCargo) {
    const deudas = await reglas.cargarDeudas(prisma, departamento.id)
    const deuda = deudas.reduce((acc, d) => acc.plus(d.pendiente.total), new Decimal(0))
    const saldo = await saldoFavorDe(prisma, departamento.id)
    const neto = deuda.minus(saldo)
    const ocupado = ocupaciones.find((ocupacion) => ocupacion.inmueble.id === departamento.id)

    deudaPendiente = deudaPendiente.plus(deuda)
    saldoFavor = saldoFavor.plus(saldo)
    departamentos.push({
      inmuebleId: departamento.id,
      codigo: departamento.codigo,
      tipo: ocupado?.inmueble.tipoInmueble?.nombre ?? null,
      expensasPendientes: deudas.length,
      deudaPendiente: deuda.toFixed(2),
      saldoFavor: saldo.toFixed(2),
      saldoNeto: neto.toFixed(2),
      situacion: situacionDe(neto)
    })
  }
  const saldoNeto = deudaPendiente.minus(saldoFavor)

  const avisos = []
  if (!ancla && extrasConCobro.length > 0) {
    avisos.push(
      'Tiene bauleras o parqueos con cobro pero ningun departamento a su cargo: por ahora no se le genera cobro por ellos'
    )
  }

  return {
    copropietario,
    inmuebles,
    cargoMensual: {
      conceptos: conceptos.map((concepto) => ({ ...concepto, monto: concepto.monto.toFixed(2) })),
      total: totalMensual.toFixed(2),
      // Departamento de cuya expensa salen los cargos de baulera y parqueo.
      extrasEnDepartamento: ancla ? ancla.codigo : null
    },
    departamentos,
    resumen: {
      deudaPendiente: deudaPendiente.toFixed(2),
      saldoFavor: saldoFavor.toFixed(2),
      saldoNeto: saldoNeto.toFixed(2), // positivo = debe, negativo = a favor
      situacion: situacionDe(saldoNeto)
    },
    avisos
  }
}

module.exports = { obtenerCuenta }
