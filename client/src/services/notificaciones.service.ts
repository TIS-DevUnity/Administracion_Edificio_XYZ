import { api } from "@/lib/api";
import type {
  DetalleNotificacionDTO,
  EstadoEnvioCorreo,
  EstadoServicioCorreoDTO,
  ListaNotificacionesDTO,
  PaginaEnviosCorreoDTO,
} from "@/types/notificaciones";

/** Campanita (HU3 CA-15) y registro de correos (HU3 CA-16): /api/financiero/notificaciones. */
export const notificacionesService = {
  async listar(params: { soloNoLeidas?: boolean; limite?: number } = {}): Promise<ListaNotificacionesDTO> {
    const { data } = await api.get<ListaNotificacionesDTO>("/financiero/notificaciones", {
      params: {
        ...(params.soloNoLeidas ? { soloNoLeidas: "true" } : {}),
        ...(params.limite ? { limite: params.limite } : {}),
      },
    });
    return data;
  },

  /** Al abrirla, el backend la marca como leída si es del usuario. */
  async obtenerDetalle(id: string): Promise<DetalleNotificacionDTO> {
    const { data } = await api.get<DetalleNotificacionDTO>(`/financiero/notificaciones/${encodeURIComponent(id)}`);
    return data;
  },

  async marcarTodasLeidas(): Promise<{ marcadas: number }> {
    const { data } = await api.post<{ marcadas: number }>("/financiero/notificaciones/marcar-leidas");
    return data;
  },

  async listarCorreos(params: { estado?: EstadoEnvioCorreo; pagina?: number; porPagina?: number } = {}): Promise<PaginaEnviosCorreoDTO> {
    const { data } = await api.get<PaginaEnviosCorreoDTO>("/financiero/notificaciones/correos", { params });
    return data;
  },

  async estadoCorreo(): Promise<EstadoServicioCorreoDTO> {
    const { data } = await api.get<EstadoServicioCorreoDTO>("/financiero/notificaciones/correos/estado");
    return data;
  },
};
