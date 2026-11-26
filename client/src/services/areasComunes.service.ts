import axios from "axios";
import { api } from "@/lib/api";
import type { AreaComun, DisponibilidadArea, ErrorAreasComunes, EstadoReserva, ReservaArea } from "@/types/areasComunes";

// /api/areas-comunes (HU14). Ver y consultar disponibilidad: todos los roles; reservar, mis reservas y
// cancelar las propias: CONSULTA vinculado a un copropietario (Usuario.copropietarioId).
const BASE = "/areas-comunes";

/** Días máximos de anticipación para reservar (DIAS_MAXIMOS_ANTICIPACION del backend). */
export const DIAS_MAXIMOS_ANTICIPACION = 60;
/** Rango máximo de una consulta de disponibilidad (DIAS_MAXIMOS_DISPONIBILIDAD del backend). */
export const DIAS_MAXIMOS_DISPONIBILIDAD = 31;

// Mensajes que pide la HU14 (CA 2.1.3, 3.1.1, 3.1.2 y 3.2.1).
export const MENSAJE_RESERVA_EXITOSA = "Reserva registrada con éxito.";
export const MENSAJE_HORARIO_NO_DISPONIBLE = "El horario seleccionado ya no está disponible.";
export const MENSAJE_NO_AL_DIA = "Debes estar al día en tus pagos para reservar áreas comunes.";
export const MENSAJE_SIN_COPROPIETARIO =
  "Tu usuario no está vinculado a un copropietario. Pide al administrador que lo vincule para poder reservar.";

const MENSAJES_POR_CODIGO: Record<string, string> = {
  NO_AL_DIA: MENSAJE_NO_AL_DIA,
  TURNO_NO_DISPONIBLE: MENSAJE_HORARIO_NO_DISPONIBLE,
  USUARIO_SIN_COPROPIETARIO: MENSAJE_SIN_COPROPIETARIO,
  FECHA_PASADA: "No se puede reservar en una fecha pasada.",
  FUERA_DE_VENTANA: `Solo se puede reservar con hasta ${DIAS_MAXIMOS_ANTICIPACION} días de anticipación.`,
  TURNO_INEXISTENTE: "Ese horario no está habilitado para esta área en la fecha elegida.",
  YA_CANCELADA: "Esta reserva ya estaba cancelada.",
  TURNO_INICIADO: "El turno ya empezó: no se puede cancelar.",
  RESERVA_AJENA: "Solo puedes cancelar tus propias reservas.",
};

export interface ErrorReserva {
  codigo: string | null;
  mensaje: string;
  /** Solo NO_AL_DIA: monto adeudado vencido. */
  deudaVencida?: string;
}

/** Traduce el error del backend al mensaje que ve el copropietario. */
export function errorDeReserva(error: unknown, strFallback: string): ErrorReserva {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return { codigo: null, mensaje: "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo." };
    }
    const data = (error.response.data ?? {}) as ErrorAreasComunes;
    const codigo = data.codigo ?? null;
    if (codigo && MENSAJES_POR_CODIGO[codigo]) {
      return { codigo, mensaje: MENSAJES_POR_CODIGO[codigo], deudaVencida: data.deudaVencida };
    }
    if (error.response.status === 404) return { codigo, mensaje: "El área común ya no está disponible." };
    if (error.response.status === 403) return { codigo, mensaje: "No tienes permiso para realizar esta acción." };
    if (data.error) return { codigo, mensaje: data.error };
  }
  return { codigo: null, mensaje: strFallback };
}

export const areasComunesService = {
  async listar(signal?: AbortSignal): Promise<AreaComun[]> {
    const { data } = await api.get<{ areas: AreaComun[] }>(BASE, { signal });
    return data.areas;
  },

  async obtener(id: string, signal?: AbortSignal): Promise<AreaComun> {
    const { data } = await api.get<{ area: AreaComun }>(`${BASE}/${encodeURIComponent(id)}`, { signal });
    return data.area;
  },

  async disponibilidad(id: string, desde: string, hasta: string, signal?: AbortSignal): Promise<DisponibilidadArea> {
    const { data } = await api.get<DisponibilidadArea>(`${BASE}/${encodeURIComponent(id)}/disponibilidad`, {
      params: { desde, hasta },
      signal,
    });
    return data;
  },

  async reservar(id: string, turno: { fecha: string; horaInicio: string; horaFin: string }): Promise<ReservaArea> {
    const { data } = await api.post<{ reserva: ReservaArea }>(`${BASE}/${encodeURIComponent(id)}/reservas`, turno);
    return data.reserva;
  },

  async misReservas(estado?: EstadoReserva, signal?: AbortSignal): Promise<ReservaArea[]> {
    const { data } = await api.get<{ reservas: ReservaArea[] }>(`${BASE}/mis-reservas`, {
      params: estado ? { estado } : undefined,
      signal,
    });
    return data.reservas;
  },

  async cancelar(reservaId: string, motivo?: string): Promise<ReservaArea> {
    const { data } = await api.post<{ reserva: ReservaArea }>(
      `${BASE}/reservas/${encodeURIComponent(reservaId)}/cancelar`,
      motivo ? { motivo } : {}
    );
    return data.reserva;
  },
};
