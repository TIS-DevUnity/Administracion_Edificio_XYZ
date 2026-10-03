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

export interface ExpensaEstadoCuenta {
  id: string;
  periodo: string;
  fechaVencimiento: string;
  estado: EstadoExpensa;
  montoTotal: number;
  montoMora: number;
  pagado: string;
  pendiente: string;
  pagos: PagoDTO[];
}

export interface ResumenEstadoCuenta {
  totalFacturado: string;
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
