import { api } from "@/lib/api";
import {
  AplicarSaldoFavorResponse,
  ConfiguracionMoraDTO,
  ExpensaDTO,
  PaginaExpensasDTO,
  FiltrosExpensasDTO,
  MetodoPago,
  RegistrarPagoResponse,
  ResultadoGeneracionDTO,
  TipoInmuebleDTO,
  FacturaAguaDTO,
  DetalleFacturaAguaDTO,
} from "@/types/finance";

export const financeService = {
  async getConfiguracionVigente(): Promise<ConfiguracionMoraDTO> {
    const response = await api.get<ConfiguracionMoraDTO>("/financiero/configuracion-mora");
    return response.data;
  },

  async getConfiguracionHistorial(): Promise<ConfiguracionMoraDTO[]> {
    const response = await api.get<ConfiguracionMoraDTO[]>("/financiero/configuracion-mora/historial");
    return response.data;
  },

  async getExpensasPaginadas(filtros: FiltrosExpensasDTO, signal?: AbortSignal): Promise<PaginaExpensasDTO> {
    const { data } = await api.get<PaginaExpensasDTO>("/financiero/expensas", {
      params: filtros,
      signal,
    });
    return data;
  },

  async getExpensas(): Promise<ExpensaDTO[]> {
    const response = await api.get<ExpensaDTO[]>("/financiero/expensas");
    return response.data;
  },

  async aplicarMoraManual(expensaId: string): Promise<ExpensaDTO> {
    const response = await api.post<ExpensaDTO>(`/financiero/expensas/${expensaId}/aplicar-mora`);
    return response.data;
  },

  async actualizarConfiguracion(data: {
    diaGeneracion: number;
    diaVencimiento: number;
    diasGracia: number;
    tipoValor: "PORCENTAJE" | "MONTO_FIJO";
    modoMora: "UNICA" | "MENSUAL";
    valor: number;
    vigenteDesde?: string;
  }): Promise<ConfiguracionMoraDTO> {
    const response = await api.post<ConfiguracionMoraDTO>("/financiero/configuracion-mora", data);
    return response.data;
  },

  // 👇 ESTA ES LA FUNCIÓN QUE HACE FUNCIONAR EL BOTÓN MANUAL
  async generarExpensaManual(data: { inmuebleId: string; periodo: string; fechaVencimiento: string }): Promise<ExpensaDTO> {
    const response = await api.post<ExpensaDTO>("/financiero/expensas", data);
    return response.data;
  },

  async cambiarVencimiento(
    expensaId: string,
    data: { fechaVencimiento: string; motivo?: string }
  ): Promise<ExpensaDTO> {
    const response = await api.patch<ExpensaDTO>(`/financiero/expensas/${expensaId}/vencimiento`, data);
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

  async listarTiposInmueble(): Promise<TipoInmuebleDTO[]> {
    const { data } = await api.get<{ tiposInmueble: TipoInmuebleDTO[] }>("/tipos-inmueble");
    return data.tiposInmueble;
  },

  async guardarTipoInmueble(
    datos: { nombre: string; montoBase: number; pesoAgua: number },
    id?: string
  ): Promise<TipoInmuebleDTO> {
    const { data } = id
      ? await api.put<{ tipoInmueble: TipoInmuebleDTO }>(`/tipos-inmueble/${id}`, datos)
      : await api.post<{ tipoInmueble: TipoInmuebleDTO }>("/tipos-inmueble", datos);
    return data.tipoInmueble;
  },

  async listarFacturasAgua(): Promise<FacturaAguaDTO[]> {
    const { data } = await api.get<{ facturas: FacturaAguaDTO[] }>("/financiero/agua");
    return data.facturas;
  },

  async obtenerFacturaAgua(periodo: string): Promise<DetalleFacturaAguaDTO> {
    const { data } = await api.get<DetalleFacturaAguaDTO>(`/financiero/agua/${periodo}`);
    return data;
  },

  async registrarFacturaAgua(periodo: string, montoFactura: number): Promise<DetalleFacturaAguaDTO> {
    const { data } = await api.post<DetalleFacturaAguaDTO>("/financiero/agua", { periodo, montoFactura });
    return data;
  },

  async ejecutarGeneracionJob(forzar = true): Promise<ResultadoGeneracionDTO> {
    const response = await api.post<ResultadoGeneracionDTO>(
      `/financiero/jobs/ejecutar-generacion?forzar=${forzar}`
    );
    return response.data;
  },

  async ejecutarMoraJob(): Promise<{ aplicadas: number }> {
    const response = await api.post<{ aplicadas: number }>("/financiero/jobs/ejecutar-mora");
    return response.data;
  },
};