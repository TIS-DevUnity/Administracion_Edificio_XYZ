import axios from "axios";
import type { ConfiguracionMoraDTO, ExpensaDTO } from "@/types/finance";

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(amount);
}

// Fecha-hora: mostrar según la zona del edificio y no la del navegador.
export function formatearFecha(strFechaISO: string) {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/La_Paz",
  }).format(new Date(strFechaISO));
}

// Los vencimientos y fechas de corte de Prisma son DATE a medianoche UTC.
// Son fechas de calendario: mostrarlas como fecha local causaba un día de diferencia.
export function formatearFechaCalendario(valor: string) {
  const strFecha = valor.slice(0, 10);
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${strFecha}T12:00:00Z`));
}

export function fechaHoyBolivia(): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/La_Paz",
  }).formatToParts(new Date());
  const leer = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${leer("year")}-${leer("month")}-${leer("day")}`;
}

export function fechaEnBolivia(fecha: string): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/La_Paz",
  }).formatToParts(new Date(fecha));
  const leer = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${leer("year")}-${leer("month")}-${leer("day")}`;
}

export function estaEnPeriodoGracia(exp: ExpensaDTO, historial: ConfiguracionMoraDTO[]): boolean {
  if (exp.estado !== "PENDIENTE" && exp.estado !== "PARCIAL") return false;
  // Priorizar la configuración vinculada a esta expensa y no la regla actual.
  const historico = exp.configuracionMoraId
    ? historial.find((c) => c.id === exp.configuracionMoraId)
    : historial.find((c) => new Date(c.vigenteDesde).getTime() <= new Date(exp.createdAt).getTime());
  if (!historico) return false; // No inventar gracia cuando no se conoce la regla histórica.
  const vencimiento = new Date(`${exp.fechaVencimiento.slice(0, 10)}T12:00:00Z`);
  vencimiento.setUTCDate(vencimiento.getUTCDate() + Number(historico.diasGracia));
  return fechaHoyBolivia() > exp.fechaVencimiento.slice(0, 10)
    && fechaHoyBolivia() <= vencimiento.toISOString().slice(0, 10);
}

export function periodoActual(): string {
  return fechaHoyBolivia().slice(0, 7);
}

export function tieneMoraAplicada(exp: ExpensaDTO): boolean {
  return exp.estado === "VENCIDA" && Number(exp.montoMora || 0) > 0;
}

export function resumenSaldo(exp: ExpensaDTO) {
  // Los pagos se asignan a mora primero y a capital después, como en saldo.util.js.
  const pagadoCapital = exp.pagos.reduce((total, pago) => total + Number(pago.montoExpensa ?? 0), 0);
  const pagadoMora = exp.pagos.reduce((total, pago) => total + Number(pago.montoMora ?? 0), 0);
  const pagado = exp.pagos.reduce((total, pago) => total + Number(pago.monto), 0);
  const capitalPendiente = Math.max(Number(exp.montoTotal) - pagadoCapital, 0);
  const moraPendiente = Math.max(Number(exp.montoMora ?? 0) - pagadoMora, 0);
  return { pagado, pagadoCapital, pagadoMora, capitalPendiente, moraPendiente, total: capitalPendiente + moraPendiente };
}

export function calcularSaldoPendiente(exp: ExpensaDTO): number {
  return resumenSaldo(exp).total;
}

export function obtenerMensajeError(error: unknown, strFallback: string): string {
  if (axios.isAxiosError(error)) {
    const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
    if (strMensaje) return strMensaje;
  }
  return strFallback;
}

