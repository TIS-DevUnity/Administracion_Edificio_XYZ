import type { SituacionCuenta } from "@/types/cuentaInmueble";

/** Contrato de GET /api/financiero/copropietarios/:id/cuenta (cuenta-residente.service.js). HU3 CA-14. */

export type ClaseInmuebleCuenta = "DEPARTAMENTO" | "BAULERA" | "PARQUEO";

export interface CuentaResidenteDTO {
  copropietario: { id: string; nombre: string; apellido: string; ci: string; email: string | null; telefono: string | null };
  inmuebles: {
    inmuebleId: string;
    codigo: string;
    clase: ClaseInmuebleCuenta;
    tipo: string;
    activo: boolean;
    rol: "PROPIETARIO" | "INQUILINO";
    cuotaMensual: string | null;
    cargoMensual: string;
    seCobra: boolean;
  }[];
  cargoMensual: {
    conceptos: { clase: ClaseInmuebleCuenta; codigo: string; inmuebleId: string; monto: string }[];
    total: string;
    extrasEnDepartamento: string | null;
  };
  departamentos: {
    inmuebleId: string;
    codigo: string;
    tipo: string | null;
    expensasPendientes: number;
    deudaPendiente: string;
    deudaEnPlanDePagos: string;
    saldoFavor: string;
    saldoNeto: string;
    situacion: SituacionCuenta;
  }[];
  resumen: { deudaPendiente: string; saldoFavor: string; saldoNeto: string; situacion: SituacionCuenta };
  avisos: string[];
}
