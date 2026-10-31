/**
 * Reglas puras de la nomina mensual (HU8): periodos, validacion de conceptos y calculo del sueldo neto.
 * No toca la base de datos. Todo el dinero se calcula con Decimal (nunca con numeros flotantes de JS).
 *
 *   sueldoNeto = sueldoBase + bonos + horasExtra - descuentos - anticipos
 */
const { Decimal, errorHttp, parsearMonto } = require('../expensas/saldo.util')
const { fechaEnZona } = require('../expensas/mora.util')
const { parsearFechaAnticipo, validarMetodoAnticipo } = require('../anticipos/anticipos.util')

const CERO = new Decimal(0)
const TIPOS_CONCEPTO = ['BONO', 'HORA_EXTRA', 'DESCUENTO']
const ETIQUETA_TIPO = { BONO: 'Bono', HORA_EXTRA: 'Hora extra', DESCUENTO: 'Descuento' }
const ESTADOS = ['PENDIENTE', 'PAGADA']
const ETIQUETA_ESTADO = { PENDIENTE: 'Pendiente', PAGADA: 'Pagada' }
const MAX_DESCRIPCION = 120
const MAX_HORAS = new Decimal(744) // 31 dias * 24 horas
const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

const redondear = (valor) => new Decimal(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
const dinero = (valor) => redondear(valor ?? 0).toFixed(2)
const suma = (valores) => valores.reduce((acc, v) => acc.plus(v), CERO)

// ---------------------------------------------------------------------------
// Periodos
// ---------------------------------------------------------------------------

/** Periodo "YYYY-MM" obligatorio y con formato valido. */
function validarPeriodo(valor, campo = 'periodo') {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) {
    throw errorHttp(`${campo} es requerido`, 400)
  }
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (!FORMATO_PERIODO.test(texto)) {
    throw errorHttp(`${campo} debe tener el formato YYYY-MM`, 400, { codigo: 'PERIODO_INVALIDO' })
  }
  return texto
}

/** Mes actual ("YYYY-MM") en hora de Bolivia. */
function periodoActual(hoy = fechaEnZona()) {
  return hoy.slice(0, 7)
}

/** Para generar: el periodo es valido y no es posterior al mes actual. */
function validarPeriodoGenerable(valor, hoy) {
  const periodo = validarPeriodo(valor)
  const actual = periodoActual(hoy)
  if (periodo > actual) {
    throw errorHttp(`No se puede generar la nomina de ${periodo}: es posterior al mes actual (${actual})`, 400, {
      codigo: 'PERIODO_FUTURO',
      detalle: { periodo, periodoActual: actual }
    })
  }
  return periodo
}

/** Ultimo dia del periodo, como YYYY-MM-DD. */
function ultimoDiaDelPeriodo(periodo) {
  const [anio, mes] = validarPeriodo(periodo).split('-').map(Number)
  const dia = new Date(Date.UTC(anio, mes, 0)).getUTCDate() // dia 0 del mes siguiente
  return `${periodo}-${String(dia).padStart(2, '0')}`
}

/** El empleado ya habia ingresado a mas tardar el ultimo dia del periodo. `fechaIngreso`: Date o YYYY-MM-DD. */
function empleadoEntraEnPeriodo(fechaIngreso, periodo) {
  const texto = fechaIngreso instanceof Date ? fechaIngreso.toISOString().slice(0, 10) : String(fechaIngreso)
  return texto <= ultimoDiaDelPeriodo(periodo)
}

// ---------------------------------------------------------------------------
// Conceptos (bono, hora extra, descuento)
// ---------------------------------------------------------------------------

function normalizarTipoConcepto(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!TIPOS_CONCEPTO.includes(texto)) {
    throw errorHttp(`tipo debe ser uno de: ${TIPOS_CONCEPTO.join(', ')}`, 400)
  }
  return texto
}

function normalizarDescripcion(valor) {
  if (typeof valor !== 'string' || !valor.trim()) throw errorHttp('descripcion es requerida', 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (texto.length > MAX_DESCRIPCION) {
    throw errorHttp(`descripcion no puede superar ${MAX_DESCRIPCION} caracteres`, 400)
  }
  return texto
}

function normalizarHoras(valor) {
  const horas = parsearMonto(valor, 'horas')
  if (horas.gt(MAX_HORAS)) throw errorHttp(`horas no puede superar ${MAX_HORAS.toString()}`, 400)
  return horas
}

/**
 * Valida un concepto completo: { tipo, descripcion, monto, horas }.
 * monto > 0; las horas son obligatorias solo en HORA_EXTRA (> 0, hasta 2 decimales, maximo 744) y
 * se rechazan en BONO y DESCUENTO. Devuelve { tipo, descripcion, monto: Decimal, horas: Decimal|null }.
 */
function validarConcepto(datos = {}) {
  const tipo = normalizarTipoConcepto(datos.tipo)
  const descripcion = normalizarDescripcion(datos.descripcion)
  const monto = parsearMonto(datos.monto, 'monto')

  const llevaHoras = datos.horas !== undefined && datos.horas !== null && datos.horas !== ''
  if (tipo === 'HORA_EXTRA') {
    if (!llevaHoras) throw errorHttp('horas es requerido para una hora extra', 400, { codigo: 'HORAS_REQUERIDAS' })
    return { tipo, descripcion, monto, horas: normalizarHoras(datos.horas) }
  }
  if (llevaHoras) {
    throw errorHttp(`horas solo aplica a las horas extra, no a ${ETIQUETA_TIPO[tipo].toLowerCase()}s`, 400, {
      codigo: 'HORAS_NO_APLICA'
    })
  }
  return { tipo, descripcion, monto, horas: null }
}

/**
 * Edicion de un concepto: se envian descripcion, monto y/o horas (el tipo no cambia). Los campos que no
 * llegan conservan su valor y el resultado se valida con las mismas reglas que el alta.
 * `existente` es el concepto guardado ({ tipo, descripcion, monto, horas }).
 */
function validarEdicionConcepto(existente, datos = {}) {
  const campos = ['descripcion', 'monto', 'horas']
  if (!campos.some((campo) => datos[campo] !== undefined)) {
    throw errorHttp(`Envie al menos uno de: ${campos.join(', ')}`, 400, { codigo: 'SIN_CAMBIOS' })
  }
  return validarConcepto({
    tipo: existente.tipo,
    descripcion: datos.descripcion !== undefined ? datos.descripcion : existente.descripcion,
    monto: datos.monto !== undefined ? datos.monto : existente.monto,
    horas: datos.horas !== undefined ? datos.horas : existente.horas
  })
}

// ---------------------------------------------------------------------------
// Calculo
// ---------------------------------------------------------------------------

/**
 * Totales de una nomina a partir de sus conceptos (filas { tipo, monto }), el sueldo base y el total de
 * anticipos aplicados. Devuelve Decimals con 2 decimales. `bruto` = base + bonos + horas extra.
 */
function calcularTotales(conceptos, sueldoBase, totalAnticipos = 0) {
  const de = (tipo) => redondear(suma(conceptos.filter((c) => c.tipo === tipo).map((c) => c.monto)))
  const base = redondear(sueldoBase)
  const totalBonos = de('BONO')
  const totalHorasExtra = de('HORA_EXTRA')
  const totalDescuentos = de('DESCUENTO')
  const anticipos = redondear(totalAnticipos)
  const bruto = base.plus(totalBonos).plus(totalHorasExtra)
  return {
    sueldoBase: base,
    totalBonos,
    totalHorasExtra,
    totalDescuentos,
    totalAnticipos: anticipos,
    bruto,
    sueldoNeto: bruto.minus(totalDescuentos).minus(anticipos)
  }
}

/** El sueldo neto no puede ser negativo (cero si). Lanza 400 NETO_NEGATIVO con el detalle del calculo. */
function validarNetoNoNegativo(totales) {
  if (totales.sueldoNeto.lt(0)) {
    throw errorHttp(
      `El sueldo neto no puede ser negativo (quedaria en Bs ${dinero(totales.sueldoNeto)})`,
      400,
      { codigo: 'NETO_NEGATIVO', detalle: detalleCalculo(totales) }
    )
  }
  return totales
}

function detalleCalculo(totales) {
  return {
    sueldoBase: dinero(totales.sueldoBase),
    bonos: dinero(totales.totalBonos),
    horasExtra: dinero(totales.totalHorasExtra),
    descuentos: dinero(totales.totalDescuentos),
    anticipos: dinero(totales.totalAnticipos),
    sueldoNeto: dinero(totales.sueldoNeto)
  }
}

/** Totales a guardar en la nomina (columnas Decimal). */
function totalesParaGuardar(totales) {
  return {
    totalBonos: totales.totalBonos,
    totalHorasExtra: totales.totalHorasExtra,
    totalDescuentos: totales.totalDescuentos,
    totalAnticipos: totales.totalAnticipos,
    sueldoNeto: totales.sueldoNeto
  }
}

/** Suma de lo que se aplico de anticipos a una nomina (filas { monto }). */
function totalAnticiposAplicados(aplicaciones) {
  return redondear(suma(aplicaciones.map((a) => a.monto)))
}

// ---------------------------------------------------------------------------
// Pago de la nomina
// ---------------------------------------------------------------------------

/**
 * Datos del pago: fechaPago (YYYY-MM-DD, no futura, hora de Bolivia), monto y metodoPago (EFECTIVO,
 * TRANSFERENCIA, TARJETA o CHEQUE; SALDO_A_FAVOR no aplica). El monto admite 0 porque una nomina cuyo
 * neto quedo en 0 (los anticipos consumieron el sueldo) se confirma con monto 0. Que el monto coincida con
 * el sueldo neto se comprueba aparte, con la nomina bloqueada (`validarMontoPago`).
 */
function validarDatosPago(datos = {}, hoy) {
  const campos = ['fechaPago', 'monto', 'metodoPago']
  const faltantes = campos.filter((c) => datos[c] === undefined || datos[c] === null || (typeof datos[c] === 'string' && datos[c].trim() === ''))
  if (faltantes.length) {
    throw errorHttp(`Faltan campos obligatorios: ${faltantes.join(', ')}`, 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: faltantes }
    })
  }
  const { texto } = parsearFechaAnticipo(datos.fechaPago, hoy, 'fechaPago', 'FECHA_PAGO_INVALIDA')
  return {
    fechaPago: texto,
    monto: parsearMonto(datos.monto, 'monto', { permitirCero: true }),
    metodoPago: validarMetodoAnticipo(datos.metodoPago)
  }
}

/** El monto pagado debe ser IGUAL al sueldo neto: no hay pagos parciales. 400 MONTO_NO_COINCIDE. */
function validarMontoPago(monto, sueldoNeto) {
  const neto = redondear(sueldoNeto)
  if (!new Decimal(monto).equals(neto)) {
    throw errorHttp(`El monto debe ser igual al sueldo neto de la nomina (Bs ${dinero(neto)}): no se admiten pagos parciales`, 400, {
      codigo: 'MONTO_NO_COINCIDE',
      detalle: { sueldoNeto: dinero(neto), monto: dinero(monto) }
    })
  }
  return neto
}

// ---------------------------------------------------------------------------
// Boleta de sueldo
// ---------------------------------------------------------------------------

const dia = (fecha) => new Date(fecha).toISOString().slice(0, 10)

/**
 * Datos planos de la boleta de sueldo (los que consume boleta-nomina-pdf.service) a partir de la nomina con su
 * empleado, conceptos y anticipos aplicados (con el anticipo: fecha y descripcion). Los totales son los guardados
 * en la nomina. Si esta PENDIENTE no lleva datos de pago.
 */
function datosParaBoleta(n) {
  const de = (tipo) => n.conceptos.filter((c) => c.tipo === tipo)
  const base = redondear(n.sueldoBase)
  const bonos = redondear(n.totalBonos)
  const horas = redondear(n.totalHorasExtra)
  const pagada = n.estado === 'PAGADA'
  return {
    periodo: n.periodo,
    estado: n.estado,
    empleado: {
      nombres: n.empleado.nombres,
      apellidos: n.empleado.apellidos,
      documento: n.empleado.documento,
      cargo: n.empleado.cargo,
      fechaIngreso: dia(n.empleado.fechaIngreso)
    },
    sueldoBase: dinero(base),
    bonos: de('BONO').map((c) => ({ descripcion: c.descripcion, monto: dinero(c.monto) })),
    horasExtra: de('HORA_EXTRA').map((c) => ({
      descripcion: c.descripcion,
      horas: c.horas === null || c.horas === undefined ? null : new Decimal(c.horas).toFixed(2),
      monto: dinero(c.monto)
    })),
    descuentos: de('DESCUENTO').map((c) => ({ descripcion: c.descripcion, monto: dinero(c.monto) })),
    anticipos: n.anticiposAplicados.map((a) => ({
      fecha: dia(a.anticipo.fecha),
      descripcion: a.anticipo.descripcion ?? '',
      monto: dinero(a.monto)
    })),
    totales: {
      bonos: dinero(bonos),
      horasExtra: dinero(horas),
      descuentos: dinero(n.totalDescuentos),
      anticipos: dinero(n.totalAnticipos),
      totalGanado: dinero(base.plus(bonos).plus(horas)),
      sueldoNeto: dinero(n.sueldoNeto)
    },
    pago: pagada
      ? { fechaPago: fechaEnZona(new Date(n.fechaPago)), metodoPago: n.metodoPago, montoPagado: dinero(n.montoPagado) }
      : null
  }
}

// ---------------------------------------------------------------------------
// Filtros del listado
// ---------------------------------------------------------------------------

function normalizarFiltroPeriodo(valor) {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) return null
  return validarPeriodo(valor)
}

function normalizarFiltroEmpleadoId(valor) {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) return null
  if (typeof valor !== 'string') throw errorHttp('empleadoId debe ser un texto', 400)
  return valor.trim()
}

/** periodoDesde/periodoHasta opcionales (YYYY-MM, inclusivos). Si desde es posterior a hasta: 400 RANGO_INVALIDO. */
function normalizarRangoPeriodos(desde, hasta) {
  const inicio = normalizarFiltroPeriodo(desde)
  const fin = normalizarFiltroPeriodo(hasta)
  if (inicio && fin && inicio > fin) {
    throw errorHttp('El rango de periodos no es valido: periodoDesde es posterior a periodoHasta', 400, {
      codigo: 'RANGO_INVALIDO'
    })
  }
  return { desde: inicio, hasta: fin }
}

function normalizarFiltroEstado(valor) {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) return null
  const texto = typeof valor === 'string' ? valor.trim().toUpperCase() : ''
  if (!ESTADOS.includes(texto)) throw errorHttp(`estado debe ser uno de: ${ESTADOS.join(', ')}`, 400)
  return texto
}

function normalizarBusqueda(valor) {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) return null
  if (typeof valor !== 'string') throw errorHttp('q debe ser un texto', 400)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (texto.length > 100) throw errorHttp('q no puede superar 100 caracteres', 400)
  return texto
}

// ---------------------------------------------------------------------------
// Presentacion
// ---------------------------------------------------------------------------

function conceptoParaCliente(c) {
  return {
    id: c.id,
    tipo: c.tipo,
    tipoEtiqueta: ETIQUETA_TIPO[c.tipo],
    descripcion: c.descripcion,
    horas: c.horas === null || c.horas === undefined ? null : new Decimal(c.horas).toFixed(2),
    monto: dinero(c.monto),
    createdAt: c.createdAt
  }
}

/**
 * La nomina tal como se devuelve al cliente. Con `conceptos` y `anticiposAplicados` incluidos en la
 * consulta devuelve el detalle completo (conceptos tambien agrupados por tipo).
 */
function nominaParaCliente(n) {
  const salida = {
    id: n.id,
    periodo: n.periodo,
    estado: n.estado,
    estadoEtiqueta: ETIQUETA_ESTADO[n.estado],
    sueldoBase: dinero(n.sueldoBase),
    totalBonos: dinero(n.totalBonos),
    totalHorasExtra: dinero(n.totalHorasExtra),
    totalDescuentos: dinero(n.totalDescuentos),
    totalAnticipos: dinero(n.totalAnticipos),
    sueldoNeto: dinero(n.sueldoNeto),
    fechaPago: n.fechaPago ?? null,
    montoPagado: n.montoPagado === null || n.montoPagado === undefined ? null : dinero(n.montoPagado),
    metodoPago: n.metodoPago ?? null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt
  }
  if (n.empleado) {
    salida.empleado = {
      id: n.empleado.id,
      nombres: n.empleado.nombres,
      apellidos: n.empleado.apellidos,
      cargo: n.empleado.cargo,
      documento: n.empleado.documento
    }
  }
  if (n.conceptos) {
    const conceptos = n.conceptos.map(conceptoParaCliente)
    salida.conceptos = conceptos
    salida.conceptosPorTipo = {
      bonos: conceptos.filter((c) => c.tipo === 'BONO'),
      horasExtra: conceptos.filter((c) => c.tipo === 'HORA_EXTRA'),
      descuentos: conceptos.filter((c) => c.tipo === 'DESCUENTO')
    }
  }
  if (n.anticiposAplicados) {
    salida.anticiposAplicados = n.anticiposAplicados.map((a) => ({
      id: a.id,
      anticipoId: a.anticipoId,
      fecha: a.anticipo?.fecha ? new Date(a.anticipo.fecha).toISOString().slice(0, 10) : null,
      montoAnticipo: a.anticipo ? dinero(a.anticipo.monto) : null,
      montoAplicado: dinero(a.monto)
    }))
  }
  return salida
}

module.exports = {
  TIPOS_CONCEPTO,
  ESTADOS,
  MAX_DESCRIPCION,
  MAX_HORAS,
  dinero,
  validarPeriodo,
  periodoActual,
  validarPeriodoGenerable,
  ultimoDiaDelPeriodo,
  empleadoEntraEnPeriodo,
  validarConcepto,
  validarEdicionConcepto,
  calcularTotales,
  validarNetoNoNegativo,
  detalleCalculo,
  totalesParaGuardar,
  totalAnticiposAplicados,
  validarDatosPago,
  validarMontoPago,
  datosParaBoleta,
  normalizarFiltroEmpleadoId,
  normalizarRangoPeriodos,
  normalizarFiltroPeriodo,
  normalizarFiltroEstado,
  normalizarBusqueda,
  conceptoParaCliente,
  nominaParaCliente
}
