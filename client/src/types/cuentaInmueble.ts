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

export interface EstadoCuentaDTO {
  inmueble: InmuebleResumenCuenta;
  rango: { desde: string | null; hasta: string | null };
  expensas: ExpensaEstadoCuenta[];
  movimientosSaldo: MovimientoSaldoDTO[];
  resumen: ResumenEstadoCuenta;
}

export interface PagoAnticipadoResponse {
  movimiento: MovimientoSaldoDTO;
  saldoFavor: string;
  mensaje: string;
}
