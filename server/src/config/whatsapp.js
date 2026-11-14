// Envio de mensajes de WhatsApp (HU10) con Twilio, usando el fetch nativo de Node (sin dependencias).
// Igual que mailer.js, no registra nada ni lanza errores: quien la llama guarda el resultado.

const MAX_MENSAJE_WHATSAPP = 1024
const TIMEOUT_TWILIO_MS = 15000
const PROVEEDORES = ['twilio', 'ninguno']

/** Proveedor elegido en WHATSAPP_PROVIDER; sin definir o con otro valor es 'ninguno'. */
function proveedor(env = process.env) {
  const valor = (env.WHATSAPP_PROVIDER || '').trim().toLowerCase()
  return PROVEEDORES.includes(valor) ? valor : 'ninguno'
}

/** Nombres (nunca valores) de las variables de Twilio que faltan. */
function variablesTwilioFaltantes(env = process.env) {
  return ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'].filter((nombre) => !(env[nombre] || '').trim())
}

/** true si hay un proveedor elegido y con todas sus credenciales. */
function whatsappConfigurado(env = process.env) {
  return proveedor(env) === 'twilio' && variablesTwilioFaltantes(env).length === 0
}

/**
 * Normaliza un telefono a E.164 (+codigo y numero, sin espacios). Devuelve { valido, e164 } o { valido: false, motivo }.
 *  - Bolivia (+591): celular de 8 digitos que empieza con 6 o 7. Un numero de 8 digitos sin codigo de pais se toma
 *    como boliviano. Los fijos bolivianos (empiezan con 2, 3 o 4) no reciben WhatsApp y se rechazan.
 *  - Otros paises: se acepta cualquier numero internacional con forma E.164 (+, codigo de pais que no empieza con 0
 *    y entre 8 y 15 digitos en total). Debe llevar el + (o 00) delante.
 */
function normalizarTelefono(valor) {
  if (typeof valor !== 'string' || !valor.trim()) {
    return { valido: false, motivo: 'El destinatario no tiene telefono registrado' }
  }
  const original = valor.trim()
  let texto = original.replace(/[\s\-.()]/g, '')

  if (texto.startsWith('00')) texto = `+${texto.slice(2)}`
  const conMas = texto.startsWith('+')
  const digitos = conMas ? texto.slice(1) : texto

  if (!/^\d+$/.test(digitos)) {
    return { valido: false, motivo: `El telefono "${original}" no es valido: solo admite numeros` }
  }

  let completo // digitos con codigo de pais
  if (conMas) {
    completo = digitos
  } else if (digitos.length === 8) {
    completo = `591${digitos}`
  } else if (digitos.startsWith('591') && digitos.length === 11) {
    completo = digitos
  } else {
    return { valido: false, motivo: `El telefono "${original}" no es valido: falta el codigo de pais (+)` }
  }

  if (completo.startsWith('591')) {
    const nacional = completo.slice(3)
    if (!/^\d{8}$/.test(nacional)) {
      return { valido: false, motivo: `El telefono "${original}" no es valido: un numero boliviano tiene 8 digitos` }
    }
    if (!/^[67]/.test(nacional)) {
      return {
        valido: false,
        motivo: `El telefono "${original}" no es un celular boliviano (debe empezar con 6 o 7): un fijo no recibe WhatsApp`
      }
    }
    return { valido: true, e164: `+${completo}` }
  }

  if (completo.startsWith('0') || completo.length < 8 || completo.length > 15) {
    return { valido: false, motivo: `El telefono "${original}" no es un numero internacional valido (E.164)` }
  }
  return { valido: true, e164: `+${completo}` }
}

/** Numeros de WHATSAPP_NUMEROS_PERMITIDOS (separados por comas), ya normalizados a E.164; los no validos se ignoran. */
function numerosPermitidos(env = process.env) {
  return (env.WHATSAPP_NUMEROS_PERMITIDOS || '')
    .split(',')
    .map((numero) => normalizarTelefono(numero))
    .filter((r) => r.valido)
    .map((r) => r.e164)
}

/**
 * A donde se envia un WhatsApp dirigido a `e164`:
 *  - Produccion: al numero real.
 *  - Fuera de produccion: solo si esta en WHATSAPP_NUMEROS_PERMITIDOS (no hay redireccion a otro numero);
 *    si no, no se envia.
 * Devuelve { enviar: true, destinoReal } o { enviar: false, motivo }. `destinoReal` solo se informa fuera de produccion.
 */
function decidirDestinoWhatsApp(e164, env = process.env) {
  if (env.NODE_ENV === 'production') return { enviar: true, destinoReal: null }
  if (numerosPermitidos(env).includes(e164)) return { enviar: true, destinoReal: e164 }
  return {
    enviar: false,
    motivo:
      'Fuera de produccion (NODE_ENV distinto de production) y el numero no esta en WHATSAPP_NUMEROS_PERMITIDOS: no se envian mensajes a residentes reales'
  }
}

/** "whatsapp:+14155238886" a partir de un numero con o sin el prefijo "whatsapp:". */
function conPrefijoWhatsapp(numero) {
  const limpio = String(numero).trim().replace(/^whatsapp:/i, '')
  return `whatsapp:${limpio.startsWith('+') ? limpio : `+${limpio}`}`
}

/** Envia un mensaje por la API de Twilio. Devuelve { ok: true } o { ok: false, motivo }. Nunca incluye credenciales. */
async function enviarPorTwilio({ to, body }, { env, fetchFn }) {
  const sid = env.TWILIO_ACCOUNT_SID.trim()
  const token = env.TWILIO_AUTH_TOKEN.trim()
  try {
    const respuesta = await fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: conPrefijoWhatsapp(env.TWILIO_WHATSAPP_FROM),
        To: conPrefijoWhatsapp(to),
        Body: body
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_TWILIO_MS)
    })
    if (respuesta.ok) return { ok: true }

    let detalle = ''
    try {
      const json = await respuesta.json()
      detalle = json?.message ? `${json.message}${json.code ? ` (codigo ${json.code})` : ''}` : ''
    } catch {
      // la respuesta de error no era JSON: se informa solo el estado HTTP
    }
    return { ok: false, motivo: `Twilio respondio ${respuesta.status}${detalle ? `: ${detalle}` : ''}` }
  } catch (err) {
    return { ok: false, motivo: `No se pudo contactar a Twilio: ${err.message}` }
  }
}

/**
 * Envio de bajo nivel de un WhatsApp: comprueba la configuracion, normaliza el telefono, valida el largo, aplica
 * la regla de pruebas fuera de produccion y envia. Devuelve { estado: 'ENVIADO' | 'FALLIDO' | 'OMITIDO', motivo,
 * destinatario, destinoReal }, con `destinatario` = telefono en E.164 usado (null si no era valido).
 *  - OMITIDO: no se intento (WhatsApp no configurado, sin telefono valido, bloqueado fuera de produccion).
 *  - FALLIDO: se intento y fallo, o el mensaje supera 1024 caracteres.
 * `deps` permite inyectar el entorno y `fetch` (pruebas).
 */
async function enviarWhatsApp({ to, body }, deps = {}) {
  const env = deps.env ?? process.env
  const fetchFn = deps.fetch ?? globalThis.fetch
  const resultado = (estado, motivo = null, destinatario = null, destinoReal = null) => ({
    estado,
    motivo,
    destinatario,
    destinoReal
  })

  if (!whatsappConfigurado(env)) return resultado('OMITIDO', 'WhatsApp no configurado')

  const telefono = normalizarTelefono(to)
  if (!telefono.valido) return resultado('OMITIDO', telefono.motivo)

  if (typeof body !== 'string' || !body.trim()) return resultado('FALLIDO', 'El mensaje esta vacio', telefono.e164)
  if (body.length > MAX_MENSAJE_WHATSAPP) {
    return resultado(
      'FALLIDO',
      `El mensaje de WhatsApp no puede superar los ${MAX_MENSAJE_WHATSAPP} caracteres (tiene ${body.length})`,
      telefono.e164
    )
  }

  const destino = decidirDestinoWhatsApp(telefono.e164, env)
  if (!destino.enviar) return resultado('OMITIDO', destino.motivo, telefono.e164)

  const envio = await enviarPorTwilio({ to: telefono.e164, body }, { env, fetchFn })
  return envio.ok
    ? resultado('ENVIADO', null, telefono.e164, destino.destinoReal)
    : resultado('FALLIDO', envio.motivo, telefono.e164, destino.destinoReal)
}

module.exports = {
  MAX_MENSAJE_WHATSAPP,
  proveedor,
  variablesTwilioFaltantes,
  whatsappConfigurado,
  normalizarTelefono,
  numerosPermitidos,
  decidirDestinoWhatsApp,
  enviarWhatsApp
}
