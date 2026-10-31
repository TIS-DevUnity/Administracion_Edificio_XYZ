/** Contratos del backend HU8 para empleados, anticipos y conceptos de nómina (parte Frontend 1). */
import type { MetodoPagoNomina, TipoConcepto } from "@/types/nomina";

export type EstadoEmpleado = "ACTIVO" | "INACTIVO";
export type EstadoAnticipo = "PENDIENTE" | "PARCIAL" | "DESCONTADO";

export interface Empleado {
  id: string;
  nombres: string;
  apellidos: string;
  documento: string;
  cargo: string;
  fechaIngreso: string; // YYYY-MM-DD
  telefono: string;
  sueldoBase: string;
  estado: EstadoEmpleado;
  estadoEtiqueta: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatosEmpleado {
  nombres: string;
  apellidos: string;
  documento: string;
  cargo: string;
  fechaIngreso: string;
  telefono: string;
  sueldoBase: number;
}

export interface Paginacion {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}

export interface RespuestaEmpleados {
  empleados: Empleado[];
  paginacion: Paginacion;
}

export interface DetalleEmpleado {
  empleado: Empleado;
  resumen: {
    cantidadNominas: number;
    anticiposPendientes: string;
    cantidadAnticiposPendientes: number;
    ultimasNominas: { id: string; periodo: string; sueldoNeto: string; estado: "PENDIENTE" | "PAGADA" }[];
  };
}

export interface Anticipo {
  id: string;
  empleadoId: string;
  monto: string;
  montoDescontado: string;
  saldoPendiente: string;
  fecha: string; // YYYY-MM-DD
  metodoPago: MetodoPagoNomina;
  descripcion: string;
  estado: EstadoAnticipo;
  estadoEtiqueta: string;
  createdAt: string;
  empleado?: { id: string; nombres: string; apellidos: string; cargo: string; documento: string };
  aplicaciones?: { id: string; nominaId: string; periodo: string | null; estadoNomina: string | null; montoAplicado: string; createdAt: string }[];
  asiento?: { id: string; cuentaId: string; cuenta: string | null; periodo: string; estado: string } | null;
}

export interface DatosAnticipo {
  empleadoId: string;
  monto: number;
  fecha: string;
  metodoPago: MetodoPagoNomina;
  descripcion: string;
  cuentaId?: string;
}

export interface FiltroAnticipos {
  empleadoId?: string;
  estado?: EstadoAnticipo;
  desde?: string;
  hasta?: string;
  pagina?: number;
  porPagina?: number;
}

export interface RespuestaAnticipos {
  anticipos: Anticipo[];
  resumen: { cantidad: number; totalOtorgado: string; totalDescontado: string; totalPendiente: string };
  paginacion: Paginacion;
}

export interface RespuestaAnticiposPendientes {
  pendientes: { empleado: { id: string; nombres: string; apellidos: string; cargo?: string; documento?: string }; cantidad: number; totalPendiente: string }[];
  cantidadEmpleados: number;
  totalGeneral: string;
}

export interface DatosConcepto {
  tipo: TipoConcepto;
  descripcion: string;
  monto: number;
  horas?: number;
}
