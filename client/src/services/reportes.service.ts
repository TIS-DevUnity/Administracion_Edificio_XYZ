import axios from "axios";
import { api } from "@/lib/api";
import type {
  BalanceGeneral,
  FlujoCaja,
  ListadoMorosos,
  ParametrosReporte,
  ReporteFinanciero,
  TipoReporte,
} from "@/types/reportes";

// GET /api/financiero/reportes/* (solo ADMINISTRADOR y DIRECTORIO). Cada llamada, vista previa o
// exportación, queda registrada por el backend en la auditoría (entidad ReporteFinanciero).
const BASE = "/financiero/reportes";

const RUTA: Record<TipoReporte, string> = {
  BALANCE_GENERAL: `${BASE}/balance-general`,
  FLUJO_CAJA: `${BASE}/flujo-caja`,
  MOROSOS: `${BASE}/morosos`,
};

export type FormatoArchivo = "PDF" | "EXCEL";

const ARCHIVO: Record<FormatoArchivo, { sufijo: string; extension: string; firma: string; tipo: string }> = {
  // Un PDF empieza con "%PDF" y un .xlsx (zip) con "PK": así se detecta un archivo vacío o dañado.
  PDF: { sufijo: "pdf", extension: "pdf", firma: "%PDF", tipo: "application/pdf" },
  EXCEL: {
    sufijo: "excel",
    extension: "xlsx",
    firma: "PK",
    tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
};

/** Solo los parámetros que el backend entiende para cada tipo (el balance no lleva ninguno). */
export function parametrosDeConsulta(p: ParametrosReporte): Record<string, string> {
  if (p.tipo === "BALANCE_GENERAL") return {};
  const rango = { desde: p.desde, hasta: p.hasta };
  if (p.tipo === "FLUJO_CAJA") return p.tipoMovimiento ? { ...rango, tipo: p.tipoMovimiento } : rango;
  return { ...rango, orden: p.orden };
}

/** Mismos nombres que pone el backend en Content-Disposition. */
export function nombreArchivo(reporte: ReporteFinanciero, formato: FormatoArchivo): string {
  const ext = ARCHIVO[formato].extension;
  if (reporte.tipoReporte === "BALANCE_GENERAL") return `balance-general-${reporte.fechaCorte}.${ext}`;
  const { desde, hasta } = reporte.rango;
  return reporte.tipoReporte === "FLUJO_CAJA"
    ? `flujo-caja-${desde}-a-${hasta}.${ext}`
    : `listado-morosos-${desde}-a-${hasta}.${ext}`;
}

export class ErrorArchivoReporte extends Error {}

async function validarArchivo(blob: Blob, formato: FormatoArchivo): Promise<Blob> {
  const { firma, tipo } = ARCHIVO[formato];
  const inicio = blob.size >= firma.length ? await blob.slice(0, firma.length).text() : "";
  if (inicio !== firma) {
    throw new ErrorArchivoReporte("El archivo recibido está vacío o dañado y no se descargó. Intenta exportar de nuevo.");
  }
  return blob.type === tipo ? blob : new Blob([blob], { type: tipo });
}

export const reportesService = {
  async vistaPrevia(p: ParametrosReporte, signal?: AbortSignal): Promise<ReporteFinanciero> {
    const { data } = await api.get<BalanceGeneral | FlujoCaja | ListadoMorosos>(RUTA[p.tipo], {
      params: parametrosDeConsulta(p),
      signal,
    });
    return data;
  },

  async exportar(p: ParametrosReporte, formato: FormatoArchivo): Promise<Blob> {
    const { data } = await api.get<Blob>(`${RUTA[p.tipo]}/${ARCHIVO[formato].sufijo}`, {
      params: parametrosDeConsulta(p),
      responseType: "blob",
    });
    return validarArchivo(data, formato);
  },
};

/** Mensaje del backend; en las descargas el error llega como Blob con el JSON adentro. */
export async function mensajeErrorReporte(error: unknown, strFallback: string): Promise<string> {
  if (error instanceof ErrorArchivoReporte) return error.message;
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) return "Solo el Administrador y el Directorio pueden generar reportes financieros.";
    let data: unknown = error.response?.data;
    if (data instanceof Blob) {
      try {
        data = JSON.parse(await data.text());
      } catch {
        data = null;
      }
    }
    const strMensaje = (data as { error?: string } | null)?.error;
    if (strMensaje) return strMensaje;
    if (!error.response) return "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
  }
  return strFallback;
}
