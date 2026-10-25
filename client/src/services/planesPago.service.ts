import { api } from "@/lib/api";
import type {
  CrearPlanPagoDTO,
  EstadoPlan,
  PagoPlanDTO,
  PlanPagoDTO,
  ResultadoPagoPlanDTO,
} from "@/types/planesPago";

/** Planes de pago en cuotas (HU3 CA-11): /api/financiero/planes-pago. */
export const planesPagoService = {
  async listar(filtros: { inmuebleId?: string; estado?: EstadoPlan } = {}): Promise<PlanPagoDTO[]> {
    const { data } = await api.get<{ planes: PlanPagoDTO[] }>("/financiero/planes-pago", { params: filtros });
    return data.planes;
  },

  async obtener(id: string): Promise<PlanPagoDTO> {
    const { data } = await api.get<{ plan: PlanPagoDTO }>(`/financiero/planes-pago/${encodeURIComponent(id)}`);
    return data.plan;
  },

  async crear(datos: CrearPlanPagoDTO): Promise<PlanPagoDTO> {
    const { data } = await api.post<{ plan: PlanPagoDTO }>("/financiero/planes-pago", datos);
    return data.plan;
  },

  /** `claveSolicitud` evita cobrar dos veces si la misma solicitud se reenvía (Idempotency-Key). */
  async registrarPago(id: string, datos: PagoPlanDTO, claveSolicitud: string): Promise<ResultadoPagoPlanDTO> {
    const { data } = await api.post<ResultadoPagoPlanDTO>(
      `/financiero/planes-pago/${encodeURIComponent(id)}/pagos`,
      datos,
      { headers: { "Idempotency-Key": claveSolicitud } }
    );
    return data;
  },

  async cancelar(id: string): Promise<PlanPagoDTO> {
    const { data } = await api.post<{ plan: PlanPagoDTO }>(`/financiero/planes-pago/${encodeURIComponent(id)}/cancelar`);
    return data.plan;
  },
};
