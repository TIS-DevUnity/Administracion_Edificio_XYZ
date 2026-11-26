// Pruebas de que generar y cargarAgua NO descuentan el saldo antes del dia de descuento, y si desde ese dia.
// Se ejecutan con: node --test server/src/modules/financiero/expensas/generar-agua-descuento.test.js
// Usan las funciones reales del servicio sobre una base en memoria (sin base de datos real).
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

let seq = 0
const estado = { movimientos: [], expensas: [], config: null }

function reiniciar({ config = { id: 'c1', diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 9 }, saldo = 0, expensas = [] } = {}) {
  estado.config = config
  estado.movimientos = saldo ? [{ id: 'm0', inmuebleId: 'i1', tipo: 'PAGO_ANTICIPADO', monto: String(saldo) }] : []
  estado.expensas = expensas.map((e) => ({
    inmuebleId: 'i1', montoAgua: 0, montoMora: 0, planPagoId: null, estado: 'PENDIENTE', pagos: [], moras: [], aguaRegistradaEn: null,
    fechaVencimiento: new Date(`${e.periodo}-10T00:00:00Z`), ...e
  }))
}
const saldo = () => estado.movimientos.reduce((acc, m) => acc + Number(m.monto), 0)

const clon = (e) => ({ ...e, pagos: [...e.pagos], moras: [...e.moras], inmueble: { codigo: 'A-101' } })
const db = {
  $queryRaw: async () => [],
  $transaction: async (fn) => fn(db),
  inmueble: { findUnique: async () => ({ id: 'i1', activo: true, clase: 'DEPARTAMENTO', codigo: 'A-101', tipoInmueble: { nombre: 'Tipo A', montoBase: '300' } }) },
  ocupanteInmueble: { findMany: async () => [{ esPropietario: true, copropietario: { id: 'c1', nombre: 'Ana', apellido: 'Perez' } }] },
  cargoExpensa: { createMany: async () => ({ count: 1 }) },
  movimientoSaldo: {
    aggregate: async () => ({ _sum: { monto: saldo() } }),
    create: async ({ data }) => {
      const fila = { id: `m${++seq}`, ...data }
      estado.movimientos.push({ ...fila, monto: String(data.monto) })
      return fila
    }
  },
  expensa: {
    create: async ({ data }) => {
      const e = { id: `e${++seq}`, estado: 'PENDIENTE', pagos: [], moras: [], montoMora: 0, planPagoId: null, aguaRegistradaEn: null, fechaVencimiento: data.fechaVencimiento, ...data }
      estado.expensas.push(e)
      return e
    },
    findUnique: async ({ where }) => {
      const e = estado.expensas.find((x) => x.id === where.id)
      return e ? clon(e) : null
    },
    count: async ({ where }) =>
      estado.expensas.filter((e) => e.inmuebleId === where.inmuebleId && e.id !== where.id.not && e.estado !== 'PAGADA' && e.planPagoId === null && e.periodo < where.periodo.lt).length,
    update: async ({ where, data }) => {
      const e = estado.expensas.find((x) => x.id === where.id)
      Object.assign(e, data)
      return e
    }
  },
  pago: {
    create: async ({ data }) => {
      const pago = { id: `p${++seq}`, ...data }
      estado.expensas.find((e) => e.id === data.expensaId).pagos.push(pago)
      return pago
    }
  }
}

const dobles = {
  '../../../config/prisma': db,
  '../../operativo-seguridad/auditoria/auditoria.service': { registrarAuditoria: async () => {} },
  '../../operativo-seguridad/inmuebles/asignacion.util': { filtroOcupanteVigente: () => ({}) },
  '../configuracion-mora/configuracion-mora.service': {
    obtenerVigente: async () => {
      if (!estado.config) throw new Error('sin configuracion')
      return estado.config
    }
  },
  '../notificaciones/campanita.service': { sincronizarExpensa: async () => {} },
  './cargos.util': { extrasParaExpensa: async () => [], sumarMontos: () => 0 }
}
const cargarOriginal = Module._load
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.replace(/\\/g, '/').endsWith('/expensas/expensas.service.js') && request in dobles) {
    return dobles[request]
  }
  return cargarOriginal.call(this, request, parent, isMain)
}

const { generar, cargarAgua, aplicarSaldoFavor } = require('./expensas.service')

const dia = (texto) => new Date(`${texto}T12:00:00-04:00`)
const usos = () => estado.movimientos.filter((m) => m.tipo === 'APLICACION_EXPENSA')

test('generar antes del dia de descuento NO usa el saldo (el job lo hara despues)', async () => {
  reiniciar({ saldo: 1000 })
  const r = await generar({ inmuebleId: 'i1', periodo: '2026-11', hoy: dia('2026-11-01') })
  assert.equal(r.saldoFavorAplicado, '0.00')
  assert.equal(r.estado, 'PENDIENTE')
  assert.deepEqual(estado.expensas[0].pagos, [])
  assert.equal(usos().length, 0)
  assert.equal(saldo(), 1000)
})

test('generar el dia 8 todavia no descuenta; el dia 9 si (como antes)', async () => {
  reiniciar({ saldo: 1000 })
  const dia8 = await generar({ inmuebleId: 'i1', periodo: '2026-11', hoy: dia('2026-11-08') })
  assert.equal(dia8.saldoFavorAplicado, '0.00')

  reiniciar({ saldo: 1000 })
  const dia9 = await generar({ inmuebleId: 'i1', periodo: '2026-11', hoy: dia('2026-11-09') })
  assert.equal(dia9.saldoFavorAplicado, '300.00')
  assert.equal(dia9.estado, 'PAGADA')
  assert.equal(saldo(), 700)
})

test('generar sin configuracion rige el dia 9 y no se rompe', async () => {
  reiniciar({ config: null, saldo: 1000 })
  // (sin configuracion generar ya exigia fechaVencimiento: eso no cambia)
  const base = { inmuebleId: 'i1', periodo: '2026-11', fechaVencimiento: '2026-11-10', configuracion: null }
  const antes = await generar({ ...base, hoy: dia('2026-11-05') })
  assert.equal(antes.saldoFavorAplicado, '0.00')
  assert.equal(usos().length, 0)

  reiniciar({ config: null, saldo: 1000 })
  const desde = await generar({ ...base, hoy: dia('2026-11-09') })
  assert.equal(desde.saldoFavorAplicado, '300.00')
})

test('generar con una configuracion antigua sin el campo usa el 9', async () => {
  reiniciar({ config: { id: 'c1', diaGeneracion: 1, diaVencimiento: 10 }, saldo: 1000 })
  const r = await generar({ inmuebleId: 'i1', periodo: '2026-11', hoy: dia('2026-11-09'), configuracion: estado.config })
  assert.equal(r.saldoFavorAplicado, '300.00')
})

test('generar con generacion el dia 10 (el 9 queda fuera de rango): rige el 10', async () => {
  const config = { id: 'c1', diaGeneracion: 10, diaVencimiento: 10, diaDescuentoSaldo: 9 }
  reiniciar({ config, saldo: 1000 })
  assert.equal((await generar({ inmuebleId: 'i1', periodo: '2026-11', hoy: dia('2026-11-09'), configuracion: config })).saldoFavorAplicado, '0.00')
  reiniciar({ config, saldo: 1000 })
  assert.equal((await generar({ inmuebleId: 'i1', periodo: '2026-11', hoy: dia('2026-11-10'), configuracion: config })).saldoFavorAplicado, '300.00')
})

const expensaConAgua = { id: 'ex1', periodo: '2026-11', montoBase: '300', montoTotal: '300' }

test('cargarAgua antes del dia de descuento NO usa el saldo', async () => {
  reiniciar({ saldo: 1000, expensas: [expensaConAgua] })
  const r = await cargarAgua('ex1', { montoAgua: 50, hoy: dia('2026-11-05') })
  assert.equal(r.saldoFavorAplicado, '0.00')
  assert.equal(r.montoTotal.toString(), '350')
  assert.equal(r.estado, 'PENDIENTE')
  assert.deepEqual(estado.expensas[0].pagos, [])
  assert.equal(saldo(), 1000)
})

test('cargarAgua desde el dia de descuento cubre el aumento con el saldo', async () => {
  reiniciar({ saldo: 1000, expensas: [expensaConAgua] })
  const r = await cargarAgua('ex1', { montoAgua: 50, hoy: dia('2026-11-09') })
  assert.equal(r.saldoFavorAplicado, '350.00')
  assert.equal(r.estado, 'PAGADA')
  assert.equal(saldo(), 650)
})

test('cargarAgua sin configuracion rige el dia 9', async () => {
  reiniciar({ config: null, saldo: 1000, expensas: [expensaConAgua] })
  assert.equal((await cargarAgua('ex1', { montoAgua: 50, hoy: dia('2026-11-08') })).saldoFavorAplicado, '0.00')
})

test('cargar el agua deja la expensa lista para que el job descuente despues, ya con el total', async () => {
  reiniciar({ saldo: 1000, expensas: [expensaConAgua] })
  await cargarAgua('ex1', { montoAgua: 50, hoy: dia('2026-11-05') })
  assert.ok(estado.expensas[0].aguaRegistradaEn)
  assert.equal(estado.expensas[0].montoTotal.toString(), '350')
})

test('aplicar-saldo manual no cubre una expensa con el agua sin cargar (AGUA_SIN_CARGAR)', async () => {
  reiniciar({ saldo: 1000, expensas: [expensaConAgua] })
  await assert.rejects(
    aplicarSaldoFavor('ex1', { usuarioId: 'u1', ip: null }),
    (err) => {
      assert.equal(err.status, 409)
      assert.equal(err.codigo, 'AGUA_SIN_CARGAR')
      return true
    }
  )
  assert.equal(saldo(), 1000)
  assert.deepEqual(estado.expensas[0].pagos, [])
})
