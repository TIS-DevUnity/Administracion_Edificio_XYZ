// Pruebas del cobro extra opcional por expensa (validaciones, total y PATCH /expensas/:id/extra). Se ejecutan con:
//   node --test server/src/modules/financiero/expensas/cargar-extra.test.js
// Usan las funciones reales del servicio sobre una base en memoria (sin base de datos real).
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

let seq = 0
const estado = { movimientos: [], expensas: [], config: null, auditorias: [], sincronizadas: [] }

function reiniciar({ config = { id: 'c1', diaGeneracion: 1, diaVencimiento: 10, diaDescuentoSaldo: 9 }, saldo = 0, expensas = [] } = {}) {
  estado.config = config
  estado.movimientos = saldo ? [{ id: 'm0', inmuebleId: 'i1', tipo: 'PAGO_ANTICIPADO', monto: String(saldo) }] : []
  estado.expensas = expensas.map((e) => ({
    inmuebleId: 'i1', montoBase: '300', montoAgua: '0', montoExtra: '0', extraConcepto: null, montoMora: 0, planPagoId: null,
    estado: 'PENDIENTE', pagos: [], moras: [], aguaRegistradaEn: null, fechaVencimiento: new Date(`${e.periodo}-10T00:00:00Z`), ...e
  }))
  estado.auditorias = []
  estado.sincronizadas = []
}
const saldo = () => estado.movimientos.reduce((acc, m) => acc + Number(m.monto), 0)
const exp = () => estado.expensas.find((e) => e.id === 'ex1')

const clon = (e) => ({ ...e, pagos: [...e.pagos], moras: [...e.moras], inmueble: { codigo: 'A-101' } })
const db = {
  $queryRaw: async () => [],
  $transaction: async (fn) => fn(db),
  movimientoSaldo: {
    aggregate: async () => ({ _sum: { monto: saldo() } }),
    create: async ({ data }) => {
      const fila = { id: `m${++seq}`, ...data }
      estado.movimientos.push({ ...fila, monto: String(data.monto) })
      return fila
    }
  },
  expensa: {
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
  '../../operativo-seguridad/auditoria/auditoria.service': { registrarAuditoria: async (a) => { estado.auditorias.push(a) } },
  '../../operativo-seguridad/inmuebles/asignacion.util': { filtroOcupanteVigente: () => ({}) },
  '../configuracion-mora/configuracion-mora.service': {
    obtenerVigente: async () => {
      if (!estado.config) throw new Error('sin configuracion')
      return estado.config
    }
  },
  '../notificaciones/campanita.service': { sincronizarExpensa: async (id) => { estado.sincronizadas.push(id) } },
  './cargos.util': { extrasParaExpensa: async () => [], sumarMontos: () => 0 }
}
const cargarOriginal = Module._load
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.replace(/\\/g, '/').endsWith('/expensas/expensas.service.js') && request in dobles) {
    return dobles[request]
  }
  return cargarOriginal.call(this, request, parent, isMain)
}

const { cargarExtra, cargarAgua } = require('./expensas.service')
const { validarExtra, calcularMontoTotal, etiquetaExtra, MAX_CONCEPTO } = require('./extra.util')
const { desgloseExpensa } = require('../cuenta-inmueble/estado-cuenta.util')

const dia = (texto) => new Date(`${texto}T12:00:00-04:00`)
const base = { id: 'ex1', periodo: '2026-11', montoTotal: '300' }
const pagoDe = (montoExpensa) => ({ id: 'p1', monto: String(montoExpensa), montoMora: '0', montoExpensa: String(montoExpensa), metodoPago: 'EFECTIVO' })

function rechaza(promesaOFn, status, codigo) {
  const verificar = (err) => {
    assert.equal(err.status, status)
    if (codigo) assert.equal(err.codigo, codigo)
    return true
  }
  return typeof promesaOFn === 'function' ? assert.throws(promesaOFn, verificar) : assert.rejects(promesaOFn, verificar)
}

// ---------------------------------------------------------------------------
// Reglas puras
// ---------------------------------------------------------------------------

test('montoTotal = base + agua + extra, con decimales exactos', () => {
  assert.equal(calcularMontoTotal('300', '45', '250').toFixed(2), '595.00')
  assert.equal(calcularMontoTotal('300').toFixed(2), '300.00')
  assert.equal(calcularMontoTotal('300', null, undefined).toFixed(2), '300.00')
  assert.equal(calcularMontoTotal('0.1', '0.2', '0').toFixed(2), '0.30')
})

test('validarExtra: monto >= 0 con maximo 2 decimales', () => {
  assert.equal(validarExtra(250, 'Pintura').monto.toFixed(2), '250.00')
  assert.equal(validarExtra('0.01', 'x').monto.toFixed(2), '0.01')
  for (const monto of [-1, '-0.01', 'abc', '10.999', true, null, '']) rechaza(() => validarExtra(monto, 'Pintura'), 400)
  rechaza(() => validarExtra(undefined, 'Pintura'), 400)
})

test('validarExtra: concepto obligatorio con monto > 0, texto limpio y maximo 100', () => {
  for (const concepto of [undefined, null, '', '   ']) rechaza(() => validarExtra(100, concepto), 400, 'CONCEPTO_REQUERIDO')
  rechaza(() => validarExtra(100, 42), 400)
  assert.equal(validarExtra(100, '  Pintura   del   edificio  ').concepto, 'Pintura del edificio')
  assert.equal(validarExtra(100, 'x'.repeat(MAX_CONCEPTO)).concepto.length, MAX_CONCEPTO)
  rechaza(() => validarExtra(100, 'x'.repeat(MAX_CONCEPTO + 1)), 400)
  rechaza(() => validarExtra(100, 'linea 1\nlinea 2'), 400)
  rechaza(() => validarExtra(100, 'tab\tseparado'), 400)
})

test('validarExtra: con monto 0 se quita el extra y el concepto se limpia', () => {
  assert.deepEqual({ ...validarExtra(0, 'Pintura'), monto: validarExtra(0).monto.toFixed(2) }, { monto: '0.00', concepto: null })
  assert.equal(validarExtra('0', undefined).concepto, null)
  assert.equal(validarExtra(0, 'x'.repeat(500)).concepto, null) // no se valida lo que se descarta
})

test('etiquetaExtra: "Extra <concepto>" solo si hay extra', () => {
  assert.equal(etiquetaExtra({ montoExtra: '250', extraConcepto: 'Pintura Edificio' }), 'Extra Pintura Edificio')
  assert.equal(etiquetaExtra({ montoExtra: '0', extraConcepto: null }), null)
  assert.equal(etiquetaExtra({}), null)
  assert.equal(etiquetaExtra({ montoExtra: '10', extraConcepto: null }), 'Extra')
})

test('estado de cuenta: la linea del extra aparece solo si la expensa lo tiene y las lineas siguen sumando el total', () => {
  const sin = desgloseExpensa({ montoBase: '300', montoAgua: '45', montoExtra: '0', cargos: [] })
  assert.deepEqual(sin.map((l) => l.concepto), ['Tarifa fija', 'Agua'])
  const con = desgloseExpensa({ montoBase: '300', montoAgua: '45', montoExtra: '250', extraConcepto: 'Pintura Edificio', cargos: [] })
  assert.deepEqual(con.map((l) => [l.concepto, l.monto]), [['Tarifa fija', '300.00'], ['Agua', '45.00'], ['Extra Pintura Edificio', '250.00']])
  assert.equal(con.reduce((acc, l) => acc + Number(l.monto), 0), 595)
  // una expensa anterior a la columna (sin montoExtra) no cambia
  assert.deepEqual(desgloseExpensa({ montoBase: '300', montoAgua: '0', cargos: [] }).map((l) => l.concepto), ['Tarifa fija', 'Agua'])
})

// ---------------------------------------------------------------------------
// PATCH /expensas/:id/extra
// ---------------------------------------------------------------------------

test('carga el extra: total = base + agua + extra, con concepto y etiqueta', async () => {
  reiniciar({ expensas: [{ ...base, montoAgua: '45', montoTotal: '345', aguaRegistradaEn: new Date() }] })
  const r = await cargarExtra('ex1', { montoExtra: 250, concepto: '  Pintura Edificio ', hoy: dia('2026-11-05') })
  assert.equal(r.montoExtra.toString(), '250')
  assert.equal(r.extraConcepto, 'Pintura Edificio')
  assert.equal(r.extraEtiqueta, 'Extra Pintura Edificio')
  assert.equal(r.montoTotal.toString(), '595') // 300 + 45 + 250
  assert.equal(r.estado, 'PENDIENTE')
  assert.equal(r.saldoFavorAplicado, '0.00')
})

test('cargarAgua conserva el extra que la expensa ya tiene', async () => {
  reiniciar({ expensas: [{ ...base, montoExtra: '250', extraConcepto: 'Pintura Edificio', montoTotal: '550' }] })
  const r = await cargarAgua('ex1', { montoAgua: 45, hoy: dia('2026-11-05') })
  assert.equal(r.montoTotal.toString(), '595')
  assert.equal(r.montoExtra.toString(), '250')
  assert.equal(r.extraConcepto, 'Pintura Edificio')
})

test('una expensa con mora no admite cambiar el extra (EXPENSA_CON_MORA) y no se guarda nada', async () => {
  reiniciar({ expensas: [{ ...base, moras: [{ id: 'mo1' }], montoMora: '30' }] })
  await rechaza(cargarExtra('ex1', { montoExtra: 100, concepto: 'Pintura' }), 409, 'EXPENSA_CON_MORA')
  assert.equal(exp().montoExtra, '0')
  assert.equal(exp().montoTotal, '300')
  assert.equal(estado.auditorias.length, 0)
})

test('una expensa en plan de pagos no admite cambiar el extra (EXPENSA_EN_PLAN)', async () => {
  reiniciar({ expensas: [{ ...base, planPagoId: 'plan-1' }] })
  await rechaza(cargarExtra('ex1', { montoExtra: 100, concepto: 'Pintura' }), 409, 'EXPENSA_EN_PLAN')
  assert.equal(exp().montoExtra, '0')
})

test('el nuevo total no puede quedar por debajo de lo ya pagado (EXTRA_MENOR_A_LO_PAGADO)', async () => {
  reiniciar({ expensas: [{ ...base, montoExtra: '100', extraConcepto: 'Pintura', montoTotal: '400', estado: 'PARCIAL', pagos: [pagoDe(350)] }] })
  // quitar el extra dejaria el total en 300 y ya se pagaron 350
  await rechaza(cargarExtra('ex1', { montoExtra: 0 }), 409, 'EXTRA_MENOR_A_LO_PAGADO')
  assert.equal(exp().montoExtra, '100')
  assert.equal(exp().montoTotal, '400')
  // bajarlo hasta exactamente lo pagado si se puede
  const r = await cargarExtra('ex1', { montoExtra: 50, concepto: 'Pintura' })
  assert.equal(r.montoTotal.toString(), '350')
  assert.equal(r.estado, 'PAGADA')
})

test('quitar el extra: monto 0, concepto limpio y total sin extra', async () => {
  reiniciar({ expensas: [{ ...base, montoExtra: '250', extraConcepto: 'Pintura Edificio', montoTotal: '550' }] })
  const r = await cargarExtra('ex1', { montoExtra: 0, concepto: 'lo que sea' })
  assert.equal(r.montoExtra.toString(), '0')
  assert.equal(r.extraConcepto, null)
  assert.equal(r.extraEtiqueta, null)
  assert.equal(r.montoTotal.toString(), '300')
})

test('agregar el extra a una expensa ya pagada la deja PARCIAL; quitarlo la devuelve a PAGADA', async () => {
  reiniciar({ expensas: [{ ...base, estado: 'PAGADA', pagos: [pagoDe(300)] }] })
  const con = await cargarExtra('ex1', { montoExtra: 250, concepto: 'Pintura' })
  assert.equal(con.estado, 'PARCIAL')
  const sin = await cargarExtra('ex1', { montoExtra: 0 })
  assert.equal(sin.estado, 'PAGADA')
})

test('concepto obligatorio con monto > 0: 400 y no se guarda nada', async () => {
  reiniciar({ expensas: [{ ...base }] })
  await rechaza(cargarExtra('ex1', { montoExtra: 100 }), 400, 'CONCEPTO_REQUERIDO')
  await rechaza(cargarExtra('ex1', { montoExtra: 100, concepto: '   ' }), 400, 'CONCEPTO_REQUERIDO')
  await rechaza(cargarExtra('ex1', { montoExtra: -5, concepto: 'x' }), 400)
  assert.equal(exp().montoExtra, '0')
  assert.equal(estado.auditorias.length, 0)
})

test('sin cambio real: 409 SIN_CAMBIO; cambiar solo el concepto si es un cambio', async () => {
  reiniciar({ expensas: [{ ...base }] })
  await rechaza(cargarExtra('ex1', { montoExtra: 0 }), 409, 'SIN_CAMBIO') // nace en 0
  await cargarExtra('ex1', { montoExtra: 250, concepto: 'Pintura' })
  await rechaza(cargarExtra('ex1', { montoExtra: 250, concepto: ' Pintura ' }), 409, 'SIN_CAMBIO')
  const r = await cargarExtra('ex1', { montoExtra: 250, concepto: 'Reparaciones' })
  assert.equal(r.extraConcepto, 'Reparaciones')
})

test('expensa inexistente: 404', async () => {
  reiniciar({ expensas: [] })
  await rechaza(cargarExtra('nope', { montoExtra: 10, concepto: 'x' }), 404)
})

test('auditoria con motivo EXTRA, antes y despues, y sincroniza la campanita', async () => {
  reiniciar({ expensas: [{ ...base }] })
  await cargarExtra('ex1', { montoExtra: 250, concepto: 'Pintura Edificio', usuarioId: 'u1', ip: '1.2.3.4' })
  const a = estado.auditorias.find((x) => x.entidad === 'Expensa')
  assert.equal(a.accion, 'UPDATE')
  assert.equal(a.usuarioId, 'u1')
  assert.equal(a.ip, '1.2.3.4')
  assert.equal(a.detalle.motivo, 'EXTRA')
  assert.deepEqual(a.detalle.montoExtra, { antes: '0.00', despues: '250.00' })
  assert.deepEqual(a.detalle.extraConcepto, { antes: null, despues: 'Pintura Edificio' })
  assert.deepEqual(a.detalle.montoTotal, { antes: '300.00', despues: '550.00' })
  assert.deepEqual(a.detalle.estado, { antes: 'PENDIENTE', despues: 'PENDIENTE' })
  assert.deepEqual(estado.sincronizadas, ['ex1'])

  await cargarExtra('ex1', { montoExtra: 0, usuarioId: 'u1' })
  const quitar = estado.auditorias.filter((x) => x.entidad === 'Expensa')[1]
  assert.deepEqual(quitar.detalle.montoExtra, { antes: '250.00', despues: '0.00' })
  assert.deepEqual(quitar.detalle.extraConcepto, { antes: 'Pintura Edificio', despues: null })
})

test('saldo a favor: antes del dia de descuento NO cubre el aumento del extra', async () => {
  reiniciar({ saldo: 1000, expensas: [{ ...base }] })
  const r = await cargarExtra('ex1', { montoExtra: 250, concepto: 'Pintura', hoy: dia('2026-11-08') })
  assert.equal(r.saldoFavorAplicado, '0.00')
  assert.deepEqual(exp().pagos, [])
  assert.equal(saldo(), 1000)
  assert.equal(estado.auditorias.filter((x) => x.entidad === 'MovimientoSaldo').length, 0)
})

test('saldo a favor: desde el dia de descuento SI cubre, y queda en la auditoria', async () => {
  reiniciar({ saldo: 1000, expensas: [{ ...base }] })
  const r = await cargarExtra('ex1', { montoExtra: 250, concepto: 'Pintura', hoy: dia('2026-11-09') })
  assert.equal(r.saldoFavorAplicado, '550.00')
  assert.equal(r.estado, 'PAGADA')
  assert.equal(saldo(), 450)
  const m = estado.auditorias.find((x) => x.entidad === 'MovimientoSaldo')
  assert.equal(m.detalle.motivo, 'EXTRA')
  assert.equal(m.detalle.tipo, 'APLICACION_EXPENSA')
})

test('saldo a favor: no cubre si hay una deuda mas antigua, ni si el extra baja, ni sin configuracion antes del 9', async () => {
  reiniciar({ saldo: 1000, expensas: [{ id: 'vieja', periodo: '2026-10', montoTotal: '300' }, { ...base }] })
  assert.equal((await cargarExtra('ex1', { montoExtra: 250, concepto: 'Pintura', hoy: dia('2026-11-20') })).saldoFavorAplicado, '0.00')

  reiniciar({ saldo: 1000, expensas: [{ ...base, montoExtra: '250', extraConcepto: 'Pintura', montoTotal: '550' }] })
  assert.equal((await cargarExtra('ex1', { montoExtra: 100, concepto: 'Pintura', hoy: dia('2026-11-20') })).saldoFavorAplicado, '0.00')

  reiniciar({ config: null, saldo: 1000, expensas: [{ ...base }] })
  assert.equal((await cargarExtra('ex1', { montoExtra: 250, concepto: 'Pintura', hoy: dia('2026-11-08') })).saldoFavorAplicado, '0.00')
  reiniciar({ config: null, saldo: 1000, expensas: [{ ...base }] })
  assert.equal((await cargarExtra('ex1', { montoExtra: 250, concepto: 'Pintura', hoy: dia('2026-11-09') })).saldoFavorAplicado, '550.00')
})
