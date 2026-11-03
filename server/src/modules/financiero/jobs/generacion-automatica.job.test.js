// Pruebas de la generacion automatica de expensas (HU3 M1). Se ejecutan con: node --test <este archivo>
// No tocan la base de datos: prisma y los servicios que usa el job se reemplazan por dobles.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

const estado = {}
const llamadas = { generar: [], consultas: [], aplicarSaldo: [] }

function escenario({ config = { id: 'cfg1', diaGeneracion: 10, diaVencimiento: 15, diasGracia: 0 }, inmuebles, expensas = [] } = {}) {
  estado.config = config
  estado.inmuebles = inmuebles ?? [
    { id: 'i1', codigo: 'A-101' },
    { id: 'i2', codigo: 'A-102' }
  ]
  estado.expensas = [...expensas]
  llamadas.generar = []
  llamadas.consultas = []
  llamadas.aplicarSaldo = []
  estado.saldos = []
  estado.configuraciones = {}
  estado.fallaAplicar = {}
}

const prismaFalso = {
  movimientoSaldo: { groupBy: async () => estado.saldos },
  configuracionMora: {
    findUnique: async ({ where }) => estado.configuraciones[where.id] ?? null,
    findFirst: async () => null
  },
  inmueble: {
    findMany: async ({ where }) => {
      llamadas.consultas.push('inmueble.findMany')
      return where.id ? [] : estado.inmuebles // la segunda consulta (excluidos) no devuelve nada
    }
  },
  expensa: {
    findMany: async ({ where }) => {
      llamadas.consultas.push('expensa.findMany')
      // Consulta del descuento de saldos: deudas de un inmueble, la mas antigua primero.
      if (where.estado) {
        return estado.expensas
          .filter((e) => e.inmuebleId === where.inmuebleId && e.estado !== 'PAGADA')
          .sort((a, b) => a.periodo.localeCompare(b.periodo))
      }
      if (where.id) return estado.expensas.filter((e) => where.id.in.includes(e.id)).map((e) => ({ ...e, inmueble: {}, cargos: [] }))
      return estado.expensas.filter((e) => e.periodo === where.periodo && where.inmuebleId.in.includes(e.inmuebleId))
    },
    count: async ({ where }) => {
      llamadas.consultas.push('expensa.count')
      return estado.expensas.filter((e) => e.periodo === where.periodo).length
    }
  }
}

const expensasFalso = {
  generar: async ({ inmuebleId, periodo }) => {
    llamadas.generar.push({ inmuebleId, periodo })
    if (estado.expensas.some((e) => e.inmuebleId === inmuebleId && e.periodo === periodo)) {
      throw Object.assign(new Error('duplicada'), { codigo: 'EXPENSA_DUPLICADA' })
    }
    const creada = { id: `e-${inmuebleId}-${periodo}`, inmuebleId, periodo }
    estado.expensas.push(creada)
    return creada
  },
  aplicarSaldoFavor: async (id) => {
    llamadas.aplicarSaldo.push(id)
    if (estado.fallaAplicar[id]) throw new Error(estado.fallaAplicar[id])
    const expensa = estado.expensas.find((e) => e.id === id)
    expensa.estado = expensa.quedaEn ?? 'PAGADA'
    return { expensa, saldoFavorAplicado: '10.00' }
  }
}

const dobles = {
  '../../../config/prisma': prismaFalso,
  '../expensas/expensas.service': expensasFalso,
  '../configuracion-mora/configuracion-mora.service': {
    obtenerVigente: async () => {
      if (!estado.config) throw new Error('sin configuracion')
      return estado.config
    }
  },
  '../notificaciones/notificaciones.service': { notificarExpensaGenerada: async () => ({ enviados: 0, fallidos: 0, omitidos: 0 }) },
  '../notificaciones/campanita.service': {},
  '../planes-pago/planes-pago.service': {}
}
const cargarOriginal = Module._load
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.replace(/\\/g, '/').endsWith('/jobs/generacion-automatica.job.js') && request in dobles) {
    return dobles[request]
  }
  return cargarOriginal.call(this, request, parent, isMain)
}

const { ejecutarGeneracionAutomatica, ejecutarDescuentoSaldos } = require('./generacion-automatica.job')

// Fechas en hora de Bolivia (UTC-4): mediodia del dia indicado.
const dia = (texto) => new Date(`${texto}T12:00:00-04:00`)
const periodosGenerados = () => llamadas.generar.map((g) => `${g.inmuebleId}:${g.periodo}`)

test('antes del dia de generacion no genera ni consulta expensas', async () => {
  escenario()
  const r = await ejecutarGeneracionAutomatica(dia('2026-10-05'))
  assert.equal(r.generadas, 0)
  assert.equal(r.motivo, 'no es el dia de generacion')
  assert.deepEqual(llamadas.generar, [])
  assert.deepEqual(llamadas.consultas, [])
})

test('el dia de generacion genera el mes para cada departamento (como siempre)', async () => {
  escenario()
  const r = await ejecutarGeneracionAutomatica(dia('2026-10-10'))
  assert.equal(r.periodo, '2026-10')
  assert.equal(r.generadas, 2)
  assert.deepEqual(periodosGenerados(), ['i1:2026-10', 'i2:2026-10'])
})

test('pasado el dia de generacion genera el mes si todavia no existe (M1)', async () => {
  escenario()
  const r = await ejecutarGeneracionAutomatica(dia('2026-10-12'))
  assert.equal(r.periodo, '2026-10')
  assert.equal(r.generadas, 2)
  assert.deepEqual(periodosGenerados(), ['i1:2026-10', 'i2:2026-10'])
})

test('pasado el dia, si el mes ya existe no hace nada ni duplica', async () => {
  escenario({ expensas: [{ id: 'x1', inmuebleId: 'i1', periodo: '2026-10' }, { id: 'x2', inmuebleId: 'i2', periodo: '2026-10' }] })
  const r = await ejecutarGeneracionAutomatica(dia('2026-10-20'))
  assert.equal(r.generadas, 0)
  assert.equal(r.motivo, 'el periodo ya fue generado')
  assert.deepEqual(llamadas.generar, [])
  assert.equal(estado.expensas.length, 2)
})

test('es idempotente: ejecutarlo varios dias seguidos genera el mes una sola vez', async () => {
  escenario()
  await ejecutarGeneracionAutomatica(dia('2026-10-12'))
  await ejecutarGeneracionAutomatica(dia('2026-10-13'))
  await ejecutarGeneracionAutomatica(dia('2026-10-31'))
  assert.equal(estado.expensas.length, 2)
  assert.equal(llamadas.generar.length, 2)
})

test('el dia exacto repetido tampoco duplica (cada inmueble con expensa se salta)', async () => {
  escenario()
  await ejecutarGeneracionAutomatica(dia('2026-10-10'))
  const segunda = await ejecutarGeneracionAutomatica(dia('2026-10-10'))
  assert.equal(segunda.generadas, 0)
  assert.deepEqual(segunda.yaGeneradas.sort(), ['A-101', 'A-102'])
  assert.equal(estado.expensas.length, 2)
})

test('pasado el dia no se generan tardiamente los inmuebles que faltan si el mes ya existe', async () => {
  // A-102 se asigno despues de la generacion: no se le genera sola a mitad de mes (el vencimiento ya paso).
  escenario({ expensas: [{ id: 'x1', inmuebleId: 'i1', periodo: '2026-10' }] })
  const tarde = await ejecutarGeneracionAutomatica(dia('2026-10-18'))
  assert.equal(tarde.generadas, 0)
  assert.deepEqual(llamadas.generar, [])
  // El dia exacto si completa los que falten, como hasta ahora.
  const exacto = await ejecutarGeneracionAutomatica(dia('2026-10-10'))
  assert.equal(exacto.generadas, 1)
  assert.deepEqual(periodosGenerados(), ['i2:2026-10'])
})

test('forzar genera aunque sea antes del dia y no duplica lo ya generado', async () => {
  escenario({ expensas: [{ id: 'x1', inmuebleId: 'i1', periodo: '2026-10' }] })
  const r = await ejecutarGeneracionAutomatica(dia('2026-10-03'), { forzar: true })
  assert.equal(r.generadas, 1)
  assert.deepEqual(r.yaGeneradas, ['A-101'])
  assert.deepEqual(periodosGenerados(), ['i2:2026-10'])
})

test('forzar tampoco se frena por un mes ya generado pasado el dia', async () => {
  escenario({ expensas: [{ id: 'x1', inmuebleId: 'i1', periodo: '2026-10' }] })
  const r = await ejecutarGeneracionAutomatica(dia('2026-10-25'), { forzar: true })
  assert.equal(r.generadas, 1)
  assert.deepEqual(periodosGenerados(), ['i2:2026-10'])
})

test('un mes nuevo se genera aunque el anterior ya exista', async () => {
  escenario({ expensas: [{ id: 'x1', inmuebleId: 'i1', periodo: '2026-10' }, { id: 'x2', inmuebleId: 'i2', periodo: '2026-10' }] })
  const r = await ejecutarGeneracionAutomatica(dia('2026-11-12'))
  assert.equal(r.periodo, '2026-11')
  assert.equal(r.generadas, 2)
  assert.deepEqual(periodosGenerados(), ['i1:2026-11', 'i2:2026-11'])
})

test('el dia y el periodo se cuentan en hora de Bolivia, no en UTC', async () => {
  // 2026-11-01 02:00 UTC todavia es 31 de octubre en La Paz.
  escenario({ config: { id: 'cfg1', diaGeneracion: 1, diaVencimiento: 10, diasGracia: 0 }, expensas: [{ id: 'x1', inmuebleId: 'i1', periodo: '2026-10' }, { id: 'x2', inmuebleId: 'i2', periodo: '2026-10' }] })
  const noche = await ejecutarGeneracionAutomatica(new Date('2026-11-01T03:59:00Z'))
  assert.equal(noche.generadas, 0)
  assert.equal(noche.motivo, 'el periodo ya fue generado')
  // A las 04:00 UTC ya es 1 de noviembre en La Paz: es el dia de generacion de 2026-11.
  const madrugada = await ejecutarGeneracionAutomatica(new Date('2026-11-01T04:00:00Z'))
  assert.equal(madrugada.periodo, '2026-11')
  assert.equal(madrugada.generadas, 2)
})

test('sin configuracion de mora vigente no genera nada', async () => {
  escenario({ config: null })
  const r = await ejecutarGeneracionAutomatica(dia('2026-10-12'))
  assert.deepEqual(r, { generadas: 0, omitidas: 0 })
  assert.deepEqual(llamadas.generar, [])
})

const conSaldo = (expensas, configuraciones = {}) => {
  escenario({ expensas })
  estado.saldos = [{ inmuebleId: 'i1', _sum: { monto: 500 } }, { inmuebleId: 'i2', _sum: { monto: 0 } }]
  estado.configuraciones = configuraciones
}
const pendiente = { inmuebleId: 'i1', estado: 'PENDIENTE', configuracionMoraId: 'c', createdAt: new Date() }
const dia9 = { c: { diaDescuentoSaldo: 9 } }

test('el saldo a favor no se descuenta antes del dia configurado', async () => {
  conSaldo([{ ...pendiente, id: 'a', periodo: '2026-10' }], dia9)
  const r = await ejecutarDescuentoSaldos({ hoy: dia('2026-10-08') })
  assert.equal(r.aplicados, 0)
  assert.deepEqual(llamadas.aplicarSaldo, [])
})

test('el dia configurado se descuenta, y un dia perdido se recupera despues', async () => {
  conSaldo([{ ...pendiente, id: 'a', periodo: '2026-10' }], dia9)
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-10-09') })).aplicados, 1)
  conSaldo([{ ...pendiente, id: 'a', periodo: '2026-10' }], dia9)
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-10-12') })).aplicados, 1)
})

test('el dia de descuento se puede cambiar por configuracion', async () => {
  conSaldo([{ ...pendiente, id: 'a', periodo: '2026-10' }], { c: { diaDescuentoSaldo: 5 } })
  assert.equal((await ejecutarDescuentoSaldos({ hoy: dia('2026-10-05') })).aplicados, 1)
})

test('sin saldo a favor no se toca el inmueble', async () => {
  conSaldo([{ ...pendiente, id: 'b', inmuebleId: 'i2', periodo: '2026-10' }], dia9)
  await ejecutarDescuentoSaldos({ hoy: dia('2026-10-20') })
  assert.deepEqual(llamadas.aplicarSaldo, [])
})

test('va de la expensa mas antigua a la mas nueva y sigue solo si la anterior quedo pagada', async () => {
  conSaldo([{ ...pendiente, id: 'nov', periodo: '2026-11' }, { ...pendiente, id: 'oct', periodo: '2026-10' }], dia9)
  await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })
  assert.deepEqual(llamadas.aplicarSaldo, ['oct', 'nov'])

  conSaldo([{ ...pendiente, id: 'nov', periodo: '2026-11' }, { ...pendiente, id: 'oct', periodo: '2026-10', quedaEn: 'PARCIAL' }], dia9)
  await ejecutarDescuentoSaldos({ hoy: dia('2026-11-09') })
  assert.deepEqual(llamadas.aplicarSaldo, ['oct'])
})

test('la expensa de un mes cuyo dia no llego no se toca aunque la anterior si', async () => {
  conSaldo([{ ...pendiente, id: 'oct', periodo: '2026-10' }, { ...pendiente, id: 'nov', periodo: '2026-11' }], dia9)
  await ejecutarDescuentoSaldos({ hoy: dia('2026-11-05') })
  assert.deepEqual(llamadas.aplicarSaldo, ['oct'])
})

test('un rechazo de las reglas de pago no frena a los demas inmuebles', async () => {
  conSaldo([{ ...pendiente, id: 'a', periodo: '2026-10' }, { ...pendiente, id: 'b', inmuebleId: 'i2', periodo: '2026-10' }], dia9)
  estado.saldos = [{ inmuebleId: 'i1', _sum: { monto: 5 } }, { inmuebleId: 'i2', _sum: { monto: 5 } }]
  estado.fallaAplicar = { a: 'no alcanza' }
  const r = await ejecutarDescuentoSaldos({ hoy: dia('2026-10-09') })
  assert.deepEqual(llamadas.aplicarSaldo, ['a', 'b'])
  assert.equal(r.aplicados, 1)
})
