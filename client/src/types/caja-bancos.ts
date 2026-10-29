/** Contratos HU7 basados en server/src/modules/financiero/caja-bancos del ZIP (6). */
export type TipoMovimientoCaja = "INGRESO" | "EGRESO";
export type EstadoMovimientoCaja = "PENDIENTE" | "CONCILIADO" | "CON_DIFERENCIA";
export type TipoCuenta = "CAJA" | "BANCO";
export type Dinero = string;

export interface CuentaCaja {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  tipoEtiqueta?: string;
  banco?: string | null;
  numeroCuenta?: string | null;
  esPorDefecto?: boolean;
  activa?: boolean;
  saldoInicial?: Dinero;
  datosPendientes?: boolean;
}
export interface Paginacion { pagina: number; porPagina: number; total: number; totalPaginas: number }
export interface Persona { id: string; nombre?: string; apellido?: string }
export interface MovimientoCaja {
  id: string; fecha: string; fechaHora?: string; concepto: string;
  tipo: TipoMovimientoCaja; tipoEtiqueta?: string; monto: Dinero; montoConSigno?: Dinero;
  cuenta: CuentaCaja; medio?: "EFECTIVO" | "TRANSFERENCIA" | null;
  metodoPago?: string | null; estado: EstadoMovimientoCaja; estadoEtiqueta?: string;
  referencia?: string | null; observacion?: string | null;
  origen: "RECIBO" | "MOVIMIENTO_FINANCIERO" | "TRASPASO";
  periodo: string; conciliadoEn?: string | null; bloqueado?: boolean;
}
export interface EstadisticaEstado { cantidad: number; ingresos: Dinero; egresos: Dinero }
export interface ResumenLibro {
  ingresos: Dinero; egresos: Dinero; balance: Dinero; cantidad: number;
  porEstado: Record<EstadoMovimientoCaja, EstadisticaEstado>;
}
export interface FiltrosMovimientos {
  periodo?: string; desde?: string; hasta?: string; cuentaId?: string;
  tipo?: TipoMovimientoCaja; estado?: EstadoMovimientoCaja; medio?: string;
  noConciliados?: boolean; pagina?: number; porPagina?: number;
}
export interface RespuestaMovimientos { filtros: Record<string, unknown>; movimientos: MovimientoCaja[]; resumen: ResumenLibro; paginacion: Paginacion }
export interface ExtractoEntrada { fecha: string; monto: string; tipo: TipoMovimientoCaja; referencia?: string; observacion?: string }
export interface DiferenciaExtracto { campo: string; nuestro: unknown; banco: unknown }
export interface Comprobacion { movimiento: MovimientoCaja; coincide: boolean; diferencias: DiferenciaExtracto[]; requiereObservacion: boolean; puedeConciliar: boolean }
export interface ResultadoConciliacion { movimiento: MovimientoCaja; resultado: EstadoMovimientoCaja; coincide: boolean; diferencias: DiferenciaExtracto[]; saldoConciliado?: { cuentaId: string; periodo: string; saldo: Dinero }; mensaje: string }
export interface EventoConciliacion {
  id: string; fecha: string; operacion: string; resultado: string;
  estadoAnterior?: string | null; estadoNuevo?: string | null;
  periodo: string; cuenta: Pick<CuentaCaja, "id" | "nombre">;
  movimientoCajaId?: string | null; movimiento?: { id: string; concepto: string; tipo: string; monto: Dinero } | null;
  usuario?: Persona | null; detalle?: unknown;
}
export interface DetalleMovimientoCaja {
  movimiento: MovimientoCaja;
  origen: { tipo: string; folio?: string; inmueble?: { codigo: string }; categoria?: { nombre: string }; tieneComprobante?: boolean; [key: string]: unknown };
  extracto: { fecha: string | null; monto: Dinero | null; tipo: string | null; referencia: string | null; diferencia: Dinero | null };
  registradoPor?: Persona | null; conciliadoPor?: Persona | null; historial: EventoConciliacion[];
}
export interface SaldoCuentaPeriodo {
  cuenta: CuentaCaja; origen: "CALCULADO" | "CIERRE";
  saldoRegistrado: Dinero; saldoConciliado: Dinero;
  saldoReal: Dinero | null; diferencia: Dinero | null;
  saldoInicial?: Dinero; apertura?: { registrado: Dinero; conciliado: Dinero };
  movimientos?: { ingresos: Dinero; egresos: Dinero; cantidad: number };
  pendientes?: number; conDiferencia?: number; diferenciaRevisada?: boolean;
  diferenciaConfirmada?: boolean; observacion?: string | null; entraAlCierre?: boolean;
}
export interface TotalesSaldo { saldoRegistrado: Dinero; saldoConciliado: Dinero; saldoReal: Dinero | null; diferencia: Dinero | null; cuentasSinSaldoReal?: number }
export interface RespuestaSaldos { periodo: string; origen: "CALCULADO" | "CIERRE"; periodoCerrado: boolean; cuentas: SaldoCuentaPeriodo[]; totales: TotalesSaldo }
export interface ResumenPeriodo {
  periodo: string; periodoCerrado: boolean;
  totalIngresos: Dinero; totalEgresos: Dinero; balance: Dinero;
  cantidad: number; conciliados: EstadisticaEstado; pendientes: EstadisticaEstado; conDiferencia: EstadisticaEstado;
  diferenciasDeSaldo: { cuenta: { id: string; nombre: string }; saldoRegistrado: Dinero; saldoReal: Dinero | null; diferencia: Dinero; revisada: boolean }[];
  cuentasSinSaldoReal: { id: string; nombre: string }[];
}
export interface BloqueoCierre { codigo: string; mensaje: string }
export interface VistaPreviaCierre {
  periodo: string; puedeCerrar: boolean; periodoEsperado?: string;
  mesTerminado: boolean; bloqueos: BloqueoCierre[];
  sinResolver: { cantidad: number; pendientes: number; conDiferencia: number; movimientos: MovimientoCaja[]; hayMas: boolean };
  asientosFaltantes?: unknown; desfases?: { cantidad: number; ejemplos: unknown[] };
  cuentas: { cuenta: CuentaCaja; saldoRegistrado: Dinero; saldoConciliado: Dinero; saldoReal: Dinero | null; diferencia: Dinero | null; diferenciaRevisada: boolean; observacion?: string | null; requiereConfirmacion: boolean }[];
}
export interface CierreResumen { id: string; periodo: string; cerradoEn: string; cerradoPor: Persona | null; observacion?: string | null; cuentas?: number; totales: TotalesSaldo }
export interface DetalleCierre { cierre: CierreResumen; cuentas: SaldoCuentaPeriodo[]; totales: TotalesSaldo; resumen: ResumenPeriodo }
