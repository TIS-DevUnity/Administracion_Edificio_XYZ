// Pruebas del historial de reportes (HU13). Se ejecutan con:
//   node --test server/src/modules/financiero/reportes/historial.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { validarFiltros, construirWhere, mapearRegistro, armarPaginacion } = require('./historial.service')

const rechaza = (query, codigo) =>
  assert.throws(
    () => validarFiltros(query),
    (err) => err.status === 400 && err.codigo === codigo
  )

const detalles = (where) => (where.AND ?? []).map((c) => c.detalle ?? c.OR?.map((o) => o.detalle))

test('mapear: solo los campos pedidos, sin email ni ip', () => {
  const fila = {
    id: 'a1',
    usuarioId: 'u1',
    ip: '10.0.0.5',
    createdAt: new Date('2026-11-17T15:30:00.000Z'),
    detalle: { tipo: 'MOROSOS', formato: 'PDF', resultado: 'EXITOSO', desde: '2026-01-01', hasta: '2026-10-31', orden: 'monto' },
    usuario: { id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@correo.com' }
  }
  const r = mapearRegistro(fila)
  assert.deepEqual(r, {
    id: 'a1',
    tipo: 'MOROSOS',
    formato: 'PDF',
    resultado: 'EXITOSO',
    desde: '2026-01-01',
    hasta: '2026-10-31',
    usuario: { id: 'u1', nombre: 'Ana Pérez' },
    fecha: '2026-11-17T15:30:00.000Z'
  })
  assert.ok(!('ip' in r) && !('email' in r.usuario))
})

test('mapear: detalle vacio o sin usuario no rompe', () => {
  const r = mapearRegistro({ id: 'b2', createdAt: '2026-11-17T10:00:00.000Z', detalle: null, usuario: null })
  assert.deepEqual(r, { id: 'b2', tipo: null, formato: null, resultado: null, desde: null, hasta: null, usuario: null, fecha: '2026-11-17T10:00:00.000Z' })
})

test('mapear: un fallido conserva el resultado y no filtra el mensaje de error', () => {
  const r = mapearRegistro({
    id: 'c3',
    createdAt: new Date('2026-11-17T10:00:00Z'),
    detalle: { tipo: 'BALANCE_GENERAL', formato: 'EXCEL', resultado: 'FALLIDO', error: 'detalle interno', desde: null, hasta: null },
    usuario: { id: 'u2', nombre: 'Luis', apellido: '' }
  })
  assert.equal(r.resultado, 'FALLIDO')
  assert.equal(r.usuario.nombre, 'Luis')
  assert.ok(!JSON.stringify(r).includes('detalle interno'))
})

test('filtros: valores por defecto', () => {
  const f = validarFiltros({})
  assert.deepEqual(
    { ...f, desde: null, hasta: null },
    { tipo: null, formato: null, resultado: null, usuarioId: null, desde: null, hasta: null, incluirVistaPrevia: false, pagina: 1, porPagina: 20 }
  )
})

test('filtros: acepta minusculas y espacios, y los normaliza', () => {
  const f = validarFiltros({ tipo: ' flujo_caja ', formato: 'excel', resultado: 'fallido' })
  assert.deepEqual([f.tipo, f.formato, f.resultado], ['FLUJO_CAJA', 'EXCEL', 'FALLIDO'])
})

test('filtros: codigos estables ante parametros invalidos', () => {
  rechaza({ tipo: 'NOMINA' }, 'TIPO_INVALIDO')
  rechaza({ formato: 'CSV' }, 'FORMATO_INVALIDO')
  rechaza({ resultado: 'OK' }, 'RESULTADO_INVALIDO')
  rechaza({ desde: '2026-13-01' }, 'FECHA_INVALIDA')
  rechaza({ hasta: '2026-02-30' }, 'FECHA_INVALIDA')
  rechaza({ desde: '17/11/2026' }, 'FECHA_INVALIDA')
  rechaza({ desde: '2026-11-10', hasta: '2026-11-01' }, 'RANGO_INVALIDO')
})

test('filtros: texto vacio cuenta como "no enviado"', () => {
  const f = validarFiltros({ tipo: '', formato: '  ', resultado: '', desde: '', hasta: '', usuarioId: '' })
  assert.deepEqual([f.tipo, f.formato, f.resultado, f.desde, f.hasta, f.usuarioId], [null, null, null, null, null, null])
})

test('fechas: dia completo en hora de Bolivia (UTC-4)', () => {
  const f = validarFiltros({ desde: '2026-11-17', hasta: '2026-11-17' })
  assert.equal(f.desde.toISOString(), '2026-11-17T04:00:00.000Z')
  assert.equal(f.hasta.toISOString(), '2026-11-18T03:59:59.999Z')
})

test('paginacion: valores invalidos vuelven al defecto y porPagina tiene tope de 100', () => {
  assert.deepEqual(
    [validarFiltros({ pagina: '0', porPagina: '-5' }).pagina, validarFiltros({ pagina: '0', porPagina: '-5' }).porPagina],
    [1, 20]
  )
  assert.equal(validarFiltros({ pagina: 'abc' }).pagina, 1)
  assert.equal(validarFiltros({ porPagina: '500' }).porPagina, 100)
  assert.equal(validarFiltros({ porPagina: '100' }).porPagina, 100)
  assert.equal(validarFiltros({ pagina: '3', porPagina: '10' }).pagina, 3)
})

test('armarPaginacion: total y totalPaginas', () => {
  assert.deepEqual(armarPaginacion({ pagina: 2, porPagina: 20, total: 45 }), { pagina: 2, porPagina: 20, total: 45, totalPaginas: 3 })
  assert.equal(armarPaginacion({ pagina: 1, porPagina: 20, total: 0 }).totalPaginas, 0)
  assert.equal(armarPaginacion({ pagina: 1, porPagina: 20, total: 20 }).totalPaginas, 1)
})

test('where: siempre limita a entidad ReporteFinanciero y accion GENERATE', () => {
  const w = construirWhere(validarFiltros({}))
  assert.equal(w.entidad, 'ReporteFinanciero')
  assert.equal(w.accion, 'GENERATE')
})

test('where: por defecto excluye la vista previa (solo PDF o EXCEL)', () => {
  const w = construirWhere(validarFiltros({}))
  assert.deepEqual(detalles(w), [[{ path: ['formato'], equals: 'PDF' }, { path: ['formato'], equals: 'EXCEL' }]])
})

test('where: incluirVistaPrevia=true no filtra por formato', () => {
  const w = construirWhere(validarFiltros({ incluirVistaPrevia: 'true' }))
  assert.equal(w.AND, undefined)
})

test('where: formato=JSON explicito si incluye la vista previa, aunque incluirVistaPrevia sea false', () => {
  const w = construirWhere(validarFiltros({ formato: 'JSON', incluirVistaPrevia: 'false' }))
  assert.deepEqual(detalles(w), [{ path: ['formato'], equals: 'JSON' }])
})

test('where: formato explicito manda sobre incluirVistaPrevia', () => {
  const w = construirWhere(validarFiltros({ formato: 'PDF', incluirVistaPrevia: 'true' }))
  assert.deepEqual(detalles(w), [{ path: ['formato'], equals: 'PDF' }])
})

test('where: tipo, resultado y usuario se aplican en la base', () => {
  const w = construirWhere(validarFiltros({ tipo: 'MOROSOS', resultado: 'FALLIDO', usuarioId: 'u9', formato: 'EXCEL' }))
  assert.equal(w.usuarioId, 'u9')
  assert.deepEqual(detalles(w), [
    { path: ['tipo'], equals: 'MOROSOS' },
    { path: ['resultado'], equals: 'FALLIDO' },
    { path: ['formato'], equals: 'EXCEL' }
  ])
})

test('where: rango de fechas sobre createdAt, y sin rango no hay createdAt', () => {
  const conRango = construirWhere(validarFiltros({ desde: '2026-11-01', hasta: '2026-11-30' }))
  assert.equal(conRango.createdAt.gte.toISOString(), '2026-11-01T04:00:00.000Z')
  assert.equal(conRango.createdAt.lte.toISOString(), '2026-12-01T03:59:59.999Z')
  assert.equal(construirWhere(validarFiltros({})).createdAt, undefined)
  assert.deepEqual(Object.keys(construirWhere(validarFiltros({ desde: '2026-11-01' })).createdAt), ['gte'])
})
