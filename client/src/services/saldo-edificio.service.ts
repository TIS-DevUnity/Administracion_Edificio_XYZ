import { api } from "@/lib/api";
import type { FiltrosSaldoEdificio, ResumenSaldoEdificio } from "@/types/saldo-edificio";

export const saldoEdificioService = {
  async obtener(filtros: FiltrosSaldoEdificio = {}): Promise<ResumenSaldoEdificio> {
    const { data } = await api.get<ResumenSaldoEdificio>("/financiero/saldo-edificio", {
      params: filtros,
    });
    return data;
  },
};
