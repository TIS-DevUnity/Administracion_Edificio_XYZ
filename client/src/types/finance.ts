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
  monto: number;
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
  tipoValor: TipoValorMora;
  valor: number;
  vigenteDesde: string;
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
  montoTotal: number;
  montoMora?: number;
  estado: EstadoExpensa;
  fechaVencimiento: string;
  createdAt: string;
  inmueble: InmuebleResumen;
  pagos: PagoDTO[];
}