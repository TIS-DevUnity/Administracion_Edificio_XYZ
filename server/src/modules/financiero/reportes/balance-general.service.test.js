// Pruebas del servicio del balance general con la base y el saldo del edificio simulados. Se ejecutan con:
//   node --test server/src/modules/financiero/reportes/balance-general.service.test.js
// Comprueban que "hasta" llega al saldo del edificio, que sin "hasta" nada cambia y que la auditoria registra la fecha de corte.
const test = require('node:test')
const assert = require('node:assert/strict')

const llamadasSaldo = []
const registros = []
let consultasPrisma = 0

function simular(ruta, exports) {
  const resuelta = require.resolve(ruta)
  require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports }
}

simular('../../../config/prisma', {
  anticipoSalarial: { findMany: async () => (consultasPrisma++, []) },
  nomina: { aggregate: async () => (consultasPrisma++, { _sum: { sueldoNeto: null }, _count: { _all: 0 } }) }
})
simular('../saldo-edificio/saldo-edificio.service', {
  obtener: async (args) => {
    llamadasSaldo.push(args)
    return {
      saldoActual: args.hasta ? '111.00' : '999.00',
      pendienteDeCobro: { deudaPendienteDeCobro: '50.00', expensasPendientes: 2, saldoAFavorDeResidentes: '10.00' }
    }
  }
})
simular('./registro-generacion.service', {
  registrarGeneracion: async (datos) => registros.push(datos),
  usuarioGenerador: async () => null
})

const { balanceGeneral, generar } = require('./balance-general.service')
const { NOTA, NOTA_FECHA_CORTE } = require('./balance-general.util')
const { fechaEnZona } = require('../expensas/mora.util')

const hoy = () => fechaEnZona(new Date())
const enDias = (n) => fechaEnZona(new Date(Date.now() + n * 86400000))
const efectivoDe = (b) => b.activos.grupos[0].lineas[0].monto

test.beforeEach(() => {
  llamadasSaldo.length = 0
  registros.length = 0
  consultasPrisma = 0
})

test('sin hasta: pide el saldo como siempre, balance a hoy y auditoria con usoHasta=false', async () => {
  const { datos } = await generar({ formato: 'JSON', usuarioId: 'u1', ip: '1.1.1.1' })
  assert.deepEqual(llamadasSaldo, [{ porPagina: 1 }]) // sin "hasta"
  assert.equal(efectivoDe(datos), '999.00')
  assert.equal(datos.fechaCorte, hoy())
  assert.equal(datos.nota, NOTA)
  assert.ok(!('fechaEmision' in datos))
  assert.equal(registros.length, 1)
  assert.equal(registros[0].extra.usoHasta, false)
  assert.equal(registros[0].extra.fechaCorte, hoy())
  assert.equal(registros[0].error ?? null, null)
})

test('hasta vacio equivale a no enviarlo', async () => {
  const { datos } = await generar({ formato: 'JSON', hasta: '', usuarioId: 'u1', ip: 'x' })
  assert.deepEqual(llamadasSaldo, [{ porPagina: 1 }])
  assert.equal(datos.fechaCorte, hoy())
  assert.equal(registros[0].extra.usoHasta, false)
})

test('con hasta: el efectivo sale del saldo a esa fecha; el resto sigue a la fecha de emision', async () => {
  const { datos } = await generar({ formato: 'JSON', hasta: '2026-10-31', usuarioId: 'u1', ip: 'x' })
  assert.deepEqual(llamadasSaldo, [{ hasta: '2026-10-31', porPagina: 1 }])
  assert.equal(efectivoDe(datos), '111.00')
  assert.equal(datos.fechaCorte, '2026-10-31')
  assert.equal(datos.fechaEmision, hoy())
  assert.equal(datos.nota, `${NOTA}. ${NOTA_FECHA_CORTE}`)
  // Cuentas por cobrar y saldo a favor no dependen de "hasta": son los del saldo del edificio actual.
  assert.equal(datos.activos.grupos[1].lineas[0].monto, '50.00')
  assert.equal(datos.pasivos.grupos[0].lineas[0].monto, '10.00')
  assert.equal(datos.verificacion.coincide, true)
  assert.equal(registros.length, 1)
  assert.equal(registros[0].desde, '2026-10-31')
  assert.equal(registros[0].hasta, '2026-10-31')
  assert.deepEqual(registros[0].extra, { fechaCorte: '2026-10-31', usoHasta: true })
})

test('con hasta en PDF y Excel: el archivo se llama balance-general-<fechaCorte>', async () => {
  const pdf = await generar({ formato: 'PDF', hasta: '2026-09-30', usuarioId: 'u1', ip: 'x' })
  assert.equal(pdf.nombreArchivo, 'balance-general-2026-09-30.pdf')
  assert.equal(pdf.archivo.subarray(0, 5).toString(), '%PDF-')
  const excel = await generar({ formato: 'EXCEL', hasta: '2026-09-30', usuarioId: 'u1', ip: 'x' })
  assert.equal(excel.nombreArchivo, 'balance-general-2026-09-30.xlsx')
  assert.equal(registros.length, 2)
  assert.deepEqual(registros.map((r) => r.formato), ['PDF', 'EXCEL'])
})

test('hasta de hoy es valido', async () => {
  const { datos } = await generar({ formato: 'JSON', hasta: hoy(), usuarioId: 'u1', ip: 'x' })
  assert.equal(datos.fechaCorte, hoy())
  assert.deepEqual(llamadasSaldo, [{ hasta: hoy(), porPagina: 1 }])
})

test('hasta futura: 400 FECHA_FUTURA, sin consultar nada y con la falla en la auditoria', async () => {
  const futura = enDias(2)
  await assert.rejects(generar({ formato: 'JSON', hasta: futura, usuarioId: 'u1', ip: 'x' }), { status: 400, codigo: 'FECHA_FUTURA' })
  assert.equal(llamadasSaldo.length, 0)
  assert.equal(consultasPrisma, 0)
  assert.equal(registros.length, 1)
  assert.ok(registros[0].error)
  assert.equal(registros[0].extra.usoHasta, true)
})

test('hasta con formato invalido: 400 FECHA_INVALIDA, sin consultar nada', async () => {
  for (const malo of ['17/11/2026', 'ayer', '2026-13-01', '2026-02-31']) {
    await assert.rejects(balanceGeneral({ hasta: malo }), { status: 400, codigo: 'FECHA_INVALIDA' })
  }
  assert.equal(llamadasSaldo.length, 0)
  assert.equal(consultasPrisma, 0)
})
