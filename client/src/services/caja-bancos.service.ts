import { api } from "@/lib/api";
import type {
  CuentaCaja, Comprobacion, DetalleCierre, DetalleMovimientoCaja, EventoConciliacion,
  ExtractoEntrada, FiltrosMovimientos, MovimientoCaja, Paginacion, RespuestaMovimientos,
  RespuestaSaldos, ResultadoConciliacion, ResumenPeriodo, SaldoCuentaPeriodo,
  VistaPreviaCierre, CierreResumen,
} from "@/types/caja-bancos";

const BASE = "/financiero/caja-bancos";

export const cajaBancosService = {
  async cuentas() {
    const { data } = await api.get<{ cuentas: CuentaCaja[] }>(`${BASE}/cuentas`);
    return data.cuentas;
  },
  async movimientos(params: FiltrosMovimientos) {
    const { data } = await api.get<RespuestaMovimientos>(`${BASE}/movimientos`, { params });
    return data;
  },
  async detalleMovimiento(id: string) {
    const { data } = await api.get<DetalleMovimientoCaja>(`${BASE}/movimientos/${encodeURIComponent(id)}`);
    return data;
  },
  async comprobar(id: string, extracto: ExtractoEntrada) {
    const { data } = await api.post<Comprobacion>(`${BASE}/movimientos/${encodeURIComponent(id)}/comprobar`, extracto);
    return data;
  },
  async conciliar(id: string, extracto: ExtractoEntrada) {
    const { data } = await api.post<ResultadoConciliacion>(`${BASE}/movimientos/${encodeURIComponent(id)}/conciliar`, extracto);
    return data;
  },
  async observacion(id: string, observacion: string) {
    const { data } = await api.patch<{ movimiento: MovimientoCaja; mensaje: string }>(`${BASE}/movimientos/${encodeURIComponent(id)}/observacion`, { observacion });
    return data;
  },
  async saldos(periodo: string, cuentaId?: string) {
    const { data } = await api.get<RespuestaSaldos>(`${BASE}/periodos/${periodo}/saldos`, { params: cuentaId ? { cuentaId } : {} });
    return data;
  },
  async guardarSaldoReal(periodo: string, cuentaId: string, saldoReal: string, observacion?: string) {
    const { data } = await api.put<{ saldo: SaldoCuentaPeriodo; mensaje: string }>(`${BASE}/periodos/${periodo}/cuentas/${encodeURIComponent(cuentaId)}/saldo-real`, { saldoReal, observacion });
    return data;
  },
  async revisarDiferencia(periodo: string, cuentaId: string, observacion: string) {
    const { data } = await api.post<{ saldo: SaldoCuentaPeriodo; mensaje: string }>(`${BASE}/periodos/${periodo}/cuentas/${encodeURIComponent(cuentaId)}/revisar-diferencia`, { observacion });
    return data;
  },
  async resumen(periodo: string, cuentaId?: string) {
    const { data } = await api.get<ResumenPeriodo>(`${BASE}/periodos/${periodo}/resumen`, { params: cuentaId ? { cuentaId } : {} });
    return data;
  },
  async vistaPreviaCierre(periodo: string) {
    const { data } = await api.get<VistaPreviaCierre>(`${BASE}/periodos/${periodo}/cierre/vista-previa`);
    return data;
  },
  async cerrar(periodo: string, confirmarDiferencias: string[], observacion?: string) {
    const { data } = await api.post<{ mensaje: string; cierre: CierreResumen }>(`${BASE}/periodos/${periodo}/cierre`, { confirmarDiferencias, observacion });
    return data;
  },
  async cierres(pagina = 1, porPagina = 10) {
    const { data } = await api.get<{ cierres: CierreResumen[]; paginacion: Paginacion }>(`${BASE}/cierres`, { params: { pagina, porPagina } });
    return data;
  },
  async detalleCierre(periodo: string) {
    const { data } = await api.get<DetalleCierre>(`${BASE}/cierres/${periodo}`);
    return data;
  },
  async eventos(params: { periodo?: string; cuentaId?: string; pagina?: number; porPagina?: number } = {}) {
    const { data } = await api.get<{ eventos: EventoConciliacion[]; paginacion: Paginacion }>(`${BASE}/conciliaciones`, { params });
    return data;
  },
};
