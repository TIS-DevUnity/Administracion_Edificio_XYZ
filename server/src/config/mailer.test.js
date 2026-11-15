// Pruebas del envio de bajo nivel de correo (BUG-001). Se ejecutan con:
//   node --test server/src/config/mailer.test.js
// Usan un transporte falso y un entorno inyectado: no hay red ni SMTP.
const test = require('node:test')
const assert = require('node:assert/strict')
const { enviarMensaje, decidirDestino, correosDePruebaPermitidos, CORREO_VALIDO } = require('./mailer')

const mensaje = { to: 'ana@correo.com', subject: 'Aviso', html: '<p>Hola</p>', text: 'Hola' }

function transporteFalso({ falla = null } = {}) {
  const enviados = []
  return {
    enviados,
    async sendMail(datos) {
      if (falla) throw new Error(falla)
      enviados.push(datos)
    }
  }
}

const PRODUCCION = { NODE_ENV: 'production', SMTP_FROM: 'Edificio <no-reply@x.com>' }
const DESARROLLO = { NODE_ENV: 'development', SMTP_REDIRIGIR_A: 'pruebas@x.com', SMTP_USER: 'u' }

test('CORREO_VALIDO acepta usuario@dominio.ext y rechaza lo demas', () => {
  assert.equal(CORREO_VALIDO.test('ana@correo.com'), true)
  assert.equal(CORREO_VALIDO.test('ana@correo'), false)
  assert.equal(CORREO_VALIDO.test('ana correo@x.com'), false)
})

test('la lista de correos de prueba se lee con espacios, mayusculas y vacios', () => {
  assert.deepEqual(correosDePruebaPermitidos({ CORREOS_DE_PRUEBA_PERMITIDOS: ' A@x.com, ,b@Y.com ' }), ['a@x.com', 'b@y.com'])
  assert.deepEqual(correosDePruebaPermitidos({}), [])
})

test('en produccion se escribe al destinatario real, sin cambios y sin destinoReal', async () => {
  const transporte = transporteFalso()
  const r = await enviarMensaje(mensaje, { transporte, env: PRODUCCION })
  assert.deepEqual(r, { estado: 'ENVIADO', motivo: null, destinatario: 'ana@correo.com', destinoReal: null })
  assert.equal(transporte.enviados[0].to, 'ana@correo.com')
  assert.equal(transporte.enviados[0].subject, 'Aviso')
  assert.equal(transporte.enviados[0].from, 'Edificio <no-reply@x.com>')
  assert.equal(transporte.enviados[0].text, 'Hola')
})

test('en produccion la lista de pruebas y la redireccion no cambian nada', async () => {
  const transporte = transporteFalso()
  const env = { ...PRODUCCION, SMTP_REDIRIGIR_A: 'pruebas@x.com', CORREOS_DE_PRUEBA_PERMITIDOS: 'otro@x.com' }
  await enviarMensaje(mensaje, { transporte, env })
  assert.equal(transporte.enviados[0].to, 'ana@correo.com')
})

test('fuera de produccion un correo de la lista de permitidos va a su correo real', async () => {
  const transporte = transporteFalso()
  const env = { ...DESARROLLO, CORREOS_DE_PRUEBA_PERMITIDOS: 'x@y.com, ANA@correo.com' }
  const r = await enviarMensaje(mensaje, { transporte, env })
  assert.equal(r.estado, 'ENVIADO')
  assert.equal(r.destinoReal, 'ana@correo.com')
  assert.equal(transporte.enviados[0].to, 'ana@correo.com')
  assert.equal(transporte.enviados[0].subject, 'Aviso')
})

test('fuera de produccion, uno que no esta en la lista se redirige y el asunto dice para quien era', async () => {
  const transporte = transporteFalso()
  const r = await enviarMensaje(mensaje, { transporte, env: DESARROLLO })
  assert.equal(r.estado, 'ENVIADO')
  assert.equal(r.destinatario, 'ana@correo.com')
  assert.equal(r.destinoReal, 'pruebas@x.com')
  assert.equal(transporte.enviados[0].to, 'pruebas@x.com')
  assert.equal(transporte.enviados[0].subject, '[PRUEBA - para ana@correo.com] Aviso')
})

test('fuera de produccion sin redireccion ni lista, no se envia nada y se omite', async () => {
  const transporte = transporteFalso()
  const r = await enviarMensaje(mensaje, { transporte, env: { NODE_ENV: 'development' } })
  assert.equal(r.estado, 'OMITIDO')
  assert.match(r.motivo, /SMTP_REDIRIGIR_A/)
  assert.equal(transporte.enviados.length, 0)
})

test('NODE_ENV vacio o sin definir se trata como fuera de produccion', () => {
  assert.equal(decidirDestino('ana@correo.com', {}).enviar, false)
  assert.equal(decidirDestino('ana@correo.com', { NODE_ENV: '' }).enviar, false)
})

test('una redireccion que no es un correo valido omite el envio', async () => {
  const transporte = transporteFalso()
  const r = await enviarMensaje(mensaje, { transporte, env: { NODE_ENV: 'development', SMTP_REDIRIGIR_A: 'no-es-correo' } })
  assert.equal(r.estado, 'OMITIDO')
  assert.match(r.motivo, /SMTP_REDIRIGIR_A no es un correo valido/)
  assert.equal(transporte.enviados.length, 0)
})

test('sin correo o con correo no valido se omite sin tocar el transporte', async () => {
  const transporte = transporteFalso()
  for (const to of [undefined, null, '', '   ']) {
    const r = await enviarMensaje({ ...mensaje, to }, { transporte, env: PRODUCCION })
    assert.equal(r.estado, 'OMITIDO')
    assert.match(r.motivo, /no tiene correo/)
  }
  const invalido = await enviarMensaje({ ...mensaje, to: 'ana@correo' }, { transporte, env: PRODUCCION })
  assert.equal(invalido.estado, 'OMITIDO')
  assert.match(invalido.motivo, /no es valido/)
  assert.equal(invalido.destinatario, 'ana@correo')
  assert.equal(transporte.enviados.length, 0)
})

test('sin SMTP configurado se omite con ese motivo', async () => {
  const r = await enviarMensaje(mensaje, { transporte: null, env: PRODUCCION })
  assert.equal(r.estado, 'OMITIDO')
  assert.match(r.motivo, /SMTP\) no esta configurado/)
})

test('si el servidor de correo falla, el resultado es FALLIDO con el motivo y no lanza', async () => {
  const r = await enviarMensaje(mensaje, { transporte: transporteFalso({ falla: 'conexion rechazada' }), env: PRODUCCION })
  assert.equal(r.estado, 'FALLIDO')
  assert.match(r.motivo, /conexion rechazada/)
  assert.equal(r.destinatario, 'ana@correo.com')
})
