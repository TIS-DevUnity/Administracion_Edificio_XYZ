// Pruebas de la integracion del descuento de saldo a favor en el proceso diario de mora. Se ejecutan con:
//   node --test server/src/modules/financiero/jobs/descuento-saldo.job.test.js
// No tocan la base de datos: prisma y los servicios que usa el job se reemplazan por dobles.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

const estado = { config: null, expensas: [], descuento: null, orden: [], fallaDescuento: false }
const llamadas = { descuento: [], mora: [] }

function escenario({ config = { id: 'c1', diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 9 }, expensas = [{ id: 'e1' }, { id: 'e2' }], descuento = 2, fallaDescuento = false } = {}) {
  estado.config = config
  estado.expensas = expensas
  estado.descuento = descuento
  estado.fallaDescuento = fallaDescuento
  estado.orden = []
  llamadas.descuento = []
  llamadas.mora = []
}

const dobles = {
  '../../../config/prisma': {
    expensa: {
      findMany: async () => {
        estado.orden.push('consulta-expensas-con-deuda')
        return estado.expensas
      }
    }
  },
  '../expensas/expensas.service': {
    ejecutarDescuentoSaldos: async (args) => {
      estado.orden.push('descuento')
      llamadas.descuento.push(args)
      if (estado.fallaDescuento) throw new Error('se cayo')
      return { saldosAplicados: estado.descuento }
    },
    aplicarMora: async (id) => {
      llamadas.mora.push(id)
      return { moraActualizada: id === 'e1' }
    }
  },
  '../configuracion-mora/configuracion-mora.service': {
    obtenerVigente: async () => {
      if (!estado.config) throw new Error('sin configuracion')
      return estado.config
    }
  },
  '../notificaciones/notificaciones.service': { notificarMoraAplicada: async () => {} },
  '../notificaciones/campanita.service': {},
  '../planes-pago/planes-pago.service': {},
  '../../operativo-seguridad/inmuebles/asignacion.util': { filtroPagaExpensa: () => ({}) }
}
const cargarOriginal = Module._load
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.replace(/\\/g, '/').endsWith('/jobs/generacion-automatica.job.js') && request in dobles) {
    return dobles[request]
  }
  return cargarOriginal.call(this, request, parent, isMain)
}

const { ejecutarAplicacionMoraAutomatica } = require('./generacion-automatica.job')

const hoy = new Date('2026-11-09T16:00:00Z')

test('descuenta el saldo ANTES de aplicar la mora y devuelve saldosAplicados', async () => {
  escenario()
  const r = await ejecutarAplicacionMoraAutomatica({ hoy })
  assert.deepEqual(r, { aplicadas: 1, saldosAplicados: 2 })
  assert.equal(estado.orden[0], 'descuento')
  assert.equal(estado.orden[1], 'consulta-expensas-con-deuda')
  assert.deepEqual(llamadas.mora, ['e1', 'e2'])
})

test('pasa la fecha, la configuracion y el origen al descuento (cron: AUTOMATICO)', async () => {
  escenario()
  await ejecutarAplicacionMoraAutomatica({ hoy })
  assert.equal(llamadas.descuento.length, 1)
  assert.equal(llamadas.descuento[0].hoy, hoy)
  assert.equal(llamadas.descuento[0].config, estado.config)
  assert.equal(llamadas.descuento[0].origen, 'AUTOMATICO')
  assert.equal(llamadas.descuento[0].usuarioId, null)
})

test('disparado a mano por un administrador marca MANUAL_JOB', async () => {
  escenario()
  await ejecutarAplicacionMoraAutomatica({ usuarioId: 'u1', ip: '1.2.3.4', hoy })
  assert.equal(llamadas.descuento[0].origen, 'MANUAL_JOB')
  assert.equal(llamadas.descuento[0].usuarioId, 'u1')
  assert.equal(llamadas.descuento[0].ip, '1.2.3.4')
})

test('sin configuracion de mora igual descuenta (rige el dia 9) y no aplica mora', async () => {
  escenario({ config: null, descuento: 3 })
  const r = await ejecutarAplicacionMoraAutomatica({ hoy })
  assert.deepEqual(r, { aplicadas: 0, saldosAplicados: 3 })
  assert.equal(llamadas.descuento[0].config, null)
  assert.deepEqual(llamadas.mora, [])
})

test('si el descuento falla, la mora se aplica igual', async () => {
  escenario({ fallaDescuento: true })
  const r = await ejecutarAplicacionMoraAutomatica({ hoy })
  assert.deepEqual(r, { aplicadas: 1, saldosAplicados: 0 })
  assert.deepEqual(llamadas.mora, ['e1', 'e2'])
})

test('antes del dia de descuento el servicio responde 0 y la mora sigue igual', async () => {
  escenario({ descuento: 0 })
  const r = await ejecutarAplicacionMoraAutomatica({ hoy: new Date('2026-11-03T16:00:00Z') })
  assert.deepEqual(r, { aplicadas: 1, saldosAplicados: 0 })
})
