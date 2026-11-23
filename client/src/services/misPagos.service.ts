import axios from "axios";
import { api } from "@/lib/api";
import type { MetodoPago, MetodoPagoRegistro } from "@/types/finance";

// Portal del copropietario (HU14): informar pagos hechos fuera del sistema y ver su historial.
// Backend: /financiero/pagos-informados (informa CONSULTA, confirma o rechaza el ADMINISTRADOR),
// /financiero/inmuebles/:id/pagos y /financiero/recibos/:id/pdf (CONSULTA solo lo suyo).

export type EstadoPagoInformado = "PENDIENTE" | "CONFIRMADO" | "RECHAZADO";

export interface PagoInformado {
  id: string;
  estado: EstadoPagoInformado;
  inmueble: { id: string; codigo?: string };
  copropietario?: { id: string; nombre?: string; apellido?: string };
  monto: string;
  metodoPago: MetodoPago;
  referencia: string | null;
  fechaPago: string;
  tieneComprobante: boolean;
  comprobanteNombre: string | null;
  motivoRechazo: string | null;
  reciboId: string | null;
  revisadoEn: string | null;
  createdAt: string;
}

export interface PagoHistorial {
  id: string;
  folio: string | null;
  reciboId: string | null;
  monto: string;
  montoMora: string;
  montoExpensa: string;
  metodoPago: MetodoPagoRegistro;
  referencia: string | null;
  fechaPago: string;
  expensa: { id: string; periodo: string; estado: string } | null;
}

export interface DatosPagoInformado {
  inmuebleId: string;
  monto: string;
  metodoPago: MetodoPago;
  fechaPago: string;
  referencia?: string;
  archivo?: File | null;
}

/** Igual que el backend (recibos.service.js → MAX_COMPROBANTE_BYTES y formatos aceptados). */
export const MAX_COMPROBANTE_BYTES = 5 * 1024 * 1024;
export const FORMATOS_COMPROBANTE = ["image/jpeg", "image/png", "image/webp"];

export const ETIQUETA_METODO: Record<MetodoPagoRegistro, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
  SALDO_A_FAVOR: "Saldo a favor",
};

function claveSolicitud(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const misPagosService = {
  /** Una clave por intento de envío: si la red falla y se reintenta con la misma, no se duplica el aviso. */
  nuevaClave: claveSolicitud,

  async informar(datos: DatosPagoInformado, clave: string): Promise<{ pago: PagoInformado; duplicado?: boolean }> {
    const form = new FormData();
    form.append("inmuebleId", datos.inmuebleId);
    form.append("monto", datos.monto);
    form.append("metodoPago", datos.metodoPago);
    form.append("fechaPago", datos.fechaPago);
    if (datos.referencia?.trim()) form.append("referencia", datos.referencia.trim());
    if (datos.archivo) form.append("archivo", datos.archivo);
    const { data } = await api.post<{ pago: PagoInformado; duplicado?: boolean }>("/financiero/pagos-informados", form, {
      // Content-Type undefined: el navegador pone multipart/form-data con su boundary (igual que movimientos.service.ts).
      headers: { "Idempotency-Key": clave, "Content-Type": undefined },
    });
    return data;
  },

  async listarInformados(signal?: AbortSignal): Promise<PagoInformado[]> {
    const { data } = await api.get<{ pagos: PagoInformado[] }>("/financiero/pagos-informados", { signal });
    return data.pagos;
  },

  /** Enlace temporal (5 min) a la foto del comprobante. */
  async urlComprobante(id: string): Promise<string> {
    const { data } = await api.get<{ url: string }>(`/financiero/pagos-informados/${encodeURIComponent(id)}/comprobante`);
    return data.url;
  },

  async historial(inmuebleId: string, signal?: AbortSignal): Promise<PagoHistorial[]> {
    const { data } = await api.get<{ pagos: PagoHistorial[] }>(`/financiero/inmuebles/${encodeURIComponent(inmuebleId)}/pagos`, { signal });
    return data.pagos;
  },

  async reciboPdf(reciboId: string): Promise<Blob> {
    const { data } = await api.get<Blob>(`/financiero/recibos/${encodeURIComponent(reciboId)}/pdf`, { responseType: "blob" });
    return data;
  },
};

/**
 * Revisión de los pagos informados por el ADMINISTRADOR (confirmar o rechazar). DIRECTORIO solo puede listarlos.
 * Confirmar registra el pago normal del inmueble con su recibo; si no cumple las reglas de pago, el aviso sigue PENDIENTE.
 */
export const pagosInformadosAdminService = {
  async listar(estado?: EstadoPagoInformado, signal?: AbortSignal): Promise<PagoInformado[]> {
    const { data } = await api.get<{ pagos: PagoInformado[] }>("/financiero/pagos-informados", {
      params: estado ? { estado } : undefined,
      signal,
    });
    return data.pagos;
  },

  async confirmar(id: string): Promise<{ pago: PagoInformado; recibo?: { id: string; folio?: string } }> {
    const { data } = await api.post<{ pago: PagoInformado; recibo?: { id: string; folio?: string } }>(
      `/financiero/pagos-informados/${encodeURIComponent(id)}/confirmar`,
      {}
    );
    return data;
  },

  async rechazar(id: string, motivo: string): Promise<PagoInformado> {
    const { data } = await api.post<{ pago: PagoInformado }>(`/financiero/pagos-informados/${encodeURIComponent(id)}/rechazar`, { motivo });
    return data.pago;
  },
};

/** Largo máximo del motivo de rechazo (MAX_LARGO_MOTIVO del backend). */
export const MAX_MOTIVO_RECHAZO = 500;

/** Mensaje del backend (en las descargas el error llega como Blob con el JSON adentro). */
export async function mensajeErrorPago(error: unknown, strFallback: string): Promise<string> {
  if (axios.isAxiosError(error)) {
    if (!error.response) return "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
    let data: unknown = error.response.data;
    if (data instanceof Blob) {
      try {
        data = JSON.parse(await data.text());
      } catch {
        data = null;
      }
    }
    const { error: mensaje, codigo } = (data ?? {}) as { error?: string; codigo?: string };
    if (codigo === "USUARIO_SIN_COPROPIETARIO") {
      return "Tu usuario no está vinculado a un copropietario. Pide al administrador que lo vincule.";
    }
    if (codigo === "SOLO_INFORMACION_PROPIA") return "Solo puedes informar pagos de tus propios departamentos.";
    if (codigo === "PAGO_YA_REVISADO") return `${mensaje ?? "Este pago ya fue revisado"}. La lista se actualizó.`;    if (mensaje) return mensaje;
  }
  return strFallback;
}
