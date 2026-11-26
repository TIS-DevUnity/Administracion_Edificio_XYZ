// Pruebas de las validaciones de empleados (HU8). Se ejecutan con:
//   node --test server/src/modules/financiero/empleados/empleados.test.js
// Son funciones puras: no tocan la base de datos.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizarTexto,
  normalizarDocumento,
  normalizarTelefono,
  parsearFechaIngreso,
  validarDatosAlta,
  validarDatosEdicion,
  normalizarEstado,
  normalizarFiltroEstado,
  normalizarBusqueda,
  empleadoParaCliente,
  diferenciasEmpleado
} = require('./empleados.util')

const HOY = '2026-10-31'
const VALIDOS = {
  nombres: '  Juan   Carlos ',
  apellidos: ' Mamani  Quispe',
  documento: ' 1234567  lp ',
  cargo: '  Conserje ',
  fechaIngreso: '2026-03-01',
  telefono: ' +591 71234567 ',
  sueldoBase: '2500.50'
}

function rechaza(fn, status, codigo) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, status)
    if (codigo) assert.equal(err.codigo, codigo)
    return true
  })
}

test('alta valida: normaliza los textos y convierte sueldo y fecha', () => {
  const v = validarDatosAlta(VALIDOS, HOY)
  assert.equal(v.nombres, 'Juan Carlos')
  assert.equal(v.apellidos, 'Mamani Quispe')
  assert.equal(v.documento, '1234567 LP')
  assert.equal(v.cargo, 'Conserje')
  assert.equal(v.telefono, '+591 71234567')
  assert.equal(v.sueldoBase.toFixed(2), '2500.50')
  assert.equal(v.fechaIngreso.toISOString(), '2026-03-01T00:00:00.000Z')
})

test('alta: avisa de todos los campos faltantes o vacios a la vez', () => {
  assert.throws(
    () => validarDatosAlta({ nombres: '   ', apellidos: 'Perez', documento: '', sueldoBase: 100 }, HOY),
    (err) => {
      assert.equal(err.status, 400)
      assert.equal(err.codigo, 'CAMPOS_OBLIGATORIOS')
      assert.deepEqual(err.detalle.campos, ['nombres', 'documento', 'cargo', 'fechaIngreso', 'telefono'])
      return true
    }
  )
  rechaza(() => validarDatosAlta(undefined, HOY), 400, 'CAMPOS_OBLIGATORIOS')
})

test('sueldoBase: rechaza cero, negativo, no numerico, mas de 2 decimales y exceso', () => {
  for (const sueldo of [0, '0', -5, 'abc', '10.999', true, '100000000']) {
    rechaza(() => validarDatosAlta({ ...VALIDOS, sueldoBase: sueldo }, HOY), 400)
  }
  assert.equal(validarDatosAlta({ ...VALIDOS, sueldoBase: 0.01 }, HOY).sueldoBase.toFixed(2), '0.01')
})

test('fechaIngreso: formato, dia inexistente, anterior a 1900 y futura', () => {
  for (const fecha of ['01/03/2026', '2026-3-1', '2026-02-30', '2026-13-01', 'ayer', 20260301, '1899-12-31']) {
    rechaza(() => parsearFechaIngreso(fecha, HOY), 400, 'FECHA_INGRESO_INVALIDA')
  }
  rechaza(() => parsearFechaIngreso('2026-11-01', HOY), 400, 'FECHA_INGRESO_INVALIDA')
  assert.equal(parsearFechaIngreso(HOY, HOY).toISOString(), '2026-10-31T00:00:00.000Z') // hoy si vale
  assert.equal(parsearFechaIngreso(' 2024-02-29 ', HOY).toISOString(), '2024-02-29T00:00:00.000Z') // bisiesto
})

test('textos: espacios, tipo y largo maximo', () => {
  assert.equal(normalizarTexto('  a   b  ', 'cargo', 10), 'a b')
  rechaza(() => normalizarTexto(42, 'cargo', 10), 400)
  rechaza(() => normalizarTexto('   ', 'cargo', 10), 400)
  rechaza(() => normalizarTexto('x'.repeat(11), 'cargo', 10), 400)
})

test('documento: se guarda en mayusculas y valida formato y largo', () => {
  assert.equal(normalizarDocumento('1234567 lp'), '1234567 LP')
  assert.equal(normalizarDocumento(' 1234567  LP '), normalizarDocumento('1234567 lp'))
  assert.equal(normalizarDocumento('12.345-678'), '12.345-678')
  for (const doc of ['12', 'x'.repeat(21), '123@456', '12/34', 99999999]) {
    rechaza(() => normalizarDocumento(doc), 400)
  }
})

test('telefono: formato y minimo de digitos', () => {
  assert.equal(normalizarTelefono('(591)  71234567'), '(591) 71234567')
  for (const tel of ['12345', 'abc12345678', '+++', '1'.repeat(21), 71234567]) {
    rechaza(() => normalizarTelefono(tel), 400)
  }
})

test('edicion: exige al menos un campo y valida solo los enviados', () => {
  rechaza(() => validarDatosEdicion({}, HOY), 400, 'SIN_CAMBIOS')
  rechaza(() => validarDatosEdicion({ otro: 1 }, HOY), 400, 'SIN_CAMBIOS')
  const v = validarDatosEdicion({ cargo: '  Guardia ', sueldoBase: 3000 }, HOY)
  assert.deepEqual(Object.keys(v), ['cargo', 'sueldoBase'])
  assert.equal(v.cargo, 'Guardia')
  // un campo enviado vacio es un error, no "sin cambio"
  rechaza(() => validarDatosEdicion({ cargo: '  ' }, HOY), 400, 'CAMPOS_OBLIGATORIOS')
  rechaza(() => validarDatosEdicion({ sueldoBase: -1 }, HOY), 400)
  rechaza(() => validarDatosEdicion({ fechaIngreso: '2027-01-01' }, HOY), 400, 'FECHA_INGRESO_INVALIDA')
})

test('estado y filtros del listado', () => {
  assert.equal(normalizarEstado(' inactivo '), 'INACTIVO')
  rechaza(() => normalizarEstado('BAJA'), 400)
  rechaza(() => normalizarEstado(undefined), 400)
  assert.equal(normalizarFiltroEstado(undefined), null)
  assert.equal(normalizarFiltroEstado(''), null)
  assert.equal(normalizarFiltroEstado('activo'), 'ACTIVO')
  rechaza(() => normalizarFiltroEstado('x'), 400)
  assert.equal(normalizarBusqueda('  juan   perez '), 'juan perez')
  assert.equal(normalizarBusqueda('   '), null)
  rechaza(() => normalizarBusqueda('x'.repeat(101)), 400)
})

test('diferencias: guarda sueldoBase anterior y nuevo solo si cambia', () => {
  const base = {
    id: 'e1', nombres: 'Juan', apellidos: 'Perez', documento: '1', cargo: 'Conserje',
    fechaIngreso: new Date('2026-03-01T00:00:00Z'), telefono: '71234567', sueldoBase: '2500', estado: 'ACTIVO',
    createdAt: new Date(), updatedAt: new Date()
  }
  const cambiado = { ...base, sueldoBase: '2800.5', cargo: 'Jefe' }
  assert.deepEqual(diferenciasEmpleado(base, cambiado, ['sueldoBase', 'cargo', 'telefono']), {
    sueldoBase: { antes: '2500.00', despues: '2800.50' },
    cargo: { antes: 'Conserje', despues: 'Jefe' }
  })
  assert.deepEqual(diferenciasEmpleado(base, { ...base }, ['sueldoBase']), {})
  assert.equal(empleadoParaCliente(base).fechaIngreso, '2026-03-01')
})
