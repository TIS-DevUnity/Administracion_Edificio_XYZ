"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MENSAJE_HORARIO_NO_DISPONIBLE } from "@/services/areasComunes.service";
import type { DiaDisponibilidad, TurnoDisponibilidad } from "@/types/areasComunes";
import {
  CLASE_AYUDA,
  CLASE_LABEL,
  CLASE_TITULO_SECCION,
  DIA_CORTO,
  ESTADO_TURNO,
  celdasDelMes,
  estadoDelDia,
  fechaLarga,
  franja,
  sumarMeses,
  tituloMes,
  type EstadoDia,
} from "../utils";

const CLASE_DIA: Record<EstadoDia, string> = {
  DISPONIBLE: "border-success/40 bg-success-subtle text-success hover:bg-success/25",
  RESERVADO: "border-accent-secondary/40 bg-accent-secondary/15 text-accent-secondary hover:bg-accent-secondary/25",
  BLOQUEADO: "border-destructive/40 bg-danger-subtle text-destructive hover:bg-destructive/25",
  PASADO: "border-border bg-muted/30 text-muted-foreground",
  SIN_HORARIO: "border-border bg-muted/20 text-muted-foreground/60",
  FUERA_DE_RANGO: "border-transparent text-muted-foreground/40",
};

const LEYENDA: { estado: EstadoDia; texto: string }[] = [
  { estado: "DISPONIBLE", texto: "Con horarios disponibles" },
  { estado: "RESERVADO", texto: "Reservado" },
  { estado: "BLOQUEADO", texto: "Bloqueado por mantenimiento" },
  { estado: "PASADO", texto: "Fecha pasada" },
  { estado: "SIN_HORARIO", texto: "Sin horario de uso" },
];

/** Por qué un turno no se puede elegir (CA 3.1.1 y 4.1.2). */
function motivoNoElegible(turno: TurnoDisponibilidad): string {
  if (turno.estado === "RESERVADO") return MENSAJE_HORARIO_NO_DISPONIBLE;
  if (turno.estado === "BLOQUEADO") return `Horario bloqueado${turno.motivo ? `: ${turno.motivo}` : ""}. No se puede reservar.`;
  return "Este horario ya pasó. No se puede reservar.";
}

export function CalendarioArea({
  mes, mesMinimo, mesMaximo, onCambiarMes, dias, cargando, error, onReintentar,
  fechaSeleccionada, onSeleccionarFecha, turnoSeleccionado, onSeleccionarTurno, onTurnoNoElegible,
}: {
  mes: string;
  mesMinimo: string;
  mesMaximo: string;
  onCambiarMes: (mes: string) => void;
  /** Días consultados (solo los que están entre hoy y el límite de anticipación). */
  dias: DiaDisponibilidad[];
  cargando: boolean;
  error: string;
  onReintentar: () => void;
  fechaSeleccionada: string | null;
  onSeleccionarFecha: (fecha: string) => void;
  turnoSeleccionado: { horaInicio: string; horaFin: string } | null;
  onSeleccionarTurno: (turno: TurnoDisponibilidad) => void;
  onTurnoNoElegible: (mensaje: string) => void;
}) {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const diaSeleccionado = fechaSeleccionada ? porFecha.get(fechaSeleccionada) : undefined;
  const [mesAnterior, mesSiguiente] = [sumarMeses(mes, -1), sumarMeses(mes, 1)];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label="Calendario de disponibilidad">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Mes anterior" disabled={mes <= mesMinimo} onClick={() => onCambiarMes(mesAnterior)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className={CLASE_TITULO_SECCION}>{tituloMes(mes)}</h3>
          <Button variant="outline" size="icon-sm" aria-label="Mes siguiente" disabled={mes >= mesMaximo} onClick={() => onCambiarMes(mesSiguiente)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={onReintentar}>Reintentar</Button>
          </div>
        ) : cargando ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <div role="grid" aria-label={`Días de ${tituloMes(mes)}`} className="grid grid-cols-7 gap-1.5">
            {DIA_CORTO.map((d) => (
              <div key={d} role="columnheader" className={`${CLASE_LABEL} py-1 text-center`}>{d}</div>
            ))}
            {celdasDelMes(mes).map((fecha, i) => {
              if (!fecha) return <div key={`vacio-${i}`} />;
              const estado = estadoDelDia(porFecha.get(fecha));
              // CA 4.1.1: no se eligen fechas pasadas, fuera de la ventana de reserva ni sin horario de uso.
              const elegible = estado !== "FUERA_DE_RANGO" && estado !== "SIN_HORARIO" && estado !== "PASADO";
              const activo = fecha === fechaSeleccionada;
              return (
                <button
                  key={fecha}
                  type="button"
                  role="gridcell"
                  disabled={!elegible}
                  aria-selected={activo}
                  aria-label={`${fechaLarga(fecha)}: ${LEYENDA.find((l) => l.estado === estado)?.texto ?? "No disponible para reservas"}`}
                  onClick={() => onSeleccionarFecha(fecha)}
                  className={`flex aspect-square min-h-10 flex-col items-center justify-center rounded-lg border text-[13px] tabular-nums transition-colors disabled:cursor-not-allowed ${CLASE_DIA[estado]} ${
                    activo ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""
                  }`}
                >
                  {Number(fecha.slice(8, 10))}
                </button>
              );
            })}
          </div>
        )}

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Leyenda del calendario">
          {LEYENDA.map((l) => (
            <li key={l.estado} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded border ${CLASE_DIA[l.estado]}`} />
              <span className={CLASE_AYUDA}>{l.texto}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Horarios del día" className="rounded-lg border border-border p-4">
        {!fechaSeleccionada ? (
          <p className="text-[13px] text-muted-foreground">Elige una fecha del calendario para ver sus horarios.</p>
        ) : (
          <>
            <p className={CLASE_LABEL}>Horarios del</p>
            <p className="mt-0.5 text-[14px] font-medium text-foreground">{fechaLarga(fechaSeleccionada)}</p>
            {!diaSeleccionado || diaSeleccionado.turnos.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Esta área no tiene horarios de uso ese día.</p>
            ) : (
              <ul role="radiogroup" aria-label="Horarios" className="mt-3 flex flex-col gap-2">
                {diaSeleccionado.turnos.map((turno) => {
                  const info = ESTADO_TURNO[turno.estado];
                  const disponible = turno.estado === "DISPONIBLE";
                  const elegido = disponible && turnoSeleccionado?.horaInicio === turno.horaInicio && turnoSeleccionado.horaFin === turno.horaFin;
                  return (
                    <li key={turno.horaInicio}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={elegido}
                        // Los no disponibles se pueden pulsar para explicar por qué no se eligen, pero nunca se seleccionan.
                        aria-disabled={!disponible}
                        onClick={() => (disponible ? onSeleccionarTurno(turno) : onTurnoNoElegible(motivoNoElegible(turno)))}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${info.clase} ${
                          disponible ? "hover:brightness-110" : "cursor-not-allowed opacity-80"
                        } ${elegido ? "ring-2 ring-primary" : ""}`}
                      >
                        <span className="flex items-center gap-2 text-[13px] font-medium tabular-nums">
                          {elegido ? <CheckCircle2 className="h-4 w-4" /> : disponible ? <Clock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          {franja(turno)}
                        </span>
                        <span className="text-right text-[12px]">
                          {elegido ? "Seleccionado" : info.etiqueta}
                          {turno.estado === "BLOQUEADO" && turno.motivo && <span className="block text-[11px] opacity-80">{turno.motivo}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
