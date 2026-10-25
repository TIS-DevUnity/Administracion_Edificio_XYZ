import { api } from "@/lib/api";
import type { CuentaResidenteDTO } from "@/types/cuentaResidente";

/** Cuenta consolidada de un residente (HU3 CA-14): GET /api/financiero/copropietarios/:id/cuenta. */
export const cuentaResidenteService = {
  async obtener(copropietarioId: string): Promise<CuentaResidenteDTO> {
    const { data } = await api.get<CuentaResidenteDTO>(
      `/financiero/copropietarios/${encodeURIComponent(copropietarioId)}/cuenta`
    );
    return data;
  },
};
