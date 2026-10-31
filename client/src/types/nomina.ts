/** Contratos del backend HU8. Cantidades monetarias: strings decimales, nunca floats inventados. */
export type EstadoNomina = "PENDIENTE" | "PAGADA";
export type MetodoPagoNomina = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "CHEQUE";
export type TipoConcepto = "BONO" | "HORA_EXTRA" | "DESCUENTO";

export interface EmpleadoNomina {
  id: string;
  nombres: string;
  apellidos: string;
  documento: string;
  cargo: string;
}
export interface ConceptoNomina {
  id: string;
  tipo: TipoConcepto;
  tipoEtiqueta: string;
  descripcion: string;
  monto: string;
  horas: string | null;
  createdAt: string;
}
export interface AnticipoAplicado {
  id: string;
  anticipoId: string;
  fecha: string | null;
  montoAnticipo: string | null;
  montoAplicado: string;
}
export interface Nomina {
  id: string;
  periodo: string;
  estado: EstadoNomina;
  estadoEtiqueta: string;
  sueldoBase: string;
  totalBonos: string;
  totalHorasExtra: string;
  totalDescuentos: string;
  totalAnticipos: string;
  sueldoNeto: string;
  fechaPago: string | null;
  montoPagado: string | null;
  metodoPago: MetodoPagoNomina | null;
  createdAt: string;
  updatedAt: string;
  empleado: EmpleadoNomina;
  conceptos?: ConceptoNomina[];
  conceptosPorTipo?: {
    bonos: ConceptoNomina[];
    horasExtra: ConceptoNomina[];
    descuentos: ConceptoNomina[];
  };
  anticiposAplicados?: AnticipoAplicado[];
}
export interface RespuestaNominas {
  nominas: Nomina[];
  resumen: {
    cantidad: number;
    pendientes: { cantidad: number; total: string };
    pagadas: { cantidad: number; total: string };
  };
  paginacion: { pagina: number; porPagina: number; total: number; totalPaginas: number };
}
export interface FiltroNominas {
  periodo?: string;
  estado?: EstadoNomina;
  q?: string;
  empleadoId?: string;
  periodoDesde?: string;
  periodoHasta?: string;
  pagina?: number;
  porPagina?: number;
}
export interface PeriodoNomina {
  periodo: string;
  cantidad: number;
  pendientes: number;
  pagadas: number;
  totalNeto: string;
}
export interface RespuestaGeneracion {
  periodo: string;
  creadas: number;
  omitidas: number;
  nominas: Nomina[];
  mensaje: string;
}
export interface PagoNomina {
  fechaPago: string;
  monto: number;
  metodoPago: MetodoPagoNomina;
  cuentaId?: string;
}
export interface RespuestaPago {
  nomina: Nomina;
  asiento: { id: string; cuentaId: string; cuenta: string; periodo: string; estado: string } | null;
  mensaje: string;
}
export interface ReporteNomina {
  periodo: string;
  vacio: boolean;
  filas: {
    nominaId: string;
    empleado: string;
    empleadoId: string | null;
    cargo: string;
    documento: string | null;
    sueldoBase: string;
    bonos: string;
    horasExtra: string;
    descuentos: string;
    anticipos: string;
    sueldoNeto: string;
    devengado: string;
    estado: EstadoNomina;
    estadoEtiqueta: string;
    fechaPago: string | null;
  }[];
  totales: { sueldoBase: string; bonos: string; horasExtra: string; descuentos: string; anticipos: string; sueldoNeto: string };
  resumen: {
    costoDelPeriodo: string;
    pagado: string;
    pendiente: string;
    cantidad: number;
    cantidadPagadas: number;
    cantidadPendientes: number;
  };
  anticiposOtorgados: {
    cantidad: number;
    total: string;
    items: {
      anticipoId: string;
      empleado: string;
      cargo: string | null;
      fecha: string;
      monto: string;
      metodoPago: string;
      estado: string;
      estadoEtiqueta: string;
    }[];
  };
}
