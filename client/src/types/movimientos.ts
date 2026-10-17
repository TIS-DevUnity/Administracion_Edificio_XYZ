/** HU6: contrato real de movimientos financieros extraordinarios. */
export type TipoMovimientoFormulario = "GASTO" | "INGRESO";
export type TipoMovimientoAPI = "EGRESO" | "INGRESO";

export interface CategoriaMovimiento {
  id: string;
  nombre: string;
  tipo: TipoMovimientoAPI;
  tipoEtiqueta: string;
  activa: boolean;
}

export interface MovimientoFinanciero {
  id: string;
  tipo: TipoMovimientoAPI;
  tipoEtiqueta: string;
  esIngreso: boolean;
  efectoBalance: "ENTRADA" | "SALIDA";
  monto: string;
  montoConSigno: string;
  fecha: string; // YYYY-MM-DD, sin conversión de zona horaria
  categoria: { id: string; nombre?: string };
  concepto: string;
  tieneComprobante: boolean;
  comprobante: { nombre: string; mimeType: string } | null;
  registradoPor: { id: string; nombre: string; apellido: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrearMovimientoPayload {
  tipo: TipoMovimientoFormulario;
  monto: number;
  fecha: string;
  categoriaId: string;
  concepto: string;
}

export interface CrearMovimientoRespuesta {
  movimiento: MovimientoFinanciero;
  duplicado: boolean;
  mensaje: string;
}

/** PUT /api/financiero/movimientos/:id: actualización parcial. */
export type ActualizarMovimientoPayload = Partial<CrearMovimientoPayload>;
export interface RespuestaActualizarMovimiento {
  movimiento: MovimientoFinanciero;
  mensaje: string;
}

/** Son los mismos parámetros que admite GET /api/financiero/movimientos. */
export interface FiltrosMovimientosAPI {
  tipo?: TipoMovimientoFormulario;
  categoriaId?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
  porPagina?: number;
}

export interface ResumenMovimientos {
  ingresos: string;
  gastos: string;
  balance: string;
  cantidadIngresos: number;
  cantidadGastos: number;
}

export interface PaginaMovimientos {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}

export interface RespuestaListadoMovimientos {
  rango: { desde: string | null; hasta: string | null };
  movimientos: MovimientoFinanciero[];
  resumen: ResumenMovimientos;
  paginacion: PaginaMovimientos;
}

/** Respuestas del detalle y enlaces firmados de Supabase Storage. */
export interface RespuestaDetalleMovimiento {
  movimiento: MovimientoFinanciero;
}
export interface RespuestaAdjuntarComprobante {
  movimiento: MovimientoFinanciero;
  mensaje: string;
}
export interface EnlaceComprobante {
  movimientoId: string;
  nombre: string;
  mimeType: string;
  descarga: boolean;
  url: string;
  venceEnSegundos: number;
}

/** GET /api/financiero/movimientos/balance: no incluye expensas ni caja/bancos. */
export interface BalanceCategoriaMovimiento {
  categoriaId: string;
  categoria: string | null;
  tipo: TipoMovimientoAPI;
  tipoEtiqueta: string;
  total: string;
  cantidad: number;
}

export interface RespuestaBalanceMovimientos extends ResumenMovimientos {
  rango: { desde: string | null; hasta: string | null };
  porCategoria: BalanceCategoriaMovimiento[];
}
