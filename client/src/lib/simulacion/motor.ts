/**
 * Motor del entorno de simulación de Morosidad y Expensas. Es una copia en el navegador de las
 * reglas del backend (expensas.service.js, saldo.util.js, mora.util.js, reglas-pago.util.js,
 * cargos.util.js, configuracion-mora.service.js, generacion-automatica.job.js, estado-cuenta.util.js
 * y cuenta-inmueble.service.js): si esas reglas cambian, hay que cambiarlas también aquí.
 * Solo trabaja sobre `EstadoSimulacion`: no conoce la red ni el almacenamiento.
 * Los importes se guardan en centavos para no acumular errores de redondeo.
 */

export type EstadoExpensaSim = "PENDIENTE" | "PARCIAL" | "PAGADA" | "VENCIDA";
type TipoMovimiento = "PAGO_ANTICIPADO" | "EXCESO_PAGO" | "APLICACION_EXPENSA";
type ClaseInmueble = "DEPARTAMENTO" | "BAULERA" | "PARQUEO";

export interface TipoSim {
  id: string;
  nombre: string;
  montoBase: string | number;
  [campo: string]: unknown;
}

export interface InmuebleSim {
  id: string;
  codigo: string;
  clase: ClaseInmueble;
  activo: boolean;
  tipoInmuebleId: string | null;
  cuotaMensual?: string | null;
  tipoInmueble?: unknown;
  [campo: string]: unknown;
}

export interface OcupanteSim {
  id: string;
  inmuebleId: string;
  copropietarioId: string;
  esPropietario: boolean;
  fechaInicio: string;
  fechaFin: string | null;
  copropietario: { id: string; nombre: string; apellido: string; ci: string };
}

export interface ConfigSim {
  id: string;
  diaGeneracion: number;
  diaVencimiento: number;
  diaDescuentoSaldo?: number; // puede faltar en configuraciones capturadas antes de ese campo
  diasGracia: number;
  modoMora: "UNICA" | "MENSUAL";
  tipoValor: "PORCENTAJE" | "MONTO_FIJO";
  valor: number | string;
  vigenteDesde: string;
  [campo: string]: unknown;
}

interface PagoSim {
  id: string;
  expensaId: string;
  monto: number;
  montoMora: number;
  montoExpensa: number;
  metodoPago: string;
  referencia: string | null;
  fechaPago: string;
  folioNumero: number | null;
}

interface MoraSim {
  id: string;
  numero: number;
  mes: string;
  fechaCorte: string;
  base: number;
  tipoValor: ConfigSim["tipoValor"];
  valor: number;
  monto: number;
  createdAt: string;
}

interface CargoSim {
  id: string;
  clase: ClaseInmueble;
  inmuebleId: string;
  codigo: string;
  monto: number;
}

interface CambioVencimientoSim {
  id: string;
  fechaAnterior: string;
  fechaNueva: string;
  motivo: string | null;
  createdAt: string;
}

export interface ExpensaSim {
  id: string;
  inmuebleId: string;
  periodo: string;
  montoBase: number;
  montoAgua: number;
  montoTotal: number;
  montoMora: number;
  tipoNombre: string;
  estado: EstadoExpensaSim;
  fechaVencimiento: string;
  configuracionMoraId: string | null;
  responsableId: string;
  responsableNombre: string;
  responsableRol: "PROPIETARIO" | "INQUILINO";
  aguaRegistradaEn: string | null;
  createdAt: string;
  pagos: PagoSim[];
  moras: MoraSim[];
  cargos: CargoSim[];
  cambiosVencimiento: CambioVencimientoSim[];
}

export interface MovimientoSim {
  id: string;
  inmuebleId: string;
  tipo: TipoMovimiento;
  monto: number;
  expensaId: string | null;
  metodoPago: string | null;
  referencia: string | null;
  folioNumero: number | null;
  createdAt: string;
}

interface EnvioSim {
  id: string;
  tipo: "EXPENSA_GENERADA" | "MORA_APLICADA";
  expensaId: string;
  periodo: string;
  inmueble: string;
  asunto: string;
  createdAt: string;
}

export interface EstadoSimulacion {
  version: 1;
  fecha: string; // día simulado, YYYY-MM-DD en hora de Bolivia
  secuencia: number; // ordena los hechos de un mismo día y arma los ids
  folio: number;
  capturadoEn: string;
  inmuebles: InmuebleSim[];
  ocupantes: OcupanteSim[];
  tipos: TipoSim[];
  tarifas: { clase: string; monto: string }[];
  configuraciones: ConfigSim[];
  expensas: ExpensaSim[];
  movimientos: MovimientoSim[];
  envios: EnvioSim[];
}

type DatosCaptura = Pick<EstadoSimulacion, "inmuebles" | "ocupantes" | "tipos" | "tarifas" | "configuraciones">;

/** Error con el mismo formato que el backend ({ error, codigo, detalle }). */
export class ErrorSimulacion extends Error {
  constructor(mensaje: string, readonly status: number, readonly codigo?: string, readonly detalle?: unknown) {
    super(mensaje);
  }
}

const error = (mensaje: string, status: number, codigo?: string, detalle?: unknown) =>
  new ErrorSimulacion(mensaje, status, codigo, detalle);

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const DESFASE_BOLIVIA_MS = 4 * 60 * 60 * 1000; // Bolivia es UTC-4 todo el año
const MAX_MESES_MORA = 120;
const MAX_DIAS_POR_SALTO = 1100;
const DIA_DESCUENTO_POR_DEFECTO = 9;
const METODOS_MANUALES = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE"];
const ORDEN_CLASE_CARGO: Record<ClaseInmueble, number> = { DEPARTAMENTO: 0, BAULERA: 1, PARQUEO: 2 };
const ORDEN_CLASE_EXTRA: Partial<Record<ClaseInmueble, number>> = { PARQUEO: 0, BAULERA: 1 };
const ETIQUETA_CLASE: Record<ClaseInmueble, string> = { DEPARTAMENTO: "Departamento", BAULERA: "Baulera", PARQUEO: "Parqueo" };
const ETIQUETA_METODO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
  SALDO_A_FAVOR: "Saldo a favor",
};

// ----- Dinero y fechas -----

const aCentavos = (valor: string | number) => Math.round(Number(valor) * 100);
const dinero = (centavos: number) => (centavos / 100).toFixed(2);
const formatearFolio = (numero: number) => `REC-${String(numero).padStart(6, "0")}`;

/** base (en centavos) × porcentaje / 100, redondeado a centavos hacia arriba desde .5, sin errores de coma flotante. */
function porcentajeDe(baseCentavos: number, valor: number | string) {
  const ESCALA = 1_000_000;
  const numerador = BigInt(baseCentavos) * BigInt(Math.round(Number(valor) * ESCALA));
  const denominador = BigInt(100 * ESCALA);
  return Number((numerador * BigInt(2) + denominador) / (denominador * BigInt(2)));
}

export function fechaEnZona(instanteIso: string) {
  return new Date(Date.parse(instanteIso) - DESFASE_BOLIVIA_MS).toISOString().slice(0, 10);
}

const fechaCalendario = (fechaIso: string) => new Date(fechaIso).toISOString().slice(0, 10);
const aMs = (fechaIso: string) => Date.parse(`${fechaIso}T00:00:00Z`);

export function sumarDias(fechaIso: string, dias: number) {
  return new Date(aMs(fechaIso) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

export function sumarMeses(fechaIso: string, meses: number) {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  const total = anio * 12 + (mes - 1) + meses;
  const anioFinal = Math.floor(total / 12);
  const mesFinal = total % 12;
  const ultimoDia = new Date(Date.UTC(anioFinal, mesFinal + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia);
  return `${anioFinal}-${String(mesFinal + 1).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
}

/** Día desde el que el saldo a favor puede descontarse de una expensa del período. */
function fechaDescuentoSaldo(periodo: string, config: ConfigSim | null) {
  return `${periodo}-${String(config?.diaDescuentoSaldo ?? DIA_DESCUENTO_POR_DEFECTO).padStart(2, "0")}`;
}

function vencimientoDelPeriodo(periodo: string, dia: number) {
  const [anio, mes] = periodo.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia)).toISOString();
}

/** Instante simulado actual, sin consumir la secuencia. */
function instante(estado: EstadoSimulacion) {
  return Date.parse(`${estado.fecha}T12:00:00.000-04:00`) + estado.secuencia;
}

/** Instante simulado para un hecho nuevo: mediodía del día simulado, siempre posterior al anterior. */
function ahora(estado: EstadoSimulacion) {
  estado.secuencia += 1;
  return new Date(instante(estado)).toISOString();
}

function nuevoId(estado: EstadoSimulacion, prefijo: string) {
  estado.secuencia += 1;
  return `sim-${prefijo}-${estado.secuencia}`;
}

// ----- Creación y consultas básicas -----

export function crearEstado(fecha: string, capturadoEn: string, datos: DatosCaptura): EstadoSimulacion {
  return { version: 1, fecha, secuencia: 0, folio: 0, capturadoEn, ...datos, expensas: [], movimientos: [], envios: [] };
}

function buscarInmueble(estado: EstadoSimulacion, id: string) {
  const inmueble = estado.inmuebles.find((item) => item.id === id);
  if (!inmueble) throw error("Inmueble no encontrado", 404);
  return inmueble;
}

function buscarExpensa(estado: EstadoSimulacion, id: string) {
  const expensa = estado.expensas.find((item) => item.id === id);
  if (!expensa) throw error("Expensa no encontrada", 404);
  return expensa;
}

const tipoDe = (estado: EstadoSimulacion, inmueble: InmuebleSim) =>
  estado.tipos.find((tipo) => tipo.id === inmueble.tipoInmuebleId) ?? null;

function ocupantesVigentes(estado: EstadoSimulacion, inmuebleId: string) {
  const momento = instante(estado);
  return estado.ocupantes
    .filter((ocupante) =>
      ocupante.inmuebleId === inmuebleId &&
      Date.parse(ocupante.fechaInicio) <= momento &&
      (ocupante.fechaFin === null || Date.parse(ocupante.fechaFin) > momento))
    .sort((a, b) => Number(b.esPropietario) - Number(a.esPropietario) || Date.parse(a.fechaInicio) - Date.parse(b.fechaInicio));
}

const pagaExpensa = (estado: EstadoSimulacion, inmueble: InmuebleSim) =>
  inmueble.activo && inmueble.clase === "DEPARTAMENTO" && inmueble.tipoInmuebleId !== null &&
  ocupantesVigentes(estado, inmueble.id).length > 0;

const compararCodigo = (a: { codigo: string }, b: { codigo: string }) => a.codigo.localeCompare(b.codigo);

export function saldoFavorDe(estado: EstadoSimulacion, inmuebleId: string) {
  return estado.movimientos.filter((m) => m.inmuebleId === inmuebleId).reduce((total, m) => total + m.monto, 0);
}

const sumar = <T>(lista: T[], campo: (item: T) => number) => lista.reduce((total, item) => total + campo(item), 0);

function pendientesDe(expensa: Pick<ExpensaSim, "montoTotal" | "montoMora" | "pagos">) {
  const deExpensa = Math.max(expensa.montoTotal - sumar(expensa.pagos, (p) => p.montoExpensa), 0);
  const deMora = Math.max(expensa.montoMora - sumar(expensa.pagos, (p) => p.montoMora), 0);
  return { expensa: deExpensa, mora: deMora, total: deExpensa + deMora };
}

function calcularEstado(expensa: Pick<ExpensaSim, "montoTotal" | "montoMora" | "pagos">, vencida = false): EstadoExpensaSim {
  if (pendientesDe(expensa).total <= 0) return "PAGADA";
  if (vencida || expensa.montoMora > 0) return "VENCIDA";
  if (sumar(expensa.pagos, (p) => p.monto) > 0) return "PARCIAL";
  return "PENDIENTE";
}

function dividirAplicacion(disponible: number, pendientes: { mora: number; expensa: number }) {
  const aMora = Math.min(disponible, pendientes.mora);
  const aExpensa = Math.min(disponible - aMora, pendientes.expensa);
  return { aMora, aExpensa, total: aMora + aExpensa };
}

function parsearMonto(valor: unknown, campo = "monto", permitirCero = false) {
  if (valor === undefined || valor === null || valor === "" || typeof valor === "boolean") {
    throw error(`${campo} es requerido`, 400);
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw error(`${campo} debe ser un numero`, 400);
  if (permitirCero ? numero < 0 : numero <= 0) {
    throw error(permitirCero ? `${campo} no puede ser negativo` : `${campo} debe ser mayor que cero`, 400);
  }
  if (/\.\d{2}\d*[1-9]/.test(String(valor))) throw error(`${campo} admite como maximo 2 decimales`, 400);
  if (numero > 99999999.99) throw error(`${campo} supera el maximo permitido`, 400);
  return aCentavos(numero);
}

function validarMetodoPago(metodoPago: unknown): asserts metodoPago is string {
  if (typeof metodoPago !== "string" || !METODOS_MANUALES.includes(metodoPago)) {
    throw error(`metodoPago invalido. Valores permitidos: ${METODOS_MANUALES.join(", ")}`, 400);
  }
}

function normalizarReferencia(referencia: unknown) {
  if (referencia === undefined || referencia === null || referencia === "") return null;
  if (typeof referencia !== "string") throw error("referencia debe ser un texto", 400);
  if (referencia.trim().length > 200) throw error("referencia no puede superar 200 caracteres", 400);
  return referencia.trim() || null;
}

// ----- Reglas de pago -----

type Deuda = { expensa: ExpensaSim; pendiente: ReturnType<typeof pendientesDe>; atrasada: boolean };

function periodoMasReciente(estado: EstadoSimulacion, inmuebleId: string) {
  return estado.expensas
    .filter((e) => e.inmuebleId === inmuebleId)
    .reduce<string | null>((reciente, e) => (reciente === null || e.periodo > reciente ? e.periodo : reciente), null);
}

function cargarDeudas(estado: EstadoSimulacion, inmuebleId: string): Deuda[] {
  const reciente = periodoMasReciente(estado, inmuebleId);
  return estado.expensas
    .filter((e) => e.inmuebleId === inmuebleId && e.estado !== "PAGADA")
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.periodo.localeCompare(b.periodo))
    .map((expensa) => ({ expensa, pendiente: pendientesDe(expensa), atrasada: reciente !== null && expensa.periodo < reciente }))
    .filter((deuda) => deuda.pendiente.total > 0);
}

function planificarPago(deudas: Deuda[], monto: number) {
  let restante = monto;
  let saldadoAtrasado = 0;
  const aplicaciones: { completa: boolean }[] = [];

  for (const deuda of deudas) {
    if (restante <= 0) break;
    const total = deuda.pendiente.total;
    if (deuda.atrasada && restante < total) {
      const periodo = deuda.expensa.periodo;
      if (aplicaciones.length === 0) {
        throw error(
          `Tiene deuda del periodo ${periodo} (Bs ${dinero(total)}): debe pagarla completa antes de ` +
            "pagar en cuotas o por adelantado. Los meses anteriores no admiten pagos parciales.",
          409, "DEUDA_ATRASADA", { periodo, montoRequerido: dinero(total), montoRecibido: dinero(monto) });
      }
      throw error(
        `El monto no completa el periodo atrasado ${periodo}. Con Bs ${dinero(saldadoAtrasado)} salda ` +
          `los meses anteriores y con Bs ${dinero(saldadoAtrasado + total)} salda tambien ${periodo}. ` +
          "Los meses anteriores no admiten pagos parciales.",
        409, "DEUDA_ATRASADA_INCOMPLETA");
    }
    const aplicado = Math.min(restante, total);
    aplicaciones.push({ completa: aplicado >= total });
    if (deuda.atrasada) saldadoAtrasado += aplicado;
    restante -= aplicado;
  }

  if (restante > 0) return "ANTICIPADO";
  return aplicaciones.some((a) => !a.completa) ? "CUOTA" : "PAGO_COMPLETO";
}

function aplicarSaldoAExpensa(estado: EstadoSimulacion, expensa: ExpensaSim) {
  const pendientes = pendientesDe(expensa);
  if (pendientes.total <= 0) return 0;
  const saldo = saldoFavorDe(estado, expensa.inmuebleId);
  if (saldo <= 0) return 0;

  const { aMora, aExpensa, total } = dividirAplicacion(saldo, pendientes);
  const fecha = ahora(estado);
  expensa.pagos.push({
    id: nuevoId(estado, "pago"), expensaId: expensa.id, monto: total, montoMora: aMora, montoExpensa: aExpensa,
    metodoPago: "SALDO_A_FAVOR", referencia: "Aplicacion de saldo a favor", fechaPago: fecha, folioNumero: null,
  });
  estado.movimientos.push({
    id: nuevoId(estado, "mov"), inmuebleId: expensa.inmuebleId, tipo: "APLICACION_EXPENSA", monto: -total,
    expensaId: expensa.id, metodoPago: null, referencia: null, folioNumero: null, createdAt: fecha,
  });
  expensa.estado = calcularEstado(expensa, expensa.estado === "VENCIDA");
  return total;
}

const hayDeudaAnterior = (estado: EstadoSimulacion, expensa: ExpensaSim) =>
  estado.expensas.some((e) =>
    e.inmuebleId === expensa.inmuebleId && e.id !== expensa.id && e.estado !== "PAGADA" && e.periodo < expensa.periodo);

// ----- Configuración de mora -----

/** La vigente en el día simulado. Si la fecha simulada es anterior a todas, se usa la más antigua capturada. */
export function configVigente(estado: EstadoSimulacion): ConfigSim | null {
  const momento = instante(estado);
  const ordenadas = [...estado.configuraciones].sort((a, b) => Date.parse(b.vigenteDesde) - Date.parse(a.vigenteDesde));
  return ordenadas.find((c) => Date.parse(c.vigenteDesde) <= momento) ?? ordenadas.at(-1) ?? null;
}

export function historialConfig(estado: EstadoSimulacion) {
  return [...estado.configuraciones].sort((a, b) => Date.parse(b.vigenteDesde) - Date.parse(a.vigenteDesde));
}

export function crearConfig(estado: EstadoSimulacion, datos: Record<string, unknown>) {
  const { diaGeneracion, diasGracia, tipoValor, valor } = datos;
  const modoMora = datos.modoMora ?? "MENSUAL";
  const vigenteDesde = datos.vigenteDesde;
  if (diaGeneracion === undefined || diasGracia === undefined || !tipoValor || valor === undefined) {
    throw error("diaGeneracion, diasGracia, tipoValor y valor son requeridos", 400);
  }
  if (!Number.isInteger(diaGeneracion) || Number(diaGeneracion) < 1 || Number(diaGeneracion) > 28) {
    throw error("diaGeneracion debe ser un entero entre 1 y 28", 400);
  }
  if (!Number.isInteger(diasGracia) || Number(diasGracia) < 0) {
    throw error("diasGracia debe ser un entero mayor o igual a 0", 400);
  }
  if (tipoValor !== "PORCENTAJE" && tipoValor !== "MONTO_FIJO") throw error("tipoValor debe ser PORCENTAJE o MONTO_FIJO", 400);
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) throw error("valor debe ser un numero mayor o igual a 0", 400);
  if (tipoValor === "PORCENTAJE" && valor > 100) throw error("valor no puede superar 100 cuando el tipo es PORCENTAJE", 400);
  if (modoMora !== "UNICA" && modoMora !== "MENSUAL") throw error("modoMora debe ser uno de: UNICA, MENSUAL", 400);

  let dia = datos.diaVencimiento as number | null | undefined;
  if (dia === undefined || dia === null) {
    dia = Math.max(historialConfig(estado)[0]?.diaVencimiento ?? 10, Number(diaGeneracion));
  }
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) throw error("diaVencimiento debe ser un entero entre 1 y 28", 400);
  if (dia < Number(diaGeneracion)) throw error("diaVencimiento no puede ser anterior al dia de generacion", 400);

  let diaDescuento = datos.diaDescuentoSaldo as number | null | undefined;
  if (diaDescuento === undefined || diaDescuento === null) {
    diaDescuento = Math.min(Math.max(historialConfig(estado)[0]?.diaDescuentoSaldo ?? DIA_DESCUENTO_POR_DEFECTO, Number(diaGeneracion)), dia);
  }
  if (!Number.isInteger(diaDescuento) || diaDescuento < Number(diaGeneracion) || diaDescuento > dia) {
    throw error("diaDescuentoSaldo debe ser un entero entre el dia de generacion y el de vencimiento", 400);
  }

  const momento = ahora(estado);
  let desde = momento;
  if (vigenteDesde) {
    if (typeof vigenteDesde !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde)) {
      throw error("vigenteDesde debe tener el formato YYYY-MM-DD", 400);
    }
    if (vigenteDesde < estado.fecha) {
      throw error("vigenteDesde no puede ser una fecha pasada: la nueva regla solo aplica hacia adelante", 400);
    }
    const inicioDelDia = new Date(`${vigenteDesde}T00:00:00-04:00`).toISOString();
    if (Date.parse(inicioDelDia) > Date.parse(momento)) desde = inicioDelDia;
  }

  const config: ConfigSim = {
    id: nuevoId(estado, "config"), diaGeneracion: Number(diaGeneracion), diaVencimiento: dia, diaDescuentoSaldo: diaDescuento, diasGracia: Number(diasGracia),
    tipoValor, valor, modoMora, vigenteDesde: desde,
  };
  estado.configuraciones.push(config);
  return config;
}

export function guardarTipo(estado: EstadoSimulacion, id: string, datos: { nombre?: unknown; montoBase?: unknown }) {
  const tipo = estado.tipos.find((item) => item.id === id);
  if (!tipo) throw error("Tipo de inmueble no encontrado", 404);
  if (datos.nombre !== undefined) tipo.nombre = String(datos.nombre).trim();
  if (datos.montoBase !== undefined) tipo.montoBase = dinero(parsearMonto(datos.montoBase, "montoBase", true));
  return tipo;
}

// ----- Generación -----

function montoEfectivo(estado: EstadoSimulacion, inmueble: InmuebleSim) {
  if (inmueble.clase === "DEPARTAMENTO") return 0;
  if (inmueble.cuotaMensual !== null && inmueble.cuotaMensual !== undefined) return aCentavos(inmueble.cuotaMensual);
  return aCentavos(estado.tarifas.find((t) => t.clase === inmueble.clase)?.monto ?? 0);
}

function extrasParaExpensa(estado: EstadoSimulacion, inmuebleId: string, responsableId: string) {
  const aCargo = estado.inmuebles
    .filter((i) => pagaExpensa(estado, i) && ocupantesVigentes(estado, i.id)[0]?.copropietarioId === responsableId)
    .sort(compararCodigo);
  if (aCargo[0]?.id !== inmuebleId) return [];

  return estado.inmuebles
    .filter((i) => i.clase !== "DEPARTAMENTO" && i.activo &&
      ocupantesVigentes(estado, i.id).some((o) => o.copropietarioId === responsableId))
    .map((i) => ({ inmuebleId: i.id, clase: i.clase, codigo: i.codigo, monto: montoEfectivo(estado, i) }))
    .filter((extra) => extra.monto > 0)
    .sort((a, b) => (ORDEN_CLASE_EXTRA[a.clase] ?? 0) - (ORDEN_CLASE_EXTRA[b.clase] ?? 0) || compararCodigo(a, b));
}

export function generar(estado: EstadoSimulacion, datos: { inmuebleId: string; periodo: string; fechaVencimiento?: string }) {
  const { inmuebleId, periodo } = datos;
  if (typeof periodo !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    throw error("periodo debe tener el formato YYYY-MM (ej. 2026-09)", 400);
  }
  const inmueble = buscarInmueble(estado, inmuebleId);
  if (!inmueble.activo) throw error("El inmueble esta inactivo, no se puede generar expensa", 409, "INMUEBLE_INACTIVO");
  if (inmueble.clase !== "DEPARTAMENTO") {
    throw error(
      `El inmueble ${inmueble.codigo} es ${inmueble.clase === "BAULERA" ? "una baulera" : "un parqueo"}: solo los departamentos pagan expensa`,
      409, "NO_ES_DEPARTAMENTO");
  }
  const tipo = tipoDe(estado, inmueble);
  if (!tipo) throw error(`El departamento ${inmueble.codigo} no tiene tipo asignado`, 409, "SIN_TIPO");

  const config = configVigente(estado);
  let vencimiento: string;
  if (datos.fechaVencimiento) {
    if (Number.isNaN(Date.parse(datos.fechaVencimiento))) throw error("fechaVencimiento no es una fecha valida", 400);
    vencimiento = new Date(datos.fechaVencimiento).toISOString();
  } else {
    if (!config) throw error("No hay configuracion de mora vigente: configure el dia de vencimiento o envie fechaVencimiento", 409);
    vencimiento = vencimientoDelPeriodo(periodo, config.diaVencimiento);
  }

  const ocupantes = ocupantesVigentes(estado, inmuebleId);
  if (ocupantes.length === 0) {
    throw error(`El departamento ${inmueble.codigo} no tiene a nadie asignado, no genera expensa`, 409, "SIN_ASIGNAR");
  }
  if (estado.expensas.some((e) => e.inmuebleId === inmuebleId && e.periodo === periodo)) {
    throw error(`Ya existe una expensa para el inmueble ${inmueble.codigo} en el periodo ${periodo}`, 409, "EXPENSA_DUPLICADA");
  }

  const responsable = ocupantes[0];
  const extras = extrasParaExpensa(estado, inmuebleId, responsable.copropietario.id);
  const cuota = aCentavos(tipo.montoBase);
  const montoBase = cuota + sumar(extras, (extra) => extra.monto);
  const id = nuevoId(estado, "exp");
  const expensa: ExpensaSim = {
    id, inmuebleId, periodo, montoBase, montoAgua: 0, montoTotal: montoBase, montoMora: 0, tipoNombre: tipo.nombre,
    estado: "PENDIENTE", fechaVencimiento: vencimiento, configuracionMoraId: config?.id ?? null,
    responsableId: responsable.copropietario.id,
    responsableNombre: `${responsable.copropietario.nombre} ${responsable.copropietario.apellido}`,
    responsableRol: responsable.esPropietario ? "PROPIETARIO" : "INQUILINO",
    aguaRegistradaEn: null, createdAt: ahora(estado), pagos: [], moras: [], cambiosVencimiento: [],
    cargos: [
      { clase: "DEPARTAMENTO" as ClaseInmueble, inmuebleId, codigo: inmueble.codigo, monto: cuota },
      ...extras,
    ].map((cargo) => ({ ...cargo, id: nuevoId(estado, "cargo") })),
  };
  estado.expensas.push(expensa);

  // El saldo a favor se descuenta desde el día configurado, para dar tiempo a cargar el agua. Aquí solo se
  // usa si la expensa se genera con ese día ya alcanzado y es la deuda más antigua del inmueble.
  const aplicado = hayDeudaAnterior(estado, expensa) || estado.fecha < fechaDescuentoSaldo(periodo, config) ? 0 : aplicarSaldoAExpensa(estado, expensa);
  return { expensa, aplicado };
}

function registrarAviso(estado: EstadoSimulacion, tipo: EnvioSim["tipo"], expensa: ExpensaSim) {
  const inmueble = buscarInmueble(estado, expensa.inmuebleId).codigo;
  estado.envios.push({
    id: nuevoId(estado, "correo"), tipo, expensaId: expensa.id, periodo: expensa.periodo, inmueble,
    asunto: tipo === "EXPENSA_GENERADA" ? `Expensa ${expensa.periodo} - ${inmueble}` : `Mora aplicada ${expensa.periodo} - ${inmueble}`,
    createdAt: ahora(estado),
  });
}

/** Igual que ejecutarGeneracionAutomatica del backend, pero con el día simulado y sin enviar correos. */
export function ejecutarGeneracion(estado: EstadoSimulacion, forzar = false) {
  const config = configVigente(estado);
  if (!config) return { generadas: 0, omitidas: 0 };

  const periodo = estado.fecha.slice(0, 7);
  const dia = Number(estado.fecha.slice(8, 10));
  if (!forzar && dia < config.diaGeneracion) return { generadas: 0, omitidas: 0, motivo: "no es el dia de generacion" };
  if (!forzar && dia > config.diaGeneracion && estado.expensas.some((e) => e.periodo === periodo)) {
    return { generadas: 0, omitidas: 0, motivo: "el periodo ya fue generado" };
  }

  const fechaVencimiento = vencimientoDelPeriodo(periodo, config.diaVencimiento);
  const inmuebles = estado.inmuebles.filter((i) => pagaExpensa(estado, i)).sort(compararCodigo);
  const conExpensa = new Set(estado.expensas.filter((e) => e.periodo === periodo).map((e) => e.inmuebleId));
  const yaGeneradas: string[] = [];
  const pendientes: { inmuebleId: string; codigo: string; motivo: string }[] = [];
  let generadas = 0;

  for (const inmueble of inmuebles) {
    if (conExpensa.has(inmueble.id)) {
      yaGeneradas.push(inmueble.codigo);
      continue;
    }
    try {
      const { expensa } = generar(estado, { inmuebleId: inmueble.id, periodo, fechaVencimiento });
      registrarAviso(estado, "EXPENSA_GENERADA", expensa);
      generadas += 1;
    } catch (err) {
      if (!(err instanceof ErrorSimulacion)) throw err;
      pendientes.push({ inmuebleId: inmueble.id, codigo: inmueble.codigo, motivo: err.message });
    }
  }

  const excluidos = estado.inmuebles
    .filter((i) => i.clase === "DEPARTAMENTO" && !inmuebles.includes(i))
    .sort(compararCodigo)
    .map((i) => ({ codigo: i.codigo, motivo: i.activo ? "Sin nadie asignado" : "Inmueble inactivo" }));

  return {
    periodo, generadas, omitidas: yaGeneradas.length + pendientes.length, yaGeneradas, pendientes, excluidos,
    correos: { enviados: 0, fallidos: 0, omitidos: generadas },
  };
}

// ----- Mora -----

function fechaCorteMora(fechaVencimiento: string, diasGracia: number, numero: number) {
  const limite = sumarDias(fechaCalendario(fechaVencimiento), diasGracia);
  return sumarDias(sumarMeses(limite, numero - 1), 1);
}

export function calcularLineasMora(expensa: Pick<ExpensaSim, "fechaVencimiento" | "montoTotal" | "pagos" | "moras">, config: ConfigSim, hoyIso: string) {
  const hasta = config.modoMora === "UNICA" ? 1 : MAX_MESES_MORA;
  const yaGeneradas = new Set(expensa.moras.map((linea) => linea.numero));
  const lineas: Omit<MoraSim, "id" | "createdAt">[] = [];

  for (let numero = 1; numero <= hasta; numero++) {
    const corte = fechaCorteMora(expensa.fechaVencimiento, config.diasGracia, numero);
    if (corte > hoyIso) break;
    if (yaGeneradas.has(numero)) continue;

    const alDia = sumarDias(corte, -1);
    const pagado = sumar(expensa.pagos.filter((p) => fechaEnZona(p.fechaPago) <= alDia), (p) => p.montoExpensa);
    const base = Math.max(expensa.montoTotal - pagado, 0);
    if (base <= 0) break;

    const monto = config.tipoValor === "PORCENTAJE" ? porcentajeDe(base, config.valor) : porcentajeDe(10000, config.valor);
    if (monto <= 0) continue;

    lineas.push({ numero, mes: corte.slice(0, 7), fechaCorte: corte, base, tipoValor: config.tipoValor, valor: Number(config.valor), monto });
  }
  return lineas;
}

const configDeLaExpensa = (estado: EstadoSimulacion, expensa: ExpensaSim) =>
  estado.configuraciones.find((c) => c.id === expensa.configuracionMoraId) ?? historialConfig(estado)[0] ?? null;

export function aplicarMora(estado: EstadoSimulacion, expensaId: string) {
  const expensa = buscarExpensa(estado, expensaId);
  const config = configDeLaExpensa(estado, expensa);
  if (!config) throw error("No hay una configuracion de mora vigente", 409);
  if (expensa.estado === "PAGADA") return { expensa, moraActualizada: false, mensaje: "La expensa ya esta pagada, no se aplica mora" };

  const lineas = calcularLineasMora(expensa, config, estado.fecha);
  if (lineas.length === 0) {
    const pasoGracia = estado.fecha > sumarDias(fechaCalendario(expensa.fechaVencimiento), config.diasGracia);
    if (pasoGracia && (expensa.estado === "PENDIENTE" || expensa.estado === "PARCIAL") && pendientesDe(expensa).total > 0) {
      expensa.estado = "VENCIDA";
      return { expensa, moraActualizada: false, mensaje: "La expensa paso a VENCIDA (sin mora por calcular)" };
    }
    return {
      expensa, moraActualizada: false,
      mensaje: !pasoGracia && expensa.moras.length === 0 ? "La expensa aun esta dentro del periodo de gracia, no se aplica mora" : "La mora ya estaba al dia",
    };
  }

  const creadaEn = ahora(estado);
  for (const linea of lineas) expensa.moras.push({ ...linea, id: nuevoId(estado, "mora"), createdAt: creadaEn });
  expensa.moras.sort((a, b) => a.numero - b.numero);
  expensa.montoMora = sumar(expensa.moras, (m) => m.monto);
  expensa.estado = calcularEstado(expensa);
  return { expensa, moraActualizada: true };
}

/** Igual que ejecutarDescuentoSaldos del backend: de la expensa más antigua a la más nueva por inmueble. */
export function ejecutarDescuentoSaldos(estado: EstadoSimulacion) {
  let aplicados = 0;
  for (const inmueble of estado.inmuebles) {
    if (saldoFavorDe(estado, inmueble.id) <= 0) continue;
    for (const { expensa } of cargarDeudas(estado, inmueble.id)) {
      if (estado.fecha < fechaDescuentoSaldo(expensa.periodo, configDeLaExpensa(estado, expensa))) break;
      try {
        aplicarSaldoFavor(estado, expensa.id);
      } catch (err) {
        if (!(err instanceof ErrorSimulacion)) throw err;
        break;
      }
      aplicados += 1;
      if (expensa.estado !== "PAGADA") break;
    }
  }
  return { aplicados };
}

export function ejecutarMora(estado: EstadoSimulacion) {
  if (!configVigente(estado)) return { aplicadas: 0, saldosAplicados: 0 };
  const saldosAplicados = ejecutarDescuentoSaldos(estado).aplicados;
  let aplicadas = 0;
  for (const expensa of estado.expensas) {
    if (expensa.estado === "PAGADA") continue;
    if (aplicarMora(estado, expensa.id).moraActualizada) {
      aplicadas += 1;
      registrarAviso(estado, "MORA_APLICADA", expensa);
    }
  }
  return { aplicadas, saldosAplicados };
}

// ----- Pagos -----

export function registrarPago(estado: EstadoSimulacion, expensaId: string, datos: { monto?: unknown; metodoPago?: unknown; referencia?: unknown }) {
  const monto = parsearMonto(datos.monto);
  validarMetodoPago(datos.metodoPago);
  const metodoPago = datos.metodoPago;
  const referencia = normalizarReferencia(datos.referencia);
  const expensa = buscarExpensa(estado, expensaId);
  if (expensa.estado === "PAGADA") throw error("La expensa ya esta pagada, no se pueden registrar mas pagos", 409);

  const deudas = cargarDeudas(estado, expensa.inmuebleId);
  const primera = deudas[0];
  if (primera && primera.expensa.id !== expensaId) {
    throw error(
      `Debe pagar primero el periodo ${primera.expensa.periodo} (Bs ${dinero(primera.pendiente.total)}): ` +
        "los pagos se aplican siempre del mes mas antiguo al mas nuevo.",
      409, "ORDEN_DE_PAGO", { periodoPendiente: primera.expensa.periodo, expensaId: primera.expensa.id, pendiente: dinero(primera.pendiente.total) });
  }
  const tipoPago = planificarPago(deudas, monto);

  estado.folio += 1;
  const folioNumero = estado.folio;
  const fecha = ahora(estado);
  const pendientes = pendientesDe(expensa);
  const { aMora, aExpensa, total: aplicado } = dividirAplicacion(monto, pendientes);
  const exceso = monto - aplicado;

  let pago: PagoSim | null = null;
  if (pendientes.total > 0 && aplicado > 0) {
    pago = {
      id: nuevoId(estado, "pago"), expensaId, monto: aplicado, montoMora: aMora, montoExpensa: aExpensa,
      metodoPago, referencia, fechaPago: fecha, folioNumero,
    };
    expensa.pagos.push(pago);
    expensa.estado = calcularEstado(expensa, expensa.estado === "VENCIDA");
  }
  if (exceso > 0) {
    estado.movimientos.push({
      id: nuevoId(estado, "mov"), inmuebleId: expensa.inmuebleId, tipo: "EXCESO_PAGO", monto: exceso, expensaId,
      metodoPago, referencia, folioNumero, createdAt: fecha,
    });
  }

  return {
    pago, expensa, recibo: { folio: formatearFolio(folioNumero), montoTotal: dinero(monto), metodoPago, referencia, fechaPago: fecha },
    montoRecibido: dinero(monto), montoAplicado: dinero(aplicado), montoAplicadoMora: dinero(aMora), montoAplicadoExpensa: dinero(aExpensa),
    saldoFavorGenerado: dinero(exceso), tipoPago,
  };
}

export function aplicarSaldoFavor(estado: EstadoSimulacion, expensaId: string) {
  const expensa = buscarExpensa(estado, expensaId);
  if (expensa.estado === "PAGADA") throw error("La expensa ya esta pagada", 409);
  const saldo = saldoFavorDe(estado, expensa.inmuebleId);
  if (saldo <= 0) throw error("El inmueble no tiene saldo a favor disponible", 409);

  const primera = cargarDeudas(estado, expensa.inmuebleId)[0];
  if (primera && primera.expensa.id !== expensaId) {
    throw error(`Debe cubrir primero el periodo ${primera.expensa.periodo}: el saldo a favor se aplica del mes mas antiguo al mas nuevo.`, 409, "ORDEN_DE_PAGO");
  }
  if (primera && primera.atrasada && saldo < primera.pendiente.total) {
    throw error(
      `El saldo a favor (Bs ${dinero(saldo)}) no alcanza para completar el periodo atrasado ` +
        `${primera.expensa.periodo} (Bs ${dinero(primera.pendiente.total)}). Los meses anteriores no admiten pagos parciales.`,
      409, "DEUDA_ATRASADA");
  }
  const aplicado = aplicarSaldoAExpensa(estado, expensa);
  if (aplicado <= 0) throw error("El inmueble no tiene saldo a favor disponible", 409);
  return { expensa, saldoFavorAplicado: dinero(aplicado) };
}

export function registrarPagoAnticipado(estado: EstadoSimulacion, inmuebleId: string, datos: { monto?: unknown; metodoPago?: unknown; referencia?: unknown }) {
  const monto = parsearMonto(datos.monto);
  validarMetodoPago(datos.metodoPago);
  const metodoPago = datos.metodoPago;
  const referencia = normalizarReferencia(datos.referencia);
  const inmueble = buscarInmueble(estado, inmuebleId);
  if (inmueble.clase !== "DEPARTAMENTO") {
    throw error(`El inmueble ${inmueble.codigo} es ${inmueble.clase === "BAULERA" ? "una baulera" : "un parqueo"}: solo los departamentos pagan expensa`, 409);
  }
  const primera = cargarDeudas(estado, inmuebleId)[0];
  if (primera) {
    throw error(
      `El inmueble tiene deuda pendiente (periodo ${primera.expensa.periodo}, Bs ${dinero(primera.pendiente.total)}). ` +
        "Registre un pago normal: se aplica primero a la deuda mas antigua y lo que sobre queda como pago anticipado.",
      409, "DEUDA_PENDIENTE");
  }

  estado.folio += 1;
  const fecha = ahora(estado);
  const movimiento: MovimientoSim = {
    id: nuevoId(estado, "mov"), inmuebleId, tipo: "PAGO_ANTICIPADO", monto, expensaId: null,
    metodoPago, referencia, folioNumero: estado.folio, createdAt: fecha,
  };
  estado.movimientos.push(movimiento);
  return {
    movimiento: movimientoDTO(movimiento),
    recibo: { folio: formatearFolio(estado.folio), montoTotal: dinero(monto), metodoPago, referencia, fechaPago: fecha },
    saldoFavor: dinero(saldoFavorDe(estado, inmuebleId)),
    tipoPago: "ANTICIPADO",
    mensaje: "Pago anticipado registrado como saldo a favor. Se descuenta solo en la proxima expensa que se genere.",
  };
}

// ----- Agua y vencimiento -----

export function cargarAgua(estado: EstadoSimulacion, expensaId: string, montoAgua: unknown) {
  const agua = parsearMonto(montoAgua, "montoAgua", true);
  const expensa = buscarExpensa(estado, expensaId);
  if (expensa.moras.length > 0) throw error("La expensa ya tiene mora generada: no se puede cambiar el agua", 409, "EXPENSA_CON_MORA");

  const aguaAnterior = expensa.montoAgua;
  if (expensa.aguaRegistradaEn && aguaAnterior === agua) throw error("El agua de esta expensa ya es ese monto", 409, "SIN_CAMBIO");

  const montoTotal = expensa.montoBase + agua;
  const pagadoExpensa = sumar(expensa.pagos, (p) => p.montoExpensa);
  const codigo = buscarInmueble(estado, expensa.inmuebleId).codigo;
  if (montoTotal < pagadoExpensa) {
    throw error(
      `No se puede cargar ese monto: la expensa de ${codigo} quedaria en Bs ${dinero(montoTotal)} y ya se pago Bs ${dinero(pagadoExpensa)}`,
      409, "AGUA_MENOR_A_LO_PAGADO", { inmueble: codigo });
  }

  expensa.montoAgua = agua;
  expensa.montoTotal = montoTotal;
  expensa.estado = calcularEstado(expensa, expensa.estado === "VENCIDA");
  expensa.aguaRegistradaEn = ahora(estado);

  const bolDiaDescuento = estado.fecha >= fechaDescuentoSaldo(expensa.periodo, configDeLaExpensa(estado, expensa));
  const aplicado = agua > aguaAnterior && bolDiaDescuento && !hayDeudaAnterior(estado, expensa) ? aplicarSaldoAExpensa(estado, expensa) : 0;
  return { expensa, aplicado };
}

export function cambiarVencimiento(estado: EstadoSimulacion, expensaId: string, datos: { fechaVencimiento?: unknown; motivo?: unknown }) {
  const fecha = datos.fechaVencimiento;
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw error("fechaVencimiento debe tener el formato YYYY-MM-DD", 400);
  const nueva = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(nueva.getTime()) || nueva.toISOString().slice(0, 10) !== fecha) throw error("fechaVencimiento no es una fecha valida", 400);

  let motivo: string | null = null;
  if (datos.motivo !== undefined && datos.motivo !== null && datos.motivo !== "") {
    if (typeof datos.motivo !== "string" || datos.motivo.trim().length > 300) throw error("motivo debe ser un texto de hasta 300 caracteres", 400);
    motivo = datos.motivo.trim() || null;
  }

  const expensa = buscarExpensa(estado, expensaId);
  if (expensa.estado === "PAGADA") throw error("La expensa ya esta pagada: no se puede cambiar su vencimiento", 409, "EXPENSA_PAGADA");
  if (expensa.moras.length > 0) throw error("La expensa ya tiene mora generada: no se puede cambiar su vencimiento", 409, "EXPENSA_CON_MORA");

  const anterior = fechaCalendario(expensa.fechaVencimiento);
  if (anterior === fecha) throw error("La fecha de vencimiento ya es esa", 409, "SIN_CAMBIO");
  if (fecha < fechaEnZona(expensa.createdAt)) throw error("El vencimiento no puede ser anterior al dia en que se genero la expensa", 400);

  if (expensa.estado === "VENCIDA") {
    const config = configDeLaExpensa(estado, expensa);
    if (config && estado.fecha <= sumarDias(fecha, config.diasGracia)) expensa.estado = calcularEstado(expensa);
  }
  expensa.cambiosVencimiento.push({
    id: nuevoId(estado, "cambio"), fechaAnterior: `${anterior}T00:00:00.000Z`, fechaNueva: nueva.toISOString(), motivo, createdAt: ahora(estado),
  });
  expensa.fechaVencimiento = nueva.toISOString();
  return expensa;
}

// ----- Reloj y borrado -----

/**
 * Mueve la fecha simulada. Al avanzar repite día por día lo que hace el cron real (generación y
 * mora). Para retroceder no debe haber datos: el pasado ya simulado no se puede deshacer.
 */
export function moverFecha(estado: EstadoSimulacion, nuevaFecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha) || Number.isNaN(aMs(nuevaFecha))) throw error("La fecha no es válida.", 400);
  const resumen = { dias: 0, expensasGeneradas: 0, expensasConMora: 0, saldosAplicados: 0, periodos: [] as string[] };

  if (nuevaFecha < estado.fecha) {
    if (estado.expensas.length > 0 || estado.movimientos.length > 0) {
      throw error("Para volver a una fecha anterior primero hay que eliminar los datos de la simulación.", 409);
    }
    estado.fecha = nuevaFecha;
    return resumen;
  }

  const dias = Math.round((aMs(nuevaFecha) - aMs(estado.fecha)) / MS_POR_DIA);
  if (dias > MAX_DIAS_POR_SALTO) throw error("El salto máximo es de 3 años. Avanza por partes.", 400);

  for (let i = 0; i < dias; i++) {
    estado.fecha = sumarDias(estado.fecha, 1);
    const generacion = ejecutarGeneracion(estado);
    if (generacion.generadas > 0) {
      resumen.expensasGeneradas += generacion.generadas;
      if (generacion.periodo) resumen.periodos.push(generacion.periodo);
    }
    const mora = ejecutarMora(estado);
    resumen.expensasConMora += mora.aplicadas;
    resumen.saldosAplicados += mora.saldosAplicados;
  }
  resumen.dias = dias;
  return resumen;
}

export const ultimoPeriodo = (estado: EstadoSimulacion) =>
  estado.expensas.reduce<string | null>((ultimo, e) => (ultimo === null || e.periodo > ultimo ? e.periodo : ultimo), null);

/** Borra las expensas del mes más reciente con sus pagos y mora, para poder generarlas de nuevo. */
export function eliminarUltimoPeriodo(estado: EstadoSimulacion) {
  const periodo = ultimoPeriodo(estado);
  if (!periodo) throw error("No hay expensas para eliminar.", 409);

  const ids = new Set(estado.expensas.filter((e) => e.periodo === periodo).map((e) => e.id));
  const movimientos = estado.movimientos.filter((m) => !m.expensaId || !ids.has(m.expensaId));
  const quedaNegativo = estado.inmuebles.some((i) => sumar(movimientos.filter((m) => m.inmuebleId === i.id), (m) => m.monto) < 0);
  if (quedaNegativo) {
    throw error(`No se puede eliminar ${periodo}: su saldo a favor ya se usó en otro mes. Elimina todos los datos.`, 409);
  }
  estado.expensas = estado.expensas.filter((e) => !ids.has(e.id));
  estado.movimientos = movimientos;
  estado.envios = estado.envios.filter((envio) => !ids.has(envio.expensaId));
  return { periodo, eliminadas: ids.size };
}

// ----- Respuestas con el formato de la API -----

function pagoDTO(pago: PagoSim) {
  return { ...pago, monto: dinero(pago.monto), montoMora: dinero(pago.montoMora), montoExpensa: dinero(pago.montoExpensa) };
}

export function movimientoDTO(movimiento: MovimientoSim) {
  return { ...movimiento, monto: dinero(movimiento.monto), registradoPorId: null, registradoPor: null };
}

export function inmuebleDTO(estado: EstadoSimulacion, inmueble: InmuebleSim) {
  const tipo = tipoDe(estado, inmueble);
  return {
    ...inmueble,
    asignado: ocupantesVigentes(estado, inmueble.id).length > 0,
    ...(tipo ? { tipoInmueble: { id: tipo.id, nombre: tipo.nombre, montoBase: tipo.montoBase } } : {}),
  };
}

export function expensaDTO(estado: EstadoSimulacion, expensa: ExpensaSim) {
  const inmueble = buscarInmueble(estado, expensa.inmuebleId);
  return {
    ...expensa,
    montoBase: dinero(expensa.montoBase),
    montoAgua: dinero(expensa.montoAgua),
    montoTotal: dinero(expensa.montoTotal),
    montoMora: dinero(expensa.montoMora),
    planPagoId: null,
    inmueble: inmuebleDTO(estado, inmueble),
    pagos: expensa.pagos.map(pagoDTO),
    moras: expensa.moras.map((m) => ({ ...m, fechaCorte: `${m.fechaCorte}T00:00:00.000Z`, base: dinero(m.base), monto: dinero(m.monto) })),
    cargos: [...expensa.cargos]
      .sort((a, b) => ORDEN_CLASE_CARGO[a.clase] - ORDEN_CLASE_CARGO[b.clase] || compararCodigo(a, b))
      .map((c) => ({ ...c, monto: dinero(c.monto) })),
    cambiosVencimiento: [...expensa.cambiosVencimiento].reverse(),
    saldoFavorInmueble: dinero(saldoFavorDe(estado, expensa.inmuebleId)),
    pagadoConSaldoFavor: dinero(sumar(expensa.pagos.filter((p) => p.metodoPago === "SALDO_A_FAVOR"), (p) => p.monto)),
  };
}

export function listarExpensas(estado: EstadoSimulacion, filtros: Record<string, unknown>) {
  const { periodo, estado: estadoExpensa, inmuebleId, aguaCargada, pagina, porPagina } = filtros;
  const filtradas = estado.expensas
    .filter((e) =>
      (!periodo || e.periodo === periodo) &&
      (!estadoExpensa || e.estado === estadoExpensa) &&
      (!inmuebleId || e.inmuebleId === inmuebleId) &&
      (aguaCargada === undefined || (aguaCargada === "true") === (e.aguaRegistradaEn !== null)))
    .sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento) ||
      buscarInmueble(estado, a.inmuebleId).codigo.localeCompare(buscarInmueble(estado, b.inmuebleId).codigo));

  if (pagina === undefined) return filtradas.map((e) => expensaDTO(estado, e));

  const numeroPagina = Math.max(1, Number.parseInt(String(pagina), 10) || 1);
  const tamanio = Math.min(200, Math.max(1, Number.parseInt(String(porPagina), 10) || 50));
  return {
    expensas: filtradas.slice((numeroPagina - 1) * tamanio, numeroPagina * tamanio).map((e) => expensaDTO(estado, e)),
    paginacion: { pagina: numeroPagina, porPagina: tamanio, total: filtradas.length, totalPaginas: Math.ceil(filtradas.length / tamanio) },
  };
}

function resumenInmueble(estado: EstadoSimulacion, inmueble: InmuebleSim) {
  return {
    id: inmueble.id,
    codigo: inmueble.codigo,
    clase: inmueble.clase,
    tipo: tipoDe(estado, inmueble)?.nombre ?? ETIQUETA_CLASE[inmueble.clase] ?? inmueble.clase,
    activo: inmueble.activo,
  };
}

const situacionDe = (neto: number) => (neto > 0 ? "DEBE" : neto < 0 ? "A_FAVOR" : "AL_DIA");

export function obtenerSaldo(estado: EstadoSimulacion, inmuebleId: string) {
  const inmueble = buscarInmueble(estado, inmuebleId);
  const deudas = cargarDeudas(estado, inmuebleId);
  const atrasadas = deudas.filter((d) => d.atrasada);
  const deudaPendiente = sumar(deudas, (d) => d.pendiente.total);
  const saldoFavor = saldoFavorDe(estado, inmuebleId);
  const primera = deudas[0];
  return {
    inmueble: resumenInmueble(estado, inmueble),
    deudaPendiente: dinero(deudaPendiente),
    deudaEnPlanDePagos: "0.00",
    saldoFavor: dinero(saldoFavor),
    saldoNeto: dinero(deudaPendiente - saldoFavor),
    situacion: situacionDe(deudaPendiente - saldoFavor),
    alDia: atrasadas.length === 0,
    deudaAtrasada: dinero(sumar(atrasadas, (d) => d.pendiente.total)),
    proximoPago: primera ? {
      expensaId: primera.expensa.id,
      periodo: primera.expensa.periodo,
      atrasada: primera.atrasada,
      pendiente: dinero(primera.pendiente.total),
      montoMinimo: dinero(primera.atrasada ? primera.pendiente.total : 0),
    } : null,
    expensasPendientes: deudas.map((d) => ({
      id: d.expensa.id,
      periodo: d.expensa.periodo,
      estado: d.expensa.estado,
      tipo: d.expensa.tipoNombre,
      atrasada: d.atrasada,
      pendiente: dinero(d.pendiente.total),
      pendienteMora: dinero(d.pendiente.mora),
      pendienteExpensa: dinero(d.pendiente.expensa),
    })),
  };
}

export function listarMovimientosSaldo(estado: EstadoSimulacion, inmuebleId: string) {
  const inmueble = buscarInmueble(estado, inmuebleId);
  return {
    inmueble: resumenInmueble(estado, inmueble),
    saldoFavor: dinero(saldoFavorDe(estado, inmuebleId)),
    movimientos: estado.movimientos
      .filter((m) => m.inmuebleId === inmuebleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(movimientoDTO),
  };
}

// Mismo orden del libro que estado-cuenta.util.js.
const ORDEN_EVENTO = { EXPENSA: 1, MORA: 2, PAGO: 3, APLICACION_SALDO: 4, SALDO_A_FAVOR: 5 };
type TipoEvento = keyof typeof ORDEN_EVENTO;
interface EventoLibro {
  tipo: TipoEvento;
  fecha: string;
  marca: number;
  descripcion: string;
  periodo: string | null;
  expensaId: string | null;
  importe: number;
  importeOriginal?: number;
  metodoPago?: string | null;
  referencia?: string | null;
  folio?: string | null;
  desglose?: { concepto: string; monto: string }[];
  fechaGeneracion?: string;
  detalle: Record<string, string>;
}
const grupoEvento = (evento: EventoLibro) => (ORDEN_EVENTO[evento.tipo] <= 2 ? ORDEN_EVENTO[evento.tipo] : 3);

function eventosDelLibro(expensas: ExpensaSim[], abonos: MovimientoSim[]) {
  const eventos: EventoLibro[] = [];
  for (const expensa of expensas) {
    eventos.push({
      tipo: "EXPENSA", fecha: fechaCalendario(expensa.fechaVencimiento), marca: Date.parse(expensa.createdAt),
      descripcion: `Expensa del periodo ${expensa.periodo}`, periodo: expensa.periodo, expensaId: expensa.id, importe: expensa.montoTotal,
      desglose: [
        ...[...expensa.cargos].sort((a, b) => ORDEN_CLASE_CARGO[a.clase] - ORDEN_CLASE_CARGO[b.clase] || compararCodigo(a, b)).map((cargo) => ({
          concepto: cargo.clase === "DEPARTAMENTO"
            ? `Tarifa fija - ${ETIQUETA_CLASE[cargo.clase]} ${cargo.codigo} (tipo ${expensa.tipoNombre})`
            : `${ETIQUETA_CLASE[cargo.clase]} ${cargo.codigo}`,
          monto: dinero(cargo.monto),
        })),
        { concepto: "Agua", monto: dinero(expensa.montoAgua) },
      ],
      fechaGeneracion: fechaEnZona(expensa.createdAt),
      detalle: { tarifaFija: dinero(expensa.montoBase), agua: dinero(expensa.montoAgua), total: dinero(expensa.montoTotal) },
    });
    for (const mora of expensa.moras) {
      eventos.push({
        tipo: "MORA", fecha: mora.fechaCorte, marca: Date.parse(mora.createdAt),
        descripcion: `Mora de la expensa ${expensa.periodo} (mes ${mora.mes})`, periodo: expensa.periodo, expensaId: expensa.id, importe: mora.monto,
        detalle: { mes: mora.mes, base: dinero(mora.base), tipoValor: mora.tipoValor, valor: String(mora.valor) },
      });
    }
    for (const pago of expensa.pagos) {
      const conSaldo = pago.metodoPago === "SALDO_A_FAVOR";
      eventos.push({
        tipo: conSaldo ? "APLICACION_SALDO" : "PAGO", fecha: fechaEnZona(pago.fechaPago), marca: Date.parse(pago.fechaPago),
        descripcion: conSaldo ? `Saldo a favor aplicado a la expensa ${expensa.periodo}` : `Pago aplicado a la expensa ${expensa.periodo}`,
        periodo: expensa.periodo, expensaId: expensa.id, importe: pago.monto, metodoPago: pago.metodoPago, referencia: pago.referencia,
        folio: pago.folioNumero ? formatearFolio(pago.folioNumero) : null,
        detalle: { aMora: dinero(pago.montoMora), aExpensa: dinero(pago.montoExpensa) },
        importeOriginal: expensa.montoTotal,
      });
    }
  }
  for (const abono of abonos) {
    eventos.push({
      tipo: "SALDO_A_FAVOR", fecha: fechaEnZona(abono.createdAt), marca: Date.parse(abono.createdAt),
      descripcion: abono.tipo === "PAGO_ANTICIPADO" ? "Saldo a favor por pago anticipado" : "Saldo a favor por pago en exceso",
      periodo: null, expensaId: abono.expensaId, importe: abono.monto, metodoPago: abono.metodoPago, referencia: abono.referencia,
      folio: abono.folioNumero ? formatearFolio(abono.folioNumero) : null, detalle: { origen: abono.tipo },
    });
  }
  return eventos.sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || grupoEvento(a) - grupoEvento(b) || a.marca - b.marca || ORDEN_EVENTO[a.tipo] - ORDEN_EVENTO[b.tipo]);
}

function instantanea(deuda: number, favor: number) {
  const neto = deuda - favor;
  return {
    deuda: dinero(deuda),
    saldoFavor: dinero(favor),
    saldoNeto: dinero(neto),
    saldoAdeudado: dinero(neto > 0 ? neto : 0),
    saldoAFavorRestante: dinero(neto < 0 ? -neto : 0),
    situacion: situacionDe(neto),
  };
}

export function armarLibro(eventos: EventoLibro[]) {
  let deuda = 0;
  let favor = 0;
  let totalCargos = 0;
  let totalAbonos = 0;
  const porExpensa = new Map<string, { expensaId: string; periodo: string; cargo: number; pagado: number }>();
  const movimientos = eventos.map((e) => {
    let cargo = 0;
    let abono = 0;
    let obligacion: { expensaId: string; periodo: string; cargo: number; pagado: number } | null = null;
    if (e.expensaId && e.periodo) {
      obligacion = porExpensa.get(e.expensaId) ?? { expensaId: e.expensaId, periodo: e.periodo, cargo: 0, pagado: 0 };
      porExpensa.set(e.expensaId, obligacion);
    }

    if ((e.tipo === "EXPENSA" || e.tipo === "MORA") && obligacion) {
      cargo = e.importe;
      deuda += e.importe;
      obligacion.cargo += e.importe;
    } else if (e.tipo === "PAGO" && obligacion) {
      abono = e.importe;
      deuda -= e.importe;
      obligacion.pagado += e.importe;
    } else if (e.tipo === "APLICACION_SALDO" && obligacion) {
      deuda -= e.importe;
      favor -= e.importe;
      obligacion.pagado += e.importe;
    } else if (e.tipo === "SALDO_A_FAVOR") {
      abono = e.importe;
      favor += e.importe;
    }
    totalCargos += cargo;
    totalAbonos += abono;

    return {
      fecha: e.fecha,
      tipo: e.tipo,
      descripcion: e.descripcion,
      periodo: e.periodo,
      expensaId: e.expensaId,
      cargo: dinero(cargo),
      abono: dinero(abono),
      ...(e.tipo === "APLICACION_SALDO" ? { aplicadoDeSaldoAFavor: dinero(e.importe) } : {}),
      ...(e.metodoPago ? { metodoPago: e.metodoPago, metodoEtiqueta: ETIQUETA_METODO[e.metodoPago] ?? e.metodoPago } : {}),
      ...(e.referencia ? { referencia: e.referencia } : {}),
      ...(e.folio ? { folio: e.folio } : {}),
      ...(e.desglose ? { desglose: e.desglose, fechaGeneracion: e.fechaGeneracion } : {}),
      detalle: e.detalle,
      ...((e.tipo === "PAGO" || e.tipo === "APLICACION_SALDO") && obligacion ? {
        obligacion: {
          expensaId: obligacion.expensaId,
          periodo: obligacion.periodo,
          importeOriginal: dinero(e.importeOriginal ?? 0),
          pagadoHastaAqui: dinero(obligacion.pagado),
          saldoPendiente: dinero(Math.max(obligacion.cargo - obligacion.pagado, 0)),
        },
      } : {}),
      saldoCorrido: instantanea(deuda, favor),
    };
  });

  return {
    movimientos,
    saldoFinal: instantanea(deuda, favor),
    totalCargos: dinero(totalCargos),
    totalAbonos: dinero(totalAbonos),
    deudasPendientes: [...porExpensa.values()]
      .filter((o) => o.cargo - o.pagado > 0)
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .map((o) => ({ expensaId: o.expensaId, periodo: o.periodo, importeCargado: dinero(o.cargo), pagado: dinero(o.pagado), pendiente: dinero(o.cargo - o.pagado) })),
  };
}

/** Estado de cuenta completo de un inmueble (la simulación no filtra por período). */
export function obtenerEstadoCuenta(estado: EstadoSimulacion, inmuebleId: string) {
  const inmueble = buscarInmueble(estado, inmuebleId);
  const expensas = estado.expensas
    .filter((e) => e.inmuebleId === inmuebleId)
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  const movimientos = estado.movimientos
    .filter((m) => m.inmuebleId === inmuebleId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ocupantes = ocupantesVigentes(estado, inmuebleId);
  const reciente = periodoMasReciente(estado, inmuebleId);
  const libro = armarLibro(eventosDelLibro(expensas, movimientos.filter((m) => m.tipo !== "APLICACION_EXPENSA")));
  const saldoFavor = saldoFavorDe(estado, inmuebleId);
  const deudaPendiente = sumar(expensas, (e) => pendientesDe(e).total);

  return {
    inmueble: resumenInmueble(estado, inmueble),
    ocupantes: ocupantes.map((o) => ({ ...o.copropietario, email: null, telefono: null, rol: o.esPropietario ? "PROPIETARIO" : "INQUILINO" })),
    responsable: ocupantes[0] ? {
      id: ocupantes[0].copropietario.id,
      nombre: `${ocupantes[0].copropietario.nombre} ${ocupantes[0].copropietario.apellido}`,
      rol: ocupantes[0].esPropietario ? "PROPIETARIO" : "INQUILINO",
    } : null,
    periodo: { desde: null, hasta: null, mes: null, etiqueta: "Todos los movimientos" },
    rango: { desde: null, hasta: null },
    generadoEn: new Date(instante(estado)).toISOString(),
    sinMovimientos: libro.movimientos.length === 0,
    mensaje: libro.movimientos.length === 0 ? "No existen movimientos para el periodo seleccionado" : null,
    saldoAnterior: instantanea(0, 0),
    movimientos: libro.movimientos,
    deudasPendientes: libro.deudasPendientes,
    resumenPeriodo: { saldoAnterior: "0.00", totalCargos: libro.totalCargos, totalAbonos: libro.totalAbonos, saldoFinal: libro.saldoFinal },
    expensas: expensas.map((e) => {
      const pendientes = pendientesDe(e);
      const pagadoMora = sumar(e.pagos, (p) => p.montoMora);
      let moraPorRepartir = pagadoMora;
      return {
        id: e.id,
        periodo: e.periodo,
        tipo: e.tipoNombre,
        fechaGeneracion: e.createdAt,
        responsable: { id: e.responsableId, nombre: e.responsableNombre, rol: e.responsableRol },
        fechaVencimiento: e.fechaVencimiento,
        cambiosVencimiento: e.cambiosVencimiento,
        estado: e.estado,
        atrasada: reciente !== null && e.periodo < reciente && pendientes.total > 0,
        montoBase: dinero(e.montoBase),
        cargos: [...e.cargos].sort((a, b) => ORDEN_CLASE_CARGO[a.clase] - ORDEN_CLASE_CARGO[b.clase] || compararCodigo(a, b)).map((c) => ({ ...c, monto: dinero(c.monto) })),
        montoAgua: dinero(e.montoAgua),
        aguaRegistradaEn: e.aguaRegistradaEn,
        montoTotal: dinero(e.montoTotal),
        montoMora: dinero(e.montoMora),
        planPagoId: null,
        pagado: dinero(sumar(e.pagos, (p) => p.monto)),
        pagadoMora: dinero(pagadoMora),
        pagadoExpensa: dinero(sumar(e.pagos, (p) => p.montoExpensa)),
        pendiente: dinero(pendientes.total),
        pendienteMora: dinero(pendientes.mora),
        pendienteExpensa: dinero(pendientes.expensa),
        moras: e.moras.map((m) => {
          const pagado = Math.min(moraPorRepartir, m.monto);
          moraPorRepartir -= pagado;
          return {
            numero: m.numero, mes: m.mes, fechaCorte: m.fechaCorte, base: dinero(m.base), tipoValor: m.tipoValor, valor: String(m.valor),
            monto: dinero(m.monto), pagado: dinero(pagado), pendiente: dinero(m.monto - pagado),
          };
        }),
        pagos: e.pagos.map(pagoDTO),
      };
    }),
    planesPago: [],
    movimientosSaldo: movimientos.map(movimientoDTO),
    resumen: {
      totalFacturado: dinero(sumar(expensas, (e) => e.montoTotal)),
      totalAgua: dinero(sumar(expensas, (e) => e.montoAgua)),
      totalMora: dinero(sumar(expensas, (e) => e.montoMora)),
      totalPagado: dinero(sumar(expensas, (e) => sumar(e.pagos, (p) => p.monto))),
      deudaPendiente: dinero(deudaPendiente),
      saldoFavor: dinero(saldoFavor),
      saldoNeto: dinero(deudaPendiente - saldoFavor),
      situacion: situacionDe(deudaPendiente - saldoFavor),
    },
  };
}

export function listarEnvios(estado: EstadoSimulacion, filtros: Record<string, unknown>) {
  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const porPagina = Math.max(1, Number(filtros.porPagina) || 20);
  // En la simulación ningún correo sale del sistema: todos quedan como omitidos.
  const envios = filtros.estado && filtros.estado !== "OMITIDO" ? [] : [...estado.envios].reverse();
  return {
    envios: envios.slice((pagina - 1) * porPagina, pagina * porPagina).map((envio) => ({
      ...envio, estado: "OMITIDO", destinatario: null, motivo: "Entorno de simulación: no se envían correos.",
    })),
    paginacion: { pagina, porPagina, total: envios.length, totalPaginas: Math.ceil(envios.length / porPagina) },
  };
}
