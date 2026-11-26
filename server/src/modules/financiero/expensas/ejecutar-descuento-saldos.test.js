// Pruebas de ejecutarDescuentoSaldos con una base en memoria (sin base de datos real). Se ejecutan con:
//   node --test server/src/modules/financiero/expensas/ejecutar-descuento-saldos.test.js
// Usan las funciones reales de saldo.util (pendientesDe, aplicarSaldoAExpensa...) sobre un prisma falso.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

let seq = 0
const estado = { movimientos: [], expensas: [], auditorias: [], sincronizadas: [], config: null, bloqueos: 0 }

function reiniciar({ config = { diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 9 }, saldos = {}, expensas = [] } = {}) {
  estado.config = config
  estado.movimientos = Object.entries(saldos).map(([inmuebleId, monto]) => ({ id: `m${++seq}`, inmuebleId, tipo: 'PAGO_ANTICIPADO', monto: String(monto) }))
  estado.expensas = expensas.map((e) => ({ montoMora: 0, planPagoId: null, estado: 'PENDIENTE', pagos: [], fechaVencimiento: new Date(`${e.periodo}-10T00:00:00Z`), ...e }))
  estado.auditorias = []
  estado.sincronizadas = []
  estado.bloqueos = 0
}

const suma = (inmuebleId) => estado.movimientos.filter((m) => m.inmuebleId === inmuebleId).reduce((acc, m) => acc + Number(m.monto), 0)

const db = {
  $queryRaw: async () => { estado.bloqueos += 1; return [] },
  $transaction: async (fn) => fn(db),
  movimientoSaldo: {
    aggregate: async ({ where }) => ({ _sum: { monto: suma(where.inmuebleId) } }),
    groupBy: async () => {
      const ids = [...new Set(estado.movimientos.map((m) => m.inmuebleId))]
      return ids.filter((id) => suma(id) > 0).map((inmuebleId) => ({ inmuebleId, _sum: { monto: suma(inmuebleId) } }))
    },
    create: async ({ data }) => {
      const fila = { id: `m${++seq}`, ...data, monto: data.monto }
      estado.movimientos.push({ ...fila, monto: String(data.monto) })
      return fila
    }
  },
  expensa: {
    findMany: async ({ where, distinct }) => {
      const base = estado.expensas.filter(
        (e) => (where.inmuebleId.in ? where.inmuebleId.in.includes(e.inmuebleId) : e.inmuebleId === where.inmuebleId) && e.estado !== 'PAGADA' && e.planPagoId === null
      )
      if (distinct) return [...new Set(base.map((e) => e.inmuebleId))].map((inmuebleId) => ({ inmuebleId }))
      return base
        .map((e) => ({ ...e, pagos: [...e.pagos] }))
        .sort((a, b) => a.fechaVencimiento - b.fechaVencimiento || a.periodo.localeCompare(b.periodo))
    },
    findFirst: async ({ where }) => {
      const propias = estado.expensas.filter((e) => e.inmuebleId === where.inmuebleId).sort((a, b) => b.periodo.localeCompare(a.periodo))
      return propias[0] ? { periodo: propias[0].periodo } : null
    },
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
  '../../operativo-seguridad/auditoria/auditoria.service': { registrarAuditoria: async (a) => { estado.auditorias.push(a) } },
  '../../operativo-seguridad/inmuebles/asignacion.util': { filtroOcupanteVigente: () => ({}) },
  '../configuracion-mora/configuracion-mora.service': {
    obtenerVigente: async () => {
      if (!estado.config) throw new Error('sin configuracion')
      return estado.config
    }
  },
  '../notificaciones/campanita.service': { sincronizarExpensa: async (id) => { estado.sincronizadas.push(id) } }
}
const cargarOriginal = Module._load
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.replace(/\\/g, '/').endsWith('/expensas/expensas.service.js') && request in dobles) {
    return dobles[request]
  }
  return cargarOriginal.call(this, request, parent, isMain)
}

const { ejecutarDescuentoSaldos } = require('./expensas.service')

const dia = (texto) => new Date(`${texto}T12:00:00-04:00`)
const pagosDe = (id) => estado.expensas.find((e) => e.id === id).pagos
const estadoDe = (id) => estado.expensas.find((e) => e.id === id).estado
const exp = (id, inmuebleId, periodo, montoTotal, extra = {}) => ({ id, inmuebleId, periodo, montoTotal: String(montoTotal), ...extra })

test('antes del dia de descuento no descuenta nada ni consulta', async () => {
  reiniciar({ saldos: { i1: 500 }, expensas: [exp('e1', 'i1', '2026-11', 300)] })
  const r = await ejecutarDescuentoSaldos({ hoy: dia('2026-11-08') })
  assert.equal(r.saldosAplicados, 0)
  assert.equal(r.diaDescuentoSaldo, 9)
  assert.deepEqual(pagosDe('e1'), [])
  assert.equal(suma('i1'), 500)
  assert.equal(estado.bloqueos, 0)
})

test('el dia 9 descuenta de la mas antigua a la mas nueva y registra movimiento y auditoria', async () => {
  reiniciar({
    saldos: { i1: 450 },
    expensas: [exp('nueva', 'i1', '2026-11', 300), exp('vieja', 'i1', '2026-10', 200, { estado: 'VENCIDA' })]
  })
  const r = await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })
  assert.equal(r.saldosAplicados, 2)
  assert.equal(r.montoAplicado, '450.00')
  assert.equal(r.inmuebles, 1)
  assert.equal(estadoDe('vieja'), 'PAGADA') // la mas antigua completa
  assert.equal(pagosDe('vieja')[0].monto.toFixed(2), '200.00')
  assert.equal(pagosDe('vieja')[0].metodoPago, 'SALDO_A_FAVOR')
  assert.equal(estadoDe('nueva'), 'PARCIAL') // lo que sobra: 250 de 300
  assert.equal(pagosDe('nueva')[0].monto.toFixed(2), '250.00')
  assert.equal(suma('i1'), 0)
  // un MovimientoSaldo (uso) por expensa
  const usos = estado.movimientos.filter((m) => m.tipo === 'APLICACION_EXPENSA')
  assert.deepEqual(usos.map((m) => [m.expensaId, Number(m.monto)]), [['vieja', -200], ['nueva', -250]])
  // auditoria despues del commit: MovimientoSaldo y cambio de estado de cada expensa
  const creates = estado.auditorias.filter((a) => a.entidad === 'MovimientoSaldo')
  assert.equal(creates.length, 2)
  assert.equal(creates[0].detalle.motivo, 'DIA_DESCUENTO')
  assert.equal(creates[0].detalle.origen, 'AUTOMATICO')
  assert.equal(estado.auditorias.filter((a) => a.entidad === 'Expensa').length, 2)
  assert.deepEqual(estado.sincronizadas, ['vieja', 'nueva'])
})

test('es idempotente: correrla dos veces no descuenta dos veces', async () => {
  reiniciar({ saldos: { i1: 100 }, expensas: [exp('e1', 'i1', '2026-11', 300)] })
  const primera = await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })
  assert.equal(primera.saldosAplicados, 1)
  const segunda = await ejecutarDescuentoSaldos({ hoy: dia('2026-11-10') })
  assert.equal(segunda.saldosAplicados, 0)
  assert.equal(pagosDe('e1').length, 1)
  assert.equal(estado.movimientos.filter((m) => m.tipo === 'APLICACION_EXPENSA').length, 1)
  assert.equal(suma('i1'), 0)
})

test('cualquier dia posterior descuenta saldo que llego despues, aunque la expensa ya tuviera un descuento', async () => {
  reiniciar({ saldos: { i1: 100 }, expensas: [exp('e1', 'i1', '2026-11', 300)] })
  await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })
  assert.equal(estadoDe('e1'), 'PARCIAL')
  // llega un pago anticipado nuevo el dia 20: criterio = pendiente > 0 y saldo > 0
  estado.movimientos.push({ id: 'm-extra', inmuebleId: 'i1', tipo: 'PAGO_ANTICIPADO', monto: '50' })
  const r = await ejecutarDescuentoSaldos({ hoy: dia('2026-11-20') })
  assert.equal(r.saldosAplicados, 1)
  assert.equal(pagosDe('e1').length, 2)
  assert.equal(pagosDe('e1')[1].monto.toFixed(2), '50.00')
  // y una tercera corrida ya no hace nada
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-11-21') })).saldosAplicados, 0)
})

test('salta las expensas de plan de pagos', async () => {
  reiniciar({
    saldos: { i1: 1000 },
    expensas: [exp('plan', 'i1', '2026-09', 200, { planPagoId: 'plan-1' }), exp('normal', 'i1', '2026-11', 300)]
  })
  const r = await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })
  assert.equal(r.saldosAplicados, 1)
  assert.deepEqual(pagosDe('plan'), [])
  assert.equal(estadoDe('normal'), 'PAGADA')
  assert.equal(suma('i1'), 700) // el saldo que sobra queda disponible
})

test('un inmueble sin saldo, o sin deuda, no se toca; los demas si', async () => {
  reiniciar({
    saldos: { i1: 0, i2: 80, i3: 500 },
    expensas: [exp('a', 'i1', '2026-11', 300), exp('b', 'i2', '2026-11', 300), exp('c', 'i3', '2026-11', 300, { estado: 'PAGADA' })]
  })
  const r = await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })
  assert.equal(r.saldosAplicados, 1)
  assert.deepEqual(pagosDe('a'), [])
  assert.equal(pagosDe('b')[0].monto.toFixed(2), '80.00')
  assert.deepEqual(pagosDe('c'), [])
  assert.equal(suma('i3'), 500)
})

test('un mes atrasado no se cubre en parte: no se toca nada de ese inmueble', async () => {
  reiniciar({
    saldos: { i1: 150 },
    expensas: [exp('vieja', 'i1', '2026-10', 300), exp('actual', 'i1', '2026-11', 100)]
  })
  const r = await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })
  assert.equal(r.saldosAplicados, 0)
  assert.deepEqual(pagosDe('vieja'), [])
  assert.deepEqual(pagosDe('actual'), [])
  assert.equal(suma('i1'), 150)
})

test('sin configuracion rige el dia 9; con otro dia configurado, ese', async () => {
  reiniciar({ config: null, saldos: { i1: 100 }, expensas: [exp('e1', 'i1', '2026-11', 300)] })
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-11-08') })).saldosAplicados, 0)
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })).saldosAplicados, 1)

  reiniciar({ config: { diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 5 }, saldos: { i1: 100 }, expensas: [exp('e1', 'i1', '2026-11', 300)] })
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-11-04') })).saldosAplicados, 0)
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-11-05') })).saldosAplicados, 1)
})

test('config indicada tiene prioridad sobre la lectura; null usa el 9', async () => {
  reiniciar({ config: { diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 2 }, saldos: { i1: 100 }, expensas: [exp('e1', 'i1', '2026-11', 300)] })
  // la configuracion leida diria 2, pero se pasa null (sin configuracion): rige el 9
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-11-05'), config: null })).saldosAplicados, 0)
})

test('marca el origen de la ejecucion manual en la auditoria', async () => {
  reiniciar({ saldos: { i1: 100 }, expensas: [exp('e1', 'i1', '2026-11', 300)] })
  await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09'), usuarioId: 'u1', origen: 'MANUAL_JOB' })
  assert.equal(estado.auditorias[0].detalle.origen, 'MANUAL_JOB')
  assert.equal(estado.auditorias[0].usuarioId, 'u1')
})
