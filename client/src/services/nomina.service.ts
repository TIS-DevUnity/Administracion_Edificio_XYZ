import axios from "axios";
import { api } from "@/lib/api";
import type { FiltroNominas, Nomina, PagoNomina, PeriodoNomina, ReporteNomina, RespuestaGeneracion, RespuestaNominas, RespuestaPago } from "@/types/nomina";

const BASE = "/financiero/nomina";

export function mensajeErrorNomina(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; mensaje?: string; error?: string; codigo?: string } | undefined;
    if (typeof data?.message === "string") return data.message;
    if (typeof data?.mensaje === "string") return data.mensaje;
    if (typeof data?.error === "string") return data.error;
    if (!error.response) return "No se pudo conectar con el servidor. Revisa la conexión o el backend.";
    return `No se pudo completar la solicitud (HTTP ${error.response.status}).`;
  }
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}

/** Consume siempre el mismo cliente Axios que utiliza el resto del sistema (token JWT). */
export const nominaService = {
  async listar(filtros: FiltroNominas = {}): Promise<RespuestaNominas> {
    const { data } = await api.get<RespuestaNominas>(BASE, { params: filtros });
    return data;
  },
  async periodos(): Promise<PeriodoNomina[]> {
    const { data } = await api.get<{ periodos: PeriodoNomina[] }>(`${BASE}/periodos`);
    return data.periodos;
  },
  async generar(periodo: string): Promise<RespuestaGeneracion> {
    const { data } = await api.post<RespuestaGeneracion>(`${BASE}/generar`, { periodo });
    return data;
  },
  async detalle(id: string): Promise<Nomina> {
    const { data } = await api.get<{ nomina: Nomina }>(`${BASE}/${encodeURIComponent(id)}`);
    return data.nomina;
  },
  async pagar(id: string, pago: PagoNomina): Promise<RespuestaPago> {
    const { data } = await api.post<RespuestaPago>(`${BASE}/${encodeURIComponent(id)}/pagar`, pago);
    return data;
  },
  async reporte(periodo: string): Promise<ReporteNomina> {
    const { data } = await api.get<ReporteNomina>(`${BASE}/reporte`, { params: { periodo } });
    return data;
  },
  async boletaPdf(id: string): Promise<Blob> {
    const { data } = await api.get<Blob>(`${BASE}/${encodeURIComponent(id)}/boleta`, { responseType: "blob" });
    return data;
  },
  async reportePdf(periodo: string): Promise<Blob> {
    const { data } = await api.get<Blob>(`${BASE}/reporte/pdf`, { params: { periodo }, responseType: "blob" });
    return data;
  },
};
