import { api } from "@/lib/api";
import { MetodoPago } from "@/types/finance";
import {
  EstadoCuentaDTO,
  FiltroPeriodoCuenta,
  MovimientoSaldoDTO,
  PagoAnticipadoResponse,
  SaldoInmuebleDTO,
} from "@/types/cuentaInmueble";

export const cuentaInmuebleService = {
  async obtenerSaldo(inmuebleId: string): Promise<SaldoInmuebleDTO> {
    const response = await api.get<SaldoInmuebleDTO>(`/financiero/inmuebles/${inmuebleId}/saldo`);
    return response.data;
  },

  async obtenerEstadoCuenta(inmuebleId: string, params?: FiltroPeriodoCuenta): Promise<EstadoCuentaDTO> {
    const response = await api.get<EstadoCuentaDTO>(`/financiero/inmuebles/${inmuebleId}/estado-cuenta`, {
      params,
    });
    return response.data;
  },

  /** PDF generado por el backend (solo ADMINISTRADOR). `inline` lo prepara para vista previa. */
  async obtenerEstadoCuentaPdf(
    inmuebleId: string,
    params: FiltroPeriodoCuenta,
    inline = false
  ): Promise<Blob> {
    const response = await api.get<Blob>(`/financiero/inmuebles/${inmuebleId}/estado-cuenta/pdf`, {
      params: { ...params, ...(inline ? { inline: "true" } : {}) },
      responseType: "blob",
    });
    return response.data;
  },

  async listarMovimientosSaldo(
    inmuebleId: string
  ): Promise<{ saldoFavor: string; movimientos: MovimientoSaldoDTO[] }> {
    const response = await api.get<{ saldoFavor: string; movimientos: MovimientoSaldoDTO[] }>(
      `/financiero/inmuebles/${inmuebleId}/saldo-favor/movimientos`
    );
    return response.data;
  },

  async registrarPagoAnticipado(
    inmuebleId: string,
    data: { monto: number; metodoPago: MetodoPago; referencia?: string }
  ): Promise<PagoAnticipadoResponse> {
    const response = await api.post<PagoAnticipadoResponse>(
      `/financiero/inmuebles/${inmuebleId}/pagos-anticipados`,
      data
    );
    return response.data;
  },
};
