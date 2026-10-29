/** Contrato de GET /api/financiero/saldo-edificio (saldo-edificio.service.js). */
export type TipoMovimientoSaldo = "INGRESO" | "GASTO";
export type OrigenMovimientoSaldo = "PAGO_EXPENSA" | "EXTRAORDINARIO";

export interface FiltrosSaldoEdificio {
  desde?: string;
  hasta?: string;
  tipo?: TipoMovimientoSaldo;
  pagina?: number;
  porPagina?: number;
}

export interface MovimientoSaldoEdificio {
  id: string;
  origen: OrigenMovimientoSaldo;
  tipo: TipoMovimientoSaldo;
  tipoEtiqueta: string;
  fecha: string; // YYYY-MM-DD (en zona de Bolivia para recibos)
  concepto: string;
  monto: string; // Decimal serializado
  montoConSigno: string;
  detalle: {
    folio?: string | null;
    inmueble?: string | null;
    metodoPago?: string | null;
    referencia?: string | null;
    categoria?: string | null;
    tieneComprobante?: boolean;
  };
}

export interface ResumenSaldoEdificio {
  rango: { desde: string | null; hasta: string | null };
  saldoActual: string;
  totalIngresos: string;
  totalGastos: string;
  saldoDelPeriodo: string;
  ingresos: {
    pagosDeExpensas: string;
    extraordinarios: string;
    cantidadPagos: number;
    cantidadExtraordinarios: number;
  };
  gastos: { extraordinarios: string; cantidad: number };
  pendienteDeCobro: {
    deudaPendienteDeCobro: string;
    expensasPendientes: number;
    saldoAFavorDeResidentes: string;
  };
  movimientos: MovimientoSaldoEdificio[];
  paginacion: { pagina: number; porPagina: number; total: number; totalPaginas: number };
}
