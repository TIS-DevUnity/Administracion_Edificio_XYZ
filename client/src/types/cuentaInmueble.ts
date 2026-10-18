import { EstadoExpensa, MetodoPagoRegistro, PagoDTO } from "@/types/finance";

export type SituacionCuenta = "DEBE" | "AL_DIA" | "A_FAVOR";

export type TipoMovimientoSaldo =
  | "PAGO_ANTICIPADO"
  | "EXCESO_PAGO"
  | "APLICACION_EXPENSA";

export interface InmuebleResumenCuenta {
  id: string;
  codigo: string;
  tipo: string;
  activo: boolean;
}

export interface ExpensaPendienteResumen {
  id: string;
  periodo: string;
  estado: EstadoExpensa;
  pendiente: string;
}

export interface SaldoInmuebleDTO {
  inmueble: InmuebleResumenCuenta;
  deudaPendiente: string;
  saldoFavor: string;
  saldoNeto: string;
  situacion: SituacionCuenta;
  expensasPendientes: ExpensaPendienteResumen[];
}

export interface MovimientoSaldoDTO {
  id: string;
  inmuebleId: string;
  tipo: TipoMovimientoSaldo;
  monto: string;
  expensaId: string | null;
  metodoPago: MetodoPagoRegistro | null;
  referencia: string | null;
  registradoPorId: string | null;
  createdAt: string;
  registradoPor?: { id: string; nombre: string; apellido: string } | null;
}

/** Un mes de mora de una expensa (cuenta-inmueble.service.js → detalleMoras). */
export interface MoraDetalleCuenta {
  numero: number;
  mes: string;
  fechaCorte: string;
  base: string;
  tipoValor: "PORCENTAJE" | "MONTO_FIJO";
  valor: string;
  monto: string;
  pagado: string;
  pendiente: string;
}

export interface CambioVencimientoCuenta {
  id: string;
  fechaAnterior: string;
  fechaNueva: string;
  motivo: string | null;
  createdAt: string;
}

export interface ExpensaEstadoCuenta {
  id: string;
  periodo: string;
  tipo: string | null;
  fechaGeneracion: string;
  responsable: { id: string | null; nombre: string; rol: "PROPIETARIO" | "INQUILINO" | null } | null;
  fechaVencimiento: string;
  cambiosVencimiento: CambioVencimientoCuenta[];
  estado: EstadoExpensa;
  atrasada: boolean;
  montoBase: string;
  montoAgua: string;
  /** Expensa fija + agua, sin mora. */
  montoTotal: string;
  montoMora: string;
  pagado: string;
  pagadoMora: string;
  pagadoExpensa: string;
  pendiente: string;
  pendienteMora: string;
  pendienteExpensa: string;
  moras: MoraDetalleCuenta[];
  pagos: PagoDTO[];
}

export interface ResumenEstadoCuenta {
  totalFacturado: string;
  totalAgua: string;
  totalMora: string;
  totalPagado: string;
  deudaPendiente: string;
  saldoFavor: string;
  saldoNeto: string;
  situacion: SituacionCuenta;
}

/** Saldo en un instante del libro (cuenta-inmueble/estado-cuenta.util.js → instantanea). */
export interface SaldoInstantanea {
  deuda: string;
  saldoFavor: string;
  /** Positivo = debe, negativo = a favor. */
  saldoNeto: string;
  /** Nunca negativo: si el saldo a favor cubre la deuda es 0. */
  saldoAdeudado: string;
  saldoAFavorRestante: string;
  situacion: SituacionCuenta;
}

export type TipoMovimientoLibro = "EXPENSA" | "MORA" | "PAGO" | "APLICACION_SALDO" | "SALDO_A_FAVOR";

export interface MovimientoLibro {
  fecha: string;
  tipo: TipoMovimientoLibro;
  descripcion: string;
  periodo: string | null;
  expensaId: string | null;
  cargo: string;
  abono: string;
  aplicadoDeSaldoAFavor?: string;
  metodoPago?: string;
  metodoEtiqueta?: string;
  referencia?: string;
  folio?: string;
  /** Solo EXPENSA: una línea por concepto (tarifa fija, baulera/parqueo, agua). */
  desglose?: { concepto: string; monto: string }[];
  fechaGeneracion?: string;
  detalle?: Record<string, string>;
  /** Solo PAGO / APLICACION_SALDO: situación de la obligación luego de este pago. */
  obligacion?: {
    expensaId: string;
    periodo: string;
    importeOriginal: string;
    pagadoHastaAqui: string;
    saldoPendiente: string;
  };
  saldoCorrido: SaldoInstantanea;
}

export interface DeudaPendienteCuenta {
  expensaId: string;
  periodo: string;
  importeCargado: string;
  pagado: string;
  pendiente: string;
}

export interface OcupanteCuenta {
  id: string;
  nombre: string;
  apellido: string;
  ci: string;
  email: string | null;
  telefono: string | null;
  rol: "PROPIETARIO" | "INQUILINO";
}

export interface PeriodoEstadoCuenta {
  desde: string | null;
  hasta: string | null;
  mes: string | null;
  etiqueta: string;
}

export interface EstadoCuentaDTO {
  inmueble: InmuebleResumenCuenta & { clase?: "DEPARTAMENTO" | "BAULERA" | "PARQUEO" };
  rango: { desde: string | null; hasta: string | null };
  expensas: ExpensaEstadoCuenta[];
  movimientosSaldo: MovimientoSaldoDTO[];
  resumen: ResumenEstadoCuenta;
  ocupantes: OcupanteCuenta[];
  responsable: { id: string; nombre: string; rol: "PROPIETARIO" | "INQUILINO" } | null;
  periodo: PeriodoEstadoCuenta;
  generadoEn: string;
  sinMovimientos: boolean;
  mensaje: string | null;
  saldoAnterior: SaldoInstantanea;
  movimientos: MovimientoLibro[];
  deudasPendientes: DeudaPendienteCuenta[];
  resumenPeriodo: {
    saldoAnterior: string;
    totalCargos: string;
    totalAbonos: string;
    saldoFinal: SaldoInstantanea;
  };
}

/** Un mes (YYYY-MM) o un rango (YYYY-MM-DD, ambos opcionales). No se combinan. */
export type FiltroPeriodoCuenta = { mes: string } | { desde?: string; hasta?: string };

export interface PagoAnticipadoResponse {
  movimiento: MovimientoSaldoDTO;
  saldoFavor: string;
  mensaje: string;
}
