// Pruebas del envio de WhatsApp con Twilio (BUG-002). Se ejecutan con:
//   node --test server/src/config/whatsapp.test.js
// Usan un fetch falso y un entorno inyectado: no hay red ni credenciales reales.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizarTelefono,
  numerosPermitidos,
  decidirDestinoWhatsApp,
  whatsappConfigurado,
  proveedor,
  variablesTwilioFaltantes,
  enviarWhatsApp,
  MAX_MENSAJE_WHATSAPP
} = require('./whatsapp')

const TWILIO = {
  WHATSAPP_PROVIDER: 'twilio',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'secreto',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886'
}
const PRODUCCION = { ...TWILIO, NODE_ENV: 'production' }
const DESARROLLO = { ...TWILIO, NODE_ENV: 'development', WHATSAPP_NUMEROS_PERMITIDOS: '+591 70123456, 61234567' }

function fetchFalso({ ok = true, status = 201, json = {}, lanza = null } = {}) {
  const llamadas = []
  const fn = async (url, opciones) => {
    llamadas.push({ url, opciones })
    if (lanza) throw new Error(lanza)
    return { ok, status, json: async () => json }
  }
  fn.llamadas = llamadas
  return fn
}

// --- Normalizacion a E.164 ---

test('celulares bolivianos: con o sin codigo de pais, espacios o 00 se normalizan a +591', () => {
  for (const entrada of ['70123456', '+591 70123456', '+591-701-23456', '00591 70123456', '591 70123456', '(+591) 7012 3456']) {
    assert.deepEqual(normalizarTelefono(entrada), { valido: true, e164: '+59170123456' }, entrada)
  }
  assert.equal(normalizarTelefono('61234567').e164, '+59161234567')
})

test('los fijos bolivianos y los numeros bolivianos mal formados se rechazan', () => {
  for (const entrada of ['22345678', '+59122345678', '32345678', '42345678']) {
    const r = normalizarTelefono(entrada)
    assert.equal(r.valido, false, entrada)
    assert.match(r.motivo, /fijo/)
  }
  assert.match(normalizarTelefono('+5917012345').motivo, /8 digitos/)
  assert.match(normalizarTelefono('+591701234567').motivo, /8 digitos/)
})

test('numeros internacionales validos se aceptan con el +', () => {
  assert.equal(normalizarTelefono('+1 415 555 2671').e164, '+14155552671')
  assert.equal(normalizarTelefono('+34 612 345 678').e164, '+34612345678')
  assert.equal(normalizarTelefono('0034612345678').e164, '+34612345678')
})

test('un numero extranjero sin + o con forma invalida se rechaza', () => {
  assert.match(normalizarTelefono('4155552671').motivo, /codigo de pais/)
  assert.match(normalizarTelefono('+0123456789').motivo, /internacional/)
  assert.match(normalizarTelefono('+1234567').motivo, /internacional/)
  assert.match(normalizarTelefono('+1234567890123456').motivo, /internacional/)
  assert.match(normalizarTelefono('abc').motivo, /solo admite numeros/)
  assert.match(normalizarTelefono('+591 7012-abc').motivo, /solo admite numeros/)
})

test('un telefono vacio o que no es texto no tiene telefono registrado', () => {
  for (const entrada of [undefined, null, '', '   ', 12345678]) {
    const r = normalizarTelefono(entrada)
    assert.equal(r.valido, false)
    assert.match(r.motivo, /no tiene telefono registrado/)
  }
})

// --- Configuracion y lista de pruebas ---

test('WhatsApp solo esta configurado con proveedor twilio y sus tres credenciales', () => {
  assert.equal(whatsappConfigurado(TWILIO), true)
  assert.equal(whatsappConfigurado({}), false)
  assert.equal(whatsappConfigurado({ ...TWILIO, WHATSAPP_PROVIDER: 'ninguno' }), false)
  assert.equal(whatsappConfigurado({ ...TWILIO, WHATSAPP_PROVIDER: 'otro' }), false)
  assert.equal(whatsappConfigurado({ ...TWILIO, TWILIO_AUTH_TOKEN: '  ' }), false)
  assert.equal(proveedor({}), 'ninguno')
  assert.equal(proveedor({ WHATSAPP_PROVIDER: ' Twilio ' }), 'twilio')
  assert.deepEqual(variablesTwilioFaltantes({ TWILIO_ACCOUNT_SID: 'x' }), ['TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'])
})

test('la lista de numeros permitidos se normaliza y descarta los no validos', () => {
  assert.deepEqual(numerosPermitidos({ WHATSAPP_NUMEROS_PERMITIDOS: ' +591 70123456, 61234567, xx, 22345678 ' }), [
    '+59170123456',
    '+59161234567'
  ])
  assert.deepEqual(numerosPermitidos({}), [])
})

test('en produccion se envia al numero real sin destinoReal; fuera, solo a los permitidos', () => {
  assert.deepEqual(decidirDestinoWhatsApp('+59170000000', { NODE_ENV: 'production' }), { enviar: true, destinoReal: null })
  assert.deepEqual(decidirDestinoWhatsApp('+59170123456', DESARROLLO), { enviar: true, destinoReal: '+59170123456' })
  assert.equal(decidirDestinoWhatsApp('+59170000000', DESARROLLO).enviar, false)
  assert.equal(decidirDestinoWhatsApp('+59170000000', { NODE_ENV: '' }).enviar, false)
  assert.equal(decidirDestinoWhatsApp('+59170000000', {}).enviar, false)
})

// --- Envio ---

test('con proveedor ninguno o sin credenciales se omite con "WhatsApp no configurado" y no llama a la red', async () => {
  const fetch = fetchFalso()
  const entornos = [{ NODE_ENV: 'production' }, { ...PRODUCCION, WHATSAPP_PROVIDER: 'ninguno' }, { ...PRODUCCION, TWILIO_ACCOUNT_SID: '' }]
  for (const env of entornos) {
    const r = await enviarWhatsApp({ to: '70123456', body: 'Hola' }, { env, fetch })
    assert.equal(r.estado, 'OMITIDO')
    assert.equal(r.motivo, 'WhatsApp no configurado')
  }
  assert.equal(fetch.llamadas.length, 0)
})

test('sin telefono o con telefono no valido se omite con el motivo', async () => {
  const fetch = fetchFalso()
  const sin = await enviarWhatsApp({ to: null, body: 'Hola' }, { env: PRODUCCION, fetch })
  assert.equal(sin.estado, 'OMITIDO')
  assert.match(sin.motivo, /no tiene telefono/)
  const fijo = await enviarWhatsApp({ to: '22345678', body: 'Hola' }, { env: PRODUCCION, fetch })
  assert.equal(fijo.estado, 'OMITIDO')
  assert.match(fijo.motivo, /fijo/)
  assert.equal(fijo.destinatario, null)
  assert.equal(fetch.llamadas.length, 0)
})

test('el mensaje admite hasta 1024 caracteres y falla si pasa de ahi sin llamar a la red', async () => {
  const fetch = fetchFalso()
  const justo = await enviarWhatsApp({ to: '70123456', body: 'a'.repeat(MAX_MENSAJE_WHATSAPP) }, { env: PRODUCCION, fetch })
  assert.equal(justo.estado, 'ENVIADO')
  const pasado = await enviarWhatsApp({ to: '70123456', body: 'a'.repeat(MAX_MENSAJE_WHATSAPP + 1) }, { env: PRODUCCION, fetch })
  assert.equal(pasado.estado, 'FALLIDO')
  assert.match(pasado.motivo, /1024 caracteres \(tiene 1025\)/)
  assert.equal(fetch.llamadas.length, 1)
})

test('en produccion envia a Twilio con las credenciales, el From y el To en formato whatsapp:', async () => {
  const fetch = fetchFalso()
  const r = await enviarWhatsApp({ to: '+591 70123456', body: 'Aviso\n\nTexto' }, { env: PRODUCCION, fetch })
  assert.deepEqual(r, { estado: 'ENVIADO', motivo: null, destinatario: '+59170123456', destinoReal: null })

  const { url, opciones } = fetch.llamadas[0]
  assert.equal(url, 'https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json')
  assert.equal(opciones.method, 'POST')
  assert.equal(opciones.headers.Authorization, `Basic ${Buffer.from('ACtest:secreto').toString('base64')}`)
  const form = new URLSearchParams(opciones.body)
  assert.equal(form.get('From'), 'whatsapp:+14155238886')
  assert.equal(form.get('To'), 'whatsapp:+59170123456')
  assert.equal(form.get('Body'), 'Aviso\n\nTexto')
})

test('TWILIO_WHATSAPP_FROM sin el prefijo whatsapp: tambien funciona', async () => {
  const fetch = fetchFalso()
  await enviarWhatsApp({ to: '70123456', body: 'Hola' }, { env: { ...PRODUCCION, TWILIO_WHATSAPP_FROM: '+14155238886' }, fetch })
  assert.equal(new URLSearchParams(fetch.llamadas[0].opciones.body).get('From'), 'whatsapp:+14155238886')
})

test('fuera de produccion solo envia a los numeros permitidos y deja el destinoReal', async () => {
  const fetch = fetchFalso()
  const permitido = await enviarWhatsApp({ to: '70123456', body: 'Hola' }, { env: DESARROLLO, fetch })
  assert.deepEqual(permitido, { estado: 'ENVIADO', motivo: null, destinatario: '+59170123456', destinoReal: '+59170123456' })

  const bloqueado = await enviarWhatsApp({ to: '71111111', body: 'Hola' }, { env: DESARROLLO, fetch })
  assert.equal(bloqueado.estado, 'OMITIDO')
  assert.equal(bloqueado.destinatario, '+59171111111')
  assert.match(bloqueado.motivo, /WHATSAPP_NUMEROS_PERMITIDOS/)
  assert.equal(fetch.llamadas.length, 1)
})

test('si Twilio responde con error o la red falla, queda FALLIDO con el motivo y sin credenciales', async () => {
  const rechazo = await enviarWhatsApp(
    { to: '70123456', body: 'Hola' },
    { env: PRODUCCION, fetch: fetchFalso({ ok: false, status: 400, json: { code: 21608, message: 'Numero no autorizado' } }) }
  )
  assert.equal(rechazo.estado, 'FALLIDO')
  assert.match(rechazo.motivo, /Twilio respondio 400: Numero no autorizado \(codigo 21608\)/)
  assert.equal(rechazo.destinatario, '+59170123456')

  const caido = await enviarWhatsApp({ to: '70123456', body: 'Hola' }, { env: PRODUCCION, fetch: fetchFalso({ lanza: 'ECONNRESET' }) })
  assert.equal(caido.estado, 'FALLIDO')
  assert.match(caido.motivo, /ECONNRESET/)

  for (const r of [rechazo, caido]) {
    assert.equal(JSON.stringify(r).includes('secreto'), false)
    assert.equal(JSON.stringify(r).includes('ACtest'), false)
  }
})
