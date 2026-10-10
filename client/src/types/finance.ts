export type EstadoExpensa =
  | "PENDIENTE"
  | "PARCIAL"
  | "PAGADA"
  | "VENCIDA";

export type TipoValorMora =
  | "PORCENTAJE"
  | "MONTO_FIJO";

// Metodos que puede elegir el Administrador al registrar un pago manual.
export type MetodoPago =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "CHEQUE";

// SALDO_A_FAVOR lo asigna el sistema solo (al cubrir una expensa con saldo previo);
// aparece en el historial pero nunca es seleccionable en un formulario.
export type MetodoPagoRegistro = MetodoPago | "SALDO_A_FAVOR";

export interface PagoDTO {
  id: string;
  expensaId?: string;
  monto: number | string;
  montoExpensa: number | string;
  montoMora: number | string;
  metodoPago: MetodoPagoRegistro;
  referencia?: string | null;
  fechaPago: string;
}

export interface RegistrarPagoResponse {
  pago: PagoDTO | null;
  expensa: ExpensaDTO;
  montoRecibido: string;
  montoAplicado: string;
  saldoFavorGenerado: string;
}

export interface AplicarSaldoFavorResponse {
  expensa: ExpensaDTO;
  saldoFavorAplicado: string;
}

export interface ConfiguracionMoraDTO {
  id: string;
  diaGeneracion: number;
  diasGracia: number;
  diaVencimiento: number;
  modoMora: "UNICA" | "MENSUAL";
  tipoValor: TipoValorMora;
  valor: number;
  vigenteDesde: string;
}

export interface MoraExpensaDTO {
  id: string;
  numero: number;
  mes: string;
  fechaCorte: string;
  base: number | string;
  tipoValor: TipoValorMora;
  valor: number | string;
  monto: number | string;
  createdAt: string;
}

export interface CambioVencimientoDTO {
  id: string;
  fechaAnterior: string;
  fechaNueva: string;
  motivo?: string | null;
  registradoPorId?: string | null;
  createdAt: string;
}

export interface ResultadoGeneracionDTO {
  periodo?: string;
  generadas: number;
  omitidas: number;
  motivo?: string;
  yaGeneradas?: string[];
  pendientes?: { inmuebleId: string; codigo: string; motivo: string }[];
  excluidos?: { codigo: string; motivo: string }[];
}

export interface InmuebleResumen {
  id: string;
  codigo: string;
  tipoInmueble: {
    montoBase: number;
  };
}

export interface ExpensaDTO {
  id: string;
  inmuebleId: string;
  periodo: string;
  tipoNombre?: string | null;
  montoBase: number | string;
  montoAgua: number | string;
  montoTotal: number | string;
  montoMora?: number | string;
  configuracionMoraId?: string | null;
  responsableId?: string | null;
  responsableNombre?: string | null;
  responsableRol?: "PROPIETARIO" | "INQUILINO" | null;
  estado: EstadoExpensa;
  fechaVencimiento: string;
  createdAt: string;
  inmueble: InmuebleResumen;
  pagos: PagoDTO[];
  moras?: MoraExpensaDTO[];
  cambiosVencimiento?: CambioVencimientoDTO[];
}
/** Tipos de departamento; el backend devuelve estos campos dentro de {tiposInmueble}. */
export interface TipoInmuebleDTO {
  id: string;
  nombre: string;
  montoBase: number | string;
  pesoAgua: number | string;
  createdAt: string;
  updatedAt: string;
}

export interface FacturaAguaDTO {
  id: string;
  periodo: string;
  montoFactura: number | string;
  totalPesos: number | string;
  valorUnidad: number | string;
  departamentos: number;
  updatedAt: string;
}

export interface RepartoAguaDTO {
  expensaId: string;
  inmuebleId: string;
  inmuebleCodigo: string;
  tipo: string;
  peso: string;
  montoBase: string;
  montoAgua: string;
  montoTotal: string;
}

export interface DetalleFacturaAguaDTO {
  factura: FacturaAguaDTO;
  reparto: RepartoAguaDTO[];
}


/** Si se envía pagina, el endpoint devuelve la respuesta paginada. */
export interface PaginacionExpensasDTO {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}
export interface PaginaExpensasDTO {
  expensas: ExpensaDTO[];
  paginacion: PaginacionExpensasDTO;
}
export interface FiltrosExpensasDTO {
  pagina: number;
  porPagina: number;
  periodo?: string;
  estado?: EstadoExpensa;
  inmuebleId?: string;
}
