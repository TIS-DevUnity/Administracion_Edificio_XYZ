import { api } from "@/lib/api"; 
import { ConfiguracionMoraDTO, ExpensaDTO } from "@/types/finance";

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
  }
};