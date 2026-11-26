export function dinero(valor: string | number | null | undefined): string {
  return `Bs ${new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(valor ?? 0))}`;
}

export function periodoActualBolivia(): string {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const anio = partes.find((p) => p.type === "year")?.value ?? "2026";
  const mes = partes.find((p) => p.type === "month")?.value ?? "01";
  return `${anio}-${mes}`;
}

export function fechaActualBolivia(): string {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "01";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export function tituloPeriodo(periodo: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return periodo;
  const [anio, mes] = periodo.split("-").map(Number);
  return new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(anio, mes - 1, 1)));
}

export function nombreEmpleado(empleado: { nombres: string; apellidos: string }): string {
  return `${empleado.nombres} ${empleado.apellidos}`.trim();
}

export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [anio, mes, dia] = fecha.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : fecha;
}

export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Apertura de pestaña antes del await para evitar bloqueo de popups; mantiene JWT fuera de la URL. */
export async function imprimirBlob(promesa: Promise<Blob>): Promise<void> {
  const ventana = window.open("", "_blank");
  if (!ventana) throw new Error("El navegador bloqueó la ventana emergente. Habilita las ventanas emergentes para imprimir.");
  try {
    const blob = await promesa;
    const url = URL.createObjectURL(blob);
    ventana.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (error) {
    ventana.close();
    throw error;
  }
}
