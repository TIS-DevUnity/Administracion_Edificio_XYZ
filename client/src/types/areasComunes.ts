// Áreas comunes y reservas (HU14). Contratos de server/src/modules/operativo-seguridad/areas-comunes.
// Fechas "YYYY-MM-DD" y horas "HH:MM" en hora de Bolivia. diaSemana: 0 = domingo ... 6 = sábado.

export interface HorarioArea {
  id: string;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  activo: boolean;
}

export interface AreaComun {
  id: string;
  nombre: string;
  descripcion: string | null;
  condiciones: string | null;
  activa: boolean;
  horarios: HorarioArea[];
}

export type EstadoTurno = "DISPONIBLE" | "RESERVADO" | "BLOQUEADO" | "PASADO";

export interface TurnoDisponibilidad {
  horaInicio: string;
  horaFin: string;
  estado: EstadoTurno;
  /** Solo en BLOQUEADO: motivo del bloqueo (p. ej. "Mantenimiento"). */
  motivo?: string;
  bloqueoId?: string;
}

export interface DiaDisponibilidad {
  fecha: string;
  diaSemana: number;
  turnos: TurnoDisponibilidad[];
}

export interface DisponibilidadArea {
  area: { id: string; nombre: string; activa: boolean };
  desde: string;
  hasta: string;
  dias: DiaDisponibilidad[];
}

export type EstadoReserva = "RESERVADA" | "CANCELADA";

export interface ReservaArea {
  id: string;
  areaId: string;
  area?: { id: string; nombre: string };
  copropietarioId: string;
  copropietario?: { id: string; nombre: string; apellido: string };
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: EstadoReserva;
  canceladaEn: string | null;
  motivoCancelacion: string | null;
  createdAt: string;
}

/** Cuerpo de error del módulo: { error, codigo, detalle? } (NO_AL_DIA trae además deudaVencida). */
export interface ErrorAreasComunes {
  error?: string;
  codigo?: string;
  detalle?: unknown;
  deudaVencida?: string;
}
