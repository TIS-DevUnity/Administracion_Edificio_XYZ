import { api } from "@/lib/api";
import {
  AplicarSaldoFavorResponse,
  ConfiguracionMoraDTO,
  ExpensaDTO,
  MetodoPago,
  RegistrarPagoResponse,
} from "@/types/finance";

export const financeService = {
  async getConfiguracionVigente(): Promise<ConfiguracionMoraDTO> {
    const response = await api.get<ConfiguracionMoraDTO>("/financiero/configuracion-mora");
    return response.data;
  },

  async getExpensas(): Promise<ExpensaDTO[]> {
    const response = await api.get<ExpensaDTO[]>("/financiero/expensas");
    return response.data;
  },

  async aplicarMoraManual(expensaId: string): Promise<ExpensaDTO> {
    const response = await api.post<ExpensaDTO>(`/financiero/expensas/${expensaId}/aplicar-mora`);
    return response.data;
  },

  async actualizarConfiguracion(data: { diaGeneracion: number; diasGracia: number; tipoValor: string; valor: number }): Promise<ConfiguracionMoraDTO> {
    const response = await api.post<ConfiguracionMoraDTO>("/financiero/configuracion-mora", data);
    return response.data;
  },

  // 👇 ESTA ES LA FUNCIÓN QUE HACE FUNCIONAR EL BOTÓN MANUAL
  async generarExpensaManual(data: { inmuebleId: string; periodo: string; fechaVencimiento: string }): Promise<ExpensaDTO> {
    const response = await api.post<ExpensaDTO>("/financiero/expensas", data);
    return response.data;
  },

  async registrarPago(
    expensaId: string,
    data: { monto: number; metodoPago: MetodoPago; referencia?: string }
  ): Promise<RegistrarPagoResponse> {
    const response = await api.post<RegistrarPagoResponse>(`/financiero/expensas/${expensaId}/pagos`, data);
    return response.data;
  },

  async aplicarSaldoFavor(expensaId: string): Promise<AplicarSaldoFavorResponse> {
    const response = await api.post<AplicarSaldoFavorResponse>(
      `/financiero/expensas/${expensaId}/aplicar-saldo`
    );
    return response.data;
  },

  async ejecutarGeneracionJob(forzar = true): Promise<{ generadas: number; omitidas: number }> {
    const response = await api.post<{ generadas: number; omitidas: number }>(
      `/financiero/jobs/ejecutar-generacion?forzar=${forzar}`
    );
    return response.data;
  },

  async ejecutarMoraJob(): Promise<{ aplicadas: number }> {
    const response = await api.post<{ aplicadas: number }>("/financiero/jobs/ejecutar-mora");
    return response.data;
  },
};