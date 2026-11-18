// Pruebas del middleware de autorizacion por rol. Se ejecutan con:
//   node --test server/src/middlewares/rbac.middleware.test.js
// No tocan la base de datos: usan un req/res simulados.
const test = require('node:test')
const assert = require('node:assert/strict')
const { autorizar, CODIGO_SIN_PERMISO } = require('./rbac.middleware')

function ejecutar(middleware, usuario) {
  const res = {
    statusCode: null,
    cuerpo: null,
    status(codigo) {
      this.statusCode = codigo
      return this
    },
    json(cuerpo) {
      this.cuerpo = cuerpo
      return this
    }
  }
  let siguio = false
  middleware({ usuario }, res, () => {
    siguio = true
  })
  return { res, siguio }
}

test('rol no permitido: 403 con el mismo mensaje y el codigo SIN_PERMISO', () => {
  const { res, siguio } = ejecutar(autorizar('ADMINISTRADOR', 'DIRECTORIO'), { rol: 'CONSULTA' })
  assert.equal(siguio, false)
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.cuerpo, { error: 'No tiene permisos para esta accion', codigo: 'SIN_PERMISO' })
  assert.equal(CODIGO_SIN_PERMISO, 'SIN_PERMISO')
})

test('el mensaje "error" del 403 no cambia (los clientes que lo leen siguen funcionando)', () => {
  const { res } = ejecutar(autorizar('ADMINISTRADOR'), { rol: 'DIRECTORIO' })
  assert.equal(res.cuerpo.error, 'No tiene permisos para esta accion')
})

test('rol permitido: continua sin responder', () => {
  const { res, siguio } = ejecutar(autorizar('ADMINISTRADOR', 'DIRECTORIO'), { rol: 'DIRECTORIO' })
  assert.equal(siguio, true)
  assert.equal(res.statusCode, null)
  assert.equal(res.cuerpo, null)
})

test('sin usuario autenticado: 401 sin codigo (no cambia)', () => {
  const { res, siguio } = ejecutar(autorizar('ADMINISTRADOR'), undefined)
  assert.equal(siguio, false)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.cuerpo, { error: 'No autenticado' })
})
