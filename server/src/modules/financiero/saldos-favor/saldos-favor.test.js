// Pruebas del armado del listado de saldos a favor. Se ejecutan con:
//   node --test server/src/modules/financiero/saldos-favor/saldos-favor.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const { armarSaldosFavor, totalSaldosFavor, responsableDe } = require('./saldos-favor.util')

const persona = (id, nombre) => ({ id, nombre, apellido: 'Perez', ci: `${id}00`, email: null, telefono: null })

test('arma una fila por inmueble con sus totales y la persona responsable', () => {
  const filas = armarSaldosFavor({
    saldos: [{ inmuebleId: 'i1', _sum: { monto: '300.00' } }],
    abonos: [{ inmuebleId: 'i1', _sum: { monto: '1000.00' }, _max: { createdAt: new Date('2026-11-03T21:37:43.631Z') } }],
    usos: [{ inmuebleId: 'i1', _sum: { monto: '-700.00' } }],
    inmuebles: [
      {
        id: 'i1',
        codigo: '4B',
        piso: '4',
        clase: 'DEPARTAMENTO',
        ocupaciones: [{ esPropietario: true, fechaInicio: '2026-01-01', copropietario: persona('c1', 'Ana') }]
      }
    ]
  })

  assert.equal(filas.length, 1)
  assert.deepEqual(filas[0], {
    inmuebleId: 'i1',
    codigo: '4B',
    piso: '4',
    clase: 'DEPARTAMENTO',
    responsable: { ...persona('c1', 'Ana'), esPropietario: true },
    saldoFavor: '300.00',
    totalAbonado: '1000.00',
    totalAplicado: '700.00',
    ultimoAbono: new Date('2026-11-03T21:37:43.631Z')
  })
})

test('sin usos el total aplicado es 0 y sin ocupante el responsable es null', () => {
  const [fila] = armarSaldosFavor({
    saldos: [{ inmuebleId: 'i1', _sum: { monto: '50' } }],
    abonos: [{ inmuebleId: 'i1', _sum: { monto: '50' }, _max: { createdAt: new Date('2026-11-01T00:00:00Z') } }],
    usos: [],
    inmuebles: [{ id: 'i1', codigo: '1A', piso: null, clase: 'DEPARTAMENTO', ocupaciones: [] }]
  })

  assert.equal(fila.totalAplicado, '0.00')
  assert.equal(fila.saldoFavor, '50.00')
  assert.equal(fila.responsable, null)
})

test('ordena por codigo de inmueble de forma natural (2A antes que 10A)', () => {
  const inmueble = (id, codigo) => ({ id, codigo, piso: null, clase: 'DEPARTAMENTO', ocupaciones: [] })
  const filas = armarSaldosFavor({
    saldos: [
      { inmuebleId: 'a', _sum: { monto: '1' } },
      { inmuebleId: 'b', _sum: { monto: '1' } }
    ],
    abonos: [],
    usos: [],
    inmuebles: [inmueble('a', '10A'), inmueble('b', '2A')]
  })

  assert.deepEqual(filas.map((fila) => fila.codigo), ['2A', '10A'])
})

test('el responsable es el propietario; si no hay, el inquilino mas antiguo', () => {
  const inquilino = { esPropietario: false, fechaInicio: '2026-02-01', copropietario: persona('c2', 'Luis') }
  const propietario = { esPropietario: true, fechaInicio: '2026-03-01', copropietario: persona('c1', 'Ana') }

  assert.equal(responsableDe([inquilino, propietario]).id, 'c1')
  assert.equal(responsableDe([inquilino]).esPropietario, false)
  assert.equal(responsableDe([]), null)
})

test('suma todos los saldos con decimales exactos', () => {
  assert.equal(totalSaldosFavor([{ saldoFavor: '0.10' }, { saldoFavor: '0.20' }, { saldoFavor: '300.00' }]), '300.30')
  assert.equal(totalSaldosFavor([]), '0.00')
})
