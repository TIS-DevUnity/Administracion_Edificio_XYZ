export type EstadoExpensa =
  | "PENDIENTE"
  | "PARCIAL"
  | "PAGADA"
  | "VENCIDA";

export type TipoValorMora =
  | "PORCENTAJE"
  | "MONTO_FIJO";

export type MetodoPago =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "CHEQUE";

export interface PagoDTO {
  id: string;
  monto: number;
  metodoPago: MetodoPago;
  referencia?: string | null;
  fechaPago: string;
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