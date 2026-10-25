import type { EstadoExpensa, MetodoPago } from "@/types/finance";

/** Contratos de /api/financiero/planes-pago (planes-pago.service.js → presentar). HU3 CA-11. */

export type EstadoPlan = "ACTIVO" | "COMPLETADO" | "CANCELADO";
export type EstadoCuota = "PENDIENTE" | "PARCIAL" | "PAGADA" | "VENCIDA";

export interface PagoCuotaDTO {
  reciboId: string;
  folio: string | null;
  monto: string;
  fecha: string;
}

export interface CuotaPlanDTO {
  id: string;
  numero: number;
  monto: string;
  montoPagado: string;
  saldoPendiente: string;
  fechaVencimiento: string;
  estado: EstadoCuota;
  pagos: PagoCuotaDTO[];
}

export interface ExpensaEnPlanDTO {
  id: string;
  periodo: string;
  estado: EstadoExpensa;
  montoTotal: string;
  montoMora: string;
  pendiente: string;
}

export interface PlanPagoDTO {
  id: string;
  inmueble: { id: string; codigo: string };
  estado: EstadoPlan;
  observacion: string | null;
  montoTotal: string;
  cantidadCuotas: number;
  totalPagado: string;
  saldoPendiente: string;
  cuotasVencidas: number;
  proximaCuota: { numero: number; saldoPendiente: string; fechaVencimiento: string; estado: EstadoCuota } | null;
  expensas: ExpensaEnPlanDTO[];
  cuotas: CuotaPlanDTO[];
  registradoPor: { id: string; nombre: string; apellido: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Cuotas explícitas o `cantidadCuotas` + `primerVencimiento` (cuotas iguales, una por mes). */
export interface CrearPlanPagoDTO {
  inmuebleId: string;
  expensaIds?: string[];
  montoTotal?: number;
  cuotas?: { monto: number; fechaVencimiento: string }[];
  cantidadCuotas?: number;
  primerVencimiento?: string;
  observacion?: string;
}

export interface PagoPlanDTO {
  monto: number;
  metodoPago: MetodoPago;
  referencia?: string;
}

export interface ResultadoPagoPlanDTO {
  /** Ausente cuando la solicitud era un reenvío (`duplicado: true`). */
  plan?: PlanPagoDTO;
  duplicado?: boolean;
  recibo?: { id: string; folio: string; urlPdf: string } | null;
  montoRecibido?: string;
  aplicacionesCuotas?: { numero: number; montoAplicado: string; estado: EstadoCuota }[];
  mensaje?: string;
}
