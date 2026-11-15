// Reportes financieros (HU13). Contratos de server/src/modules/financiero/reportes/*.util.js.
// Los importes llegan como texto con 2 decimales ("1234.50").

export type TipoReporte = "BALANCE_GENERAL" | "FLUJO_CAJA" | "MOROSOS";
export type FormatoReporte = "JSON" | "PDF" | "EXCEL";

export interface GeneradoPor {
  id: string;
  nombre: string;
  rol: string;
}

interface EncabezadoReporte {
  titulo: string;
  tipoReporte: TipoReporte;
  generadoEn: string;
  generadoPor: GeneradoPor | null;
}

export interface RangoReporte {
  desde: string;
  hasta: string;
}

// ── Balance general ──
export interface LineaBalance {
  concepto: string;
  cantidad: number | null;
  monto: string;
}
export interface GrupoBalance {
  nombre: string;
  lineas: LineaBalance[];
  subtotal: string;
}
export interface BloqueBalance {
  grupos: GrupoBalance[];
  total: string;
}
export interface BalanceGeneral extends EncabezadoReporte {
  tipoReporte: "BALANCE_GENERAL";
  fechaCorte: string;
  nota: string;
  activos: BloqueBalance;
  pasivos: BloqueBalance;
  patrimonio: BloqueBalance;
  verificacion: { formula: string; activos: string; pasivosMasPatrimonio: string; coincide: boolean };
}

// ── Flujo de caja ──
export type TipoMovimientoFlujo = "Ingreso" | "Gasto";
export interface LineaCategoria {
  categoria: string;
  total: string;
  cantidad: number;
}
export interface MovimientoFlujo {
  fecha: string;
  origen: string;
  tipo: "INGRESO" | "GASTO";
  concepto: string;
  categoria: string;
  monto: string;
  montoConSigno: string;
}
export interface FlujoCaja extends EncabezadoReporte {
  tipoReporte: "FLUJO_CAJA";
  rango: RangoReporte;
  tipo: TipoMovimientoFlujo | null;
  vacio: boolean;
  mensaje: string | null;
  saldoInicial: string;
  saldoInicialAl: string;
  ingresos: {
    expensas: { total: string; cantidad: number };
    otros: LineaCategoria[];
    totalOtros: string;
    total: string;
  };
  egresos: {
    porCategoria: LineaCategoria[];
    personal: {
      sueldos: { total: string; cantidad: number };
      anticipos: { total: string; cantidad: number };
      total: string;
    };
    total: string;
  };
  totalIngresos: string;
  totalEgresos: string;
  saldoFinal: string;
  verificacion: { formula: string; saldoFinalCalculado: string; saldoEdificio: string | null; coincide: boolean | null };
  movimientos: MovimientoFlujo[];
}

// ── Listado de morosos ──
export type OrdenMorosos = "monto" | "antiguedad";
export interface ExpensaMorosa {
  expensaId: string;
  periodo: string;
  fechaVencimiento: string;
  diasMora: number;
  responsableId: string | null;
  responsable: string | null;
  montoPendiente: string;
  interesMora: string;
  total: string;
}
export interface FilaMoroso {
  inmuebleId: string;
  inmueble: string;
  responsableId: string | null;
  responsable: string | null;
  periodoDeuda: { desde: string; hasta: string };
  diasMora: number;
  cantidadExpensas: number;
  montoPendiente: string;
  interesMora: string;
  totalAcumulado: string;
  expensas: ExpensaMorosa[];
}
export interface ListadoMorosos extends EncabezadoReporte {
  tipoReporte: "MOROSOS";
  rango: RangoReporte;
  orden: OrdenMorosos;
  vacio: boolean;
  mensaje: string | null;
  filas: FilaMoroso[];
  totales: { inmuebles: number; expensas: number; montoPendiente: string; interesMora: string; totalAcumulado: string };
}

export type ReporteFinanciero = BalanceGeneral | FlujoCaja | ListadoMorosos;

/** Parámetros de un reporte. El balance no usa fechas: es a la fecha de emisión. */
export interface ParametrosReporte {
  tipo: TipoReporte;
  desde: string;
  hasta: string;
  tipoMovimiento: TipoMovimientoFlujo | "";
  orden: OrdenMorosos;
}

/** `detalle` de cada registro de auditoría con entidad ReporteFinanciero (registro-generacion.service.js). */
export interface DetalleGeneracionReporte {
  tipo?: TipoReporte;
  desde?: string | null;
  hasta?: string | null;
  formato?: FormatoReporte;
  resultado?: "EXITOSO" | "FALLIDO";
  error?: string;
  orden?: OrdenMorosos | null;
  filtroTipo?: TipoMovimientoFlujo | null;
  fechaCorte?: string;
}
