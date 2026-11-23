import { fechaRealBolivia } from "@/app/admin/morosidad/utils/morosidad";
import { DIAS_MAXIMOS_ANTICIPACION } from "@/services/areasComunes.service";
import type { DiaDisponibilidad, EstadoReserva, EstadoTurno, HorarioArea } from "@/types/areasComunes";

export const CLASE_LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
export const CLASE_AYUDA = "font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
export const CLASE_TITULO_SECCION = "font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground";
export const CLASE_HEADER_TABLA = "font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground";

export const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Hoy en Bolivia (la fecha real; las reservas no usan la fecha simulada de Morosidad). */
export const hoyBolivia = fechaRealBolivia;

const aFecha = (iso: string) => new Date(`${iso}T12:00:00Z`);
const aIso = (fecha: Date) => fecha.toISOString().slice(0, 10);

export function sumarDias(iso: string, dias: number): string {
  const fecha = aFecha(iso);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return aIso(fecha);
}

/** Último día en que se puede reservar (hoy + 60 días). */
export function fechaMaximaReserva(hoy = hoyBolivia()): string {
  return sumarDias(hoy, DIAS_MAXIMOS_ANTICIPACION);
}

/** "2026-11" → primer y último día del mes. */
export function limitesDelMes(mes: string): { inicio: string; fin: string } {
  const [anio, numMes] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(anio, numMes, 0, 12));
  return { inicio: `${mes}-01`, fin: aIso(fin) };
}

export function sumarMeses(mes: string, cantidad: number): string {
  const [anio, numMes] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, numMes - 1 + cantidad, 1, 12));
  return aIso(fecha).slice(0, 7);
}

/** Celdas del calendario mensual (semanas de domingo a sábado); null = relleno fuera del mes. */
export function celdasDelMes(mes: string): (string | null)[] {
  const { inicio, fin } = limitesDelMes(mes);
  const relleno = aFecha(inicio).getUTCDay();
  const dias = Number(fin.slice(8, 10));
  const celdas: (string | null)[] = Array(relleno).fill(null);
  for (let d = 1; d <= dias; d++) celdas.push(`${mes}-${String(d).padStart(2, "0")}`);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

export function tituloMes(mes: string): string {
  const [anio, numMes] = mes.split("-").map(Number);
  const texto = new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(anio, numMes - 1, 15))
  );
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2026-11-28" → "Sábado 28 de noviembre de 2026". */
export function fechaLarga(iso: string): string {
  const texto = new Intl.DateTimeFormat("es-BO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(aFecha(iso));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

export const franja = (t: { horaInicio: string; horaFin: string }) => `${t.horaInicio} a ${t.horaFin}`;

// ───────── Estados de los turnos ─────────
export const ESTADO_TURNO: Record<EstadoTurno, { etiqueta: string; clase: string; punto: string }> = {
  DISPONIBLE: { etiqueta: "Disponible", clase: "border-success/40 bg-success-subtle text-success", punto: "bg-success" },
  RESERVADO: { etiqueta: "Reservado", clase: "border-accent-secondary/40 bg-accent-secondary/15 text-accent-secondary", punto: "bg-accent-secondary" },
  BLOQUEADO: { etiqueta: "Bloqueado", clase: "border-destructive/40 bg-danger-subtle text-destructive", punto: "bg-destructive" },
  PASADO: { etiqueta: "Ya pasó", clase: "border-border bg-muted/40 text-muted-foreground", punto: "bg-muted-foreground" },
};

export type EstadoDia = EstadoTurno | "SIN_HORARIO" | "FUERA_DE_RANGO";

/**
 * Estado resumido de un día del calendario: disponible si queda al menos un turno libre; si no, el que
 * predomina (bloqueado por mantenimiento, todo reservado o ya pasado). Sin turnos = no habilitado.
 */
export function estadoDelDia(dia: DiaDisponibilidad | undefined): EstadoDia {
  if (!dia) return "FUERA_DE_RANGO";
  if (dia.turnos.length === 0) return "SIN_HORARIO";
  const estados = dia.turnos.map((t) => t.estado);
  if (estados.includes("DISPONIBLE")) return "DISPONIBLE";
  if (estados.every((e) => e === "PASADO")) return "PASADO";
  if (estados.includes("BLOQUEADO") && !estados.includes("RESERVADO")) return "BLOQUEADO";
  return "RESERVADO";
}

/** Horarios activos agrupados por día de la semana (lunes primero, como se lee en Bolivia). */
export function horariosPorDia(horarios: HorarioArea[]): { dia: number; franjas: string[] }[] {
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return orden
    .map((dia) => ({
      dia,
      franjas: horarios
        .filter((h) => h.activo && h.diaSemana === dia)
        .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
        .map(franja),
    }))
    .filter((d) => d.franjas.length > 0);
}

// ───────── Estados de las reservas ─────────
export function estadoReservaVisible(r: { estado: EstadoReserva; fecha: string; horaFin: string }, hoy = hoyBolivia()) {
  if (r.estado === "CANCELADA") return { etiqueta: "Cancelado", clase: "bg-danger-subtle text-destructive" };
  if (r.fecha < hoy) return { etiqueta: "Finalizado", clase: "bg-muted text-muted-foreground" };
  return { etiqueta: "Reservado", clase: "bg-success-subtle text-success" };
}
