import { jsPDF } from "jspdf";

// El backend no tiene un campo de folio secuencial dedicado para pagos; se usa el
// id (UUID) del Pago/MovimientoSaldo que origino el registro como folio, porque ya
// es unico por construccion (lo garantiza Postgres incluso con pagos simultaneos).
export interface DetalleAplicacionRecibo {
  periodo: string;
  montoAplicado: number;
  estadoResultante: string;
}

export interface DatosReciboPago {
  folio: string;
  inmuebleCodigo: string;
  fecha: string;
  metodoPago: string;
  montoRecibido: number;
  referencia?: string | null;
  detalle: DetalleAplicacionRecibo[];
  saldoFavorResultante?: number;
}

const ETIQUETA_METODO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
  SALDO_A_FAVOR: "Saldo a favor",
};

function formatearFechaRecibo(strFechaISO: string): string {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(strFechaISO));
}

function formatearMontoRecibo(monto: number): string {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(monto);
}

export function generarReciboPdf(datos: DatosReciboPago): void {
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const anchoPagina = doc.internal.pageSize.getWidth();
  const margenX = 14;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Recibo de pago", margenX, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Administración de Edificio", anchoPagina - margenX, y, { align: "right" });

  y += 10;
  doc.setDrawColor(200);
  doc.line(margenX, y, anchoPagina - margenX, y);
  y += 8;

  const fila = (etiqueta: string, valor: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(etiqueta, margenX, y);
    doc.setFont("helvetica", "normal");
    doc.text(valor, margenX + 38, y);
    y += 7;
  };

  fila("Folio:", datos.folio);
  fila("Inmueble:", datos.inmuebleCodigo);
  fila("Fecha de pago:", formatearFechaRecibo(datos.fecha));
  fila("Método de pago:", ETIQUETA_METODO[datos.metodoPago] ?? datos.metodoPago);
  if (datos.referencia) fila("Referencia:", datos.referencia);

  y += 2;
  doc.line(margenX, y, anchoPagina - margenX, y);
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Monto recibido:", margenX, y);
  doc.text(formatearMontoRecibo(datos.montoRecibido), anchoPagina - margenX, y, { align: "right" });
  y += 10;

  if (datos.detalle.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Aplicado a:", margenX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    datos.detalle.forEach((linea) => {
      doc.text(`Periodo ${linea.periodo}`, margenX, y);
      doc.text(formatearMontoRecibo(linea.montoAplicado), anchoPagina - margenX - 28, y, {
        align: "right",
      });
      doc.text(linea.estadoResultante, anchoPagina - margenX, y, { align: "right" });
      y += 6;
    });
    y += 2;
  }

  if (datos.saldoFavorResultante && datos.saldoFavorResultante > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Saldo a favor resultante:", margenX, y);
    doc.text(formatearMontoRecibo(datos.saldoFavorResultante), anchoPagina - margenX, y, {
      align: "right",
    });
    y += 8;
  }

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "El folio corresponde al identificador interno único del pago en el sistema.",
    margenX,
    y,
    { maxWidth: anchoPagina - margenX * 2 }
  );

  doc.save(`recibo-${datos.inmuebleCodigo}-${datos.folio.slice(0, 8)}.pdf`);
}
