import { api } from "@/lib/api";
import type { Nomina } from "@/types/nomina";
import type {
  Anticipo,
  DatosAnticipo,
  DatosConcepto,
  DatosEmpleado,
  DetalleEmpleado,
  Empleado,
  EstadoEmpleado,
  FiltroAnticipos,
  RespuestaAnticipos,
  RespuestaAnticiposPendientes,
  RespuestaEmpleados,
} from "@/types/personal";

const id = (valor: string) => encodeURIComponent(valor);

/** Empleados del edificio (HU8 funcionalidad 1): /api/financiero/empleados. */
export const empleadosService = {
  async listar(filtros: { estado?: EstadoEmpleado; q?: string; pagina?: number; porPagina?: number } = {}): Promise<RespuestaEmpleados> {
    const { data } = await api.get<RespuestaEmpleados>("/financiero/empleados", { params: filtros });
    return data;
  },
  async detalle(empleadoId: string): Promise<DetalleEmpleado> {
    const { data } = await api.get<DetalleEmpleado>(`/financiero/empleados/${id(empleadoId)}`);
    return data;
  },
  async crear(datos: DatosEmpleado): Promise<{ empleado: Empleado; mensaje: string }> {
    const { data } = await api.post<{ empleado: Empleado; mensaje: string }>("/financiero/empleados", datos);
    return data;
  },
  /** Solo se envían los campos que cambiaron. */
  async actualizar(empleadoId: string, cambios: Partial<DatosEmpleado>): Promise<{ empleado: Empleado; mensaje: string }> {
    const { data } = await api.put<{ empleado: Empleado; mensaje: string }>(`/financiero/empleados/${id(empleadoId)}`, cambios);
    return data;
  },
  async cambiarEstado(empleadoId: string, estado: EstadoEmpleado): Promise<{ empleado: Empleado; mensaje: string }> {
    const { data } = await api.patch<{ empleado: Empleado; mensaje: string }>(`/financiero/empleados/${id(empleadoId)}/estado`, { estado });
    return data;
  },
};

/** Anticipos salariales (HU8 funcionalidad 4 y boleta 6.2): /api/financiero/anticipos. */
export const anticiposService = {
  async listar(filtros: FiltroAnticipos = {}): Promise<RespuestaAnticipos> {
    const { data } = await api.get<RespuestaAnticipos>("/financiero/anticipos", { params: filtros });
    return data;
  },
  async pendientes(): Promise<RespuestaAnticiposPendientes> {
    const { data } = await api.get<RespuestaAnticiposPendientes>("/financiero/anticipos/pendientes");
    return data;
  },
  async detalle(anticipoId: string): Promise<Anticipo> {
    const { data } = await api.get<{ anticipo: Anticipo }>(`/financiero/anticipos/${id(anticipoId)}`);
    return data.anticipo;
  },
  async crear(datos: DatosAnticipo): Promise<{ anticipo: Anticipo; mensaje: string }> {
    const { data } = await api.post<{ anticipo: Anticipo; mensaje: string }>("/financiero/anticipos", datos);
    return data;
  },
  async comprobantePdf(anticipoId: string, inline = false): Promise<Blob> {
    const { data } = await api.get<Blob>(`/financiero/anticipos/${id(anticipoId)}/boleta`, {
      params: inline ? { inline: "true" } : undefined,
      responseType: "blob",
    });
    return data;
  },
};

/** Bonos, horas extra y descuentos de una nómina pendiente (HU8 funcionalidad 3). Devuelven la nómina recalculada. */
export const conceptosNominaService = {
  async agregar(nominaId: string, datos: DatosConcepto): Promise<Nomina> {
    const { data } = await api.post<{ nomina: Nomina }>(`/financiero/nomina/${id(nominaId)}/conceptos`, datos);
    return data.nomina;
  },
  async editar(nominaId: string, conceptoId: string, cambios: Partial<Omit<DatosConcepto, "tipo">>): Promise<Nomina> {
    const { data } = await api.patch<{ nomina: Nomina }>(`/financiero/nomina/${id(nominaId)}/conceptos/${id(conceptoId)}`, cambios);
    return data.nomina;
  },
  async quitar(nominaId: string, conceptoId: string): Promise<Nomina> {
    const { data } = await api.delete<{ nomina: Nomina }>(`/financiero/nomina/${id(nominaId)}/conceptos/${id(conceptoId)}`);
    return data.nomina;
  },
};
