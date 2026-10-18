import { api } from "@/lib/api";
import type {
  CategoriaMovimiento,
  CrearMovimientoPayload,
  CrearMovimientoRespuesta,
  ActualizarMovimientoPayload,
  RespuestaActualizarMovimiento,
  FiltrosMovimientosAPI,
  RespuestaListadoMovimientos,
  TipoMovimientoFormulario,
  RespuestaDetalleMovimiento,
  RespuestaAdjuntarComprobante,
  EnlaceComprobante,
  RespuestaBalanceMovimientos,
} from "@/types/movimientos";

export const movimientosService = {
  /** Balance global de extraordinarios o por rango; separado de los filtros del listado. */
  async obtenerBalance(
    filtros: { desde?: string; hasta?: string } = {}, signal?: AbortSignal,
  ): Promise<RespuestaBalanceMovimientos> {
    const { data } = await api.get<RespuestaBalanceMovimientos>(
      "/financiero/movimientos/balance", { params: filtros, signal },
    );
    return data;
  },

  async listarCategorias(tipo: TipoMovimientoFormulario, signal?: AbortSignal): Promise<CategoriaMovimiento[]> {
    const { data } = await api.get<{ categorias: CategoriaMovimiento[] }>(
      "/financiero/movimientos/categorias",
      { params: { tipo }, signal },
    );
    return data.categorias;
  },

  /** Incluye las categorías desactivadas para poder filtrar movimientos históricos. */
  async listarTodasCategorias(signal?: AbortSignal): Promise<CategoriaMovimiento[]> {
    const { data } = await api.get<{ categorias: CategoriaMovimiento[] }>(
      "/financiero/movimientos/categorias",
      { params: { incluirInactivas: "true" }, signal },
    );
    return data.categorias;
  },

  async listarMovimientos(
    filtros: FiltrosMovimientosAPI,
    signal?: AbortSignal,
  ): Promise<RespuestaListadoMovimientos> {
    const { data } = await api.get<RespuestaListadoMovimientos>(
      "/financiero/movimientos",
      { params: filtros, signal },
    );
    return data;
  },

  /** Una misma clave se conserva si el administrador reintenta la solicitud. */
  async crearMovimiento(
    movimiento: CrearMovimientoPayload,
    claveSolicitud: string,
    comprobante?: File | null,
  ): Promise<CrearMovimientoRespuesta> {
    // Sin adjunto: JSON. Con adjunto: un solo multipart con datos + archivo para
    // evitar crear el movimiento antes de saber si se subió el comprobante.
    if (!comprobante) {
      const { data } = await api.post<CrearMovimientoRespuesta>(
        "/financiero/movimientos", movimiento,
        { headers: { "Idempotency-Key": claveSolicitud } },
      );
      return data;
    }
    const cuerpo = new FormData();
    cuerpo.append("tipo", movimiento.tipo);
    cuerpo.append("monto", String(movimiento.monto));
    cuerpo.append("fecha", movimiento.fecha);
    cuerpo.append("categoriaId", movimiento.categoriaId);
    cuerpo.append("concepto", movimiento.concepto);
    cuerpo.append("comprobante", comprobante);
    const { data } = await api.post<CrearMovimientoRespuesta>(
      "/financiero/movimientos", cuerpo,
      { headers: { "Idempotency-Key": claveSolicitud, "Content-Type": undefined } },
    );
    return data;
  },

  /** PUT parcial: los campos que no se envían conservan su valor actual.
   * Si se adjunta archivo, el servidor valida y guarda datos + comprobante
   * en la misma operación (el fallo de Storage no se considera edición exitosa).
   */
  async actualizarMovimiento(
    id: string,
    cambios: ActualizarMovimientoPayload,
    comprobante?: File | null,
  ): Promise<RespuestaActualizarMovimiento> {
    const ruta = `/financiero/movimientos/${encodeURIComponent(id)}`;
    if (!comprobante) {
      const { data } = await api.put<RespuestaActualizarMovimiento>(ruta, cambios);
      return data;
    }
    const cuerpo = new FormData();
    if (cambios.tipo !== undefined) cuerpo.append("tipo", cambios.tipo);
    if (cambios.monto !== undefined) cuerpo.append("monto", String(cambios.monto));
    if (cambios.fecha !== undefined) cuerpo.append("fecha", cambios.fecha);
    if (cambios.categoriaId !== undefined) cuerpo.append("categoriaId", cambios.categoriaId);
    if (cambios.concepto !== undefined) cuerpo.append("concepto", cambios.concepto);
    cuerpo.append("comprobante", comprobante);
    const { data } = await api.put<RespuestaActualizarMovimiento>(ruta, cuerpo, {
      headers: { "Content-Type": undefined },
    });
    return data;
  },

  async obtenerMovimiento(id: string, signal?: AbortSignal): Promise<RespuestaDetalleMovimiento> {
    const { data } = await api.get<RespuestaDetalleMovimiento>(
      `/financiero/movimientos/${encodeURIComponent(id)}`, { signal },
    );
    return data;
  },

  async adjuntarComprobante(id: string, archivo: File): Promise<RespuestaAdjuntarComprobante> {
    const cuerpo = new FormData();
    cuerpo.append("comprobante", archivo);
    const { data } = await api.post<RespuestaAdjuntarComprobante>(
      `/financiero/movimientos/${encodeURIComponent(id)}/comprobante`, cuerpo,
      { headers: { "Content-Type": undefined } },
    );
    return data;
  },

  async obtenerEnlaceComprobante(id: string, descargar = false): Promise<EnlaceComprobante> {
    const { data } = await api.get<EnlaceComprobante>(
      `/financiero/movimientos/${encodeURIComponent(id)}/comprobante`,
      { params: descargar ? { descargar: "true" } : undefined },
    );
    return data;
  },
};
