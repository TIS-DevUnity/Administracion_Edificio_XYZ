import type { EstadoExpensa } from "@/types/finance";

/** Contratos de /api/financiero/notificaciones (campanita.service.js y notificaciones.service.js). HU3 CA-15/16. */

export type TipoNotificacion =
  | "PROXIMO_VENCIMIENTO"
  | "PROXIMA_MORA"
  | "OBLIGACION_VENCIDA"
  | "MORA_APLICADA"
  | "DEUDA_CON_MORA"
  | "PAGO_REGISTRADO";

export interface NotificacionDTO {
  id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  monto: string | null;
  leida: boolean;
  leidaEn: string | null;
  vigente: boolean;
  expensaId: string | null;
  createdAt: string;
}

export interface ListaNotificacionesDTO {
  notificaciones: NotificacionDTO[];
  noLeidas: number;
  total: number;
  /** Viene cuando el usuario no está vinculado a un residente. */
  mensaje?: string;
}

export interface ObligacionNotificacionDTO {
  expensaId: string;
  periodo: string;
  inmueble: { id: string; codigo: string; clase: string };
  estado: EstadoExpensa;
  fechaVencimiento: string;
  desglose: { concepto: string; monto: string }[];
  montoTotal: string;
  montoMora: string;
  moras: { mes: string; base: string; monto: string }[];
  pagado: string;
  pendiente: string;
  pendienteMora: string;
  pendienteExpensa: string;
}

export interface DetalleNotificacionDTO {
  notificacion: NotificacionDTO;
  obligacion: ObligacionNotificacionDTO | null;
}

export type EstadoEnvioCorreo = "ENVIADO" | "FALLIDO" | "OMITIDO";

export interface EnvioCorreoDTO {
  id: string;
  tipo: string;
  estado: EstadoEnvioCorreo;
  destinatario: string | null;
  asunto: string;
  motivo: string | null;
  expensaId: string | null;
  periodo: string | null;
  inmueble: string | null;
  createdAt: string;
}

export interface PaginaEnviosCorreoDTO {
  envios: EnvioCorreoDTO[];
  paginacion: { pagina: number; porPagina: number; total: number; totalPaginas: number };
}

export interface EstadoServicioCorreoDTO {
  configurado: boolean;
  faltan: string[];
  /** PRODUCCION: envía a los residentes; REDIRIGIDO/BLOQUEADO: entorno de pruebas. */
  modo: "PRODUCCION" | "REDIRIGIDO" | "BLOQUEADO";
}
