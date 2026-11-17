"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { FileBarChart2, FileSpreadsheet, FileText, Play, RotateCcw, Scale, TrendingUpDown, UserX } from "lucide-react";

import { AlertaPermiso } from "@/components/AlertaPermiso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { descargarBlob } from "@/components/nomina/nomina-utils";
import { MENSAJE_SOLO_SUPERVISION_REPORTES, normalizarRol, puedeGenerarReportesFinancieros } from "@/lib/permissions";
import { useSesionActual } from "@/lib/session";
import { mensajeErrorReporte, nombreArchivo, reportesService, type FormatoArchivo } from "@/services/reportes.service";
import type { OrdenMorosos, ParametrosReporte, ReporteFinanciero, TipoMovimientoFlujo, TipoReporte } from "@/types/reportes";
import { fechaRealBolivia } from "@/app/admin/morosidad/utils/morosidad";
import { HistorialReportes } from "./components/HistorialReportes";
import { VistaReporte } from "./components/VistaReporte";
import {
  CLASE_AYUDA,
  CLASE_LABEL,
  CLASE_TITULO_SECCION,
  TIPOS_REPORTE,
  claveParametros,
  parametrosIniciales,
  revisarReporte,
  tituloTipo,
  usaRango,
  validarParametros,
} from "./utils";

const ICONO_TIPO: Record<TipoReporte, typeof Scale> = { BALANCE_GENERAL: Scale, FLUJO_CAJA: TrendingUpDown, MOROSOS: UserX };

export default function ReportesFinancierosPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeGenerar = puedeGenerarReportesFinancieros(rol);

  const [parametros, setParametros] = useState<ParametrosReporte>(parametrosIniciales);
  const [bolIntentoGenerar, setBolIntentoGenerar] = useState(false);
  // BUG-04: último reporte generado de cada tipo, con la clave de sus filtros. Vive solo mientras se está en
  // esta pantalla (al salir del módulo o recargar se pierde), así se mantiene visible al cambiar de tipo y no
  // se vuelve a pedir (ni a registrar en el historial) un reporte que ya se generó con los mismos filtros.
  const [generados, setGenerados] = useState<Partial<Record<TipoReporte, { clave: string; reporte: ReporteFinanciero }>>>({});
  const [strAviso, setStrAviso] = useState("");
  const [bolGenerando, setBolGenerando] = useState(false);
  const [strErrorGenerar, setStrErrorGenerar] = useState("");
  const [exportando, setExportando] = useState<FormatoArchivo | null>(null);
  const [errorExportar, setErrorExportar] = useState<{ formato: FormatoArchivo; mensaje: string } | null>(null);
  const [strExito, setStrExito] = useState("");
  const [strPermiso, setStrPermiso] = useState("");
  const [intRecargaHistorial, setIntRecargaHistorial] = useState(0);
  const controlador = useRef<AbortController | null>(null);

  useEffect(() => () => controlador.current?.abort(), []);

  const errores = validarParametros(parametros);
  const erroresVisibles = bolIntentoGenerar ? errores : {};
  const bolParametrosValidos = Object.keys(errores).length === 0;
  const strClaveActual = claveParametros(parametros);
  const reporte = generados[parametros.tipo]?.reporte ?? null;
  const strClaveReporte = generados[parametros.tipo]?.clave ?? "";
  // La vista previa deja de valer si se cambió algún filtro después de generarla.
  const bolVistaVigente = reporte !== null && strClaveReporte === strClaveActual;
  const avisos = useMemo(() => (reporte ? revisarReporte(reporte) : null), [reporte]);
  const bolExportable = bolVistaVigente && avisos !== null && avisos.inconsistencias.length === 0;
  const hoy = fechaRealBolivia();
  // BUG-02: solo se puede restablecer si algún filtro cambió. El balance no tiene filtros (su clave es solo
  // el tipo), así que ahí el botón queda deshabilitado en vez de no hacer nada.
  const bolHayFiltrosCambiados = strClaveActual !== claveParametros({ ...parametrosIniciales(), tipo: parametros.tipo });

  function cambiar(parcial: Partial<ParametrosReporte>) {
    setStrExito("");
    setStrAviso("");
    setErrorExportar(null);
    setParametros((prev) => ({ ...prev, ...parcial }));
  }

  function elegirTipo(tipo: TipoReporte) {
    if (tipo === parametros.tipo) return;
    controlador.current?.abort();
    setBolGenerando(false);
    setStrErrorGenerar("");
    setBolIntentoGenerar(false);
    cambiar({ tipo });
  }

  function restablecer() {
    controlador.current?.abort();
    setBolGenerando(false);
    setBolIntentoGenerar(false);
    setStrErrorGenerar("");
    setStrExito("");
    setStrAviso("");
    setErrorExportar(null);
    setParametros({ ...parametrosIniciales(), tipo: parametros.tipo });
  }

  async function generar() {
    if (!bolPuedeGenerar) {
      setStrPermiso(MENSAJE_SOLO_SUPERVISION_REPORTES);
      return;
    }
    setBolIntentoGenerar(true);
    if (!bolParametrosValidos || bolGenerando) return;

    // Mismo tipo y mismos filtros: se muestra el que ya está, sin otra consulta ni otro registro en el historial.
    if (bolVistaVigente) {
      setStrExito("");
      setStrAviso("Este reporte ya está generado con estos filtros y es el que se muestra abajo. Cambia algún filtro para generar uno nuevo.");
      return;
    }

    controlador.current?.abort();
    const ctrl = new AbortController();
    controlador.current = ctrl;
    const p = parametros;
    setBolGenerando(true);
    setStrErrorGenerar("");
    setStrExito("");
    setStrAviso("");
    setErrorExportar(null);
    try {
      const resultado = await reportesService.vistaPrevia(p, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setGenerados((prev) => ({ ...prev, [p.tipo]: { clave: claveParametros(p), reporte: resultado } }));
    } catch (error) {
      if (axios.isCancel(error) || ctrl.signal.aborted) return;
      setStrErrorGenerar(await mensajeErrorReporte(error, "No se pudo generar el reporte. Intenta de nuevo."));
    } finally {
      if (!ctrl.signal.aborted) {
        setBolGenerando(false);
        setIntRecargaHistorial((n) => n + 1);
      }
    }
  }

  async function exportar(formato: FormatoArchivo) {
    if (!bolPuedeGenerar) {
      setStrPermiso(MENSAJE_SOLO_SUPERVISION_REPORTES);
      return;
    }
    if (!reporte || !bolExportable || exportando) return;
    setExportando(formato);
    setErrorExportar(null);
    setStrExito("");
    try {
      const blob = await reportesService.exportar(parametros, formato);
      const nombre = nombreArchivo(reporte, formato);
      descargarBlob(blob, nombre);
      setStrExito(`Se descargó ${nombre}.`);
    } catch (error) {
      setErrorExportar({ formato, mensaje: await mensajeErrorReporte(error, `No se pudo exportar el reporte a ${formato === "PDF" ? "PDF" : "Excel"}.`) });
    } finally {
      setExportando(null);
      setIntRecargaHistorial((n) => n + 1);
    }
  }

  if (!usuario) return <div className="px-4 py-6 sm:px-6"><Skeleton className="h-40 w-full" /></div>;
  if (!bolPuedeGenerar) {
    return <div className="px-4 py-6 sm:px-6"><AlertaPermiso mensaje={MENSAJE_SOLO_SUPERVISION_REPORTES} /></div>;
  }

  const tipoActual = TIPOS_REPORTE.find((t) => t.id === parametros.tipo)!;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <p className="max-w-3xl text-[13px] leading-[1.45] text-muted-foreground">
        Genera el balance general, el flujo de caja y el listado de morosos con los datos registrados en el sistema, revísalos en pantalla y expórtalos a PDF o Excel para auditorías y asambleas.
      </p>

      {strPermiso && <AlertaPermiso mensaje={strPermiso} />}

      <Card className="shadow-sm">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className={CLASE_TITULO_SECCION}>Generar reporte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <fieldset>
            <legend className={`${CLASE_LABEL} mb-2`}>Tipo de reporte</legend>
            <div role="radiogroup" aria-label="Tipo de reporte" className="grid gap-3 md:grid-cols-3">
              {TIPOS_REPORTE.map((t) => {
                const Icono = ICONO_TIPO[t.id];
                const activo = t.id === parametros.tipo;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => elegirTipo(t.id)}
                    className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      activo ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${activo ? "text-primary" : "text-muted-foreground"}`} />
                    <span>
                      <span className="block text-[14px] font-medium text-foreground">{t.titulo}</span>
                      <span className={`${CLASE_AYUDA} mt-0.5 block`}>{t.descripcion}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <p className={`${CLASE_LABEL} mb-2`}>Filtros de {tipoActual.titulo.toLowerCase()}</p>
            {!usaRango(parametros.tipo) ? (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[13px] text-muted-foreground">
                El balance general se calcula a la fecha de emisión (hoy) con todo lo registrado; no usa rango de fechas ni tiene filtros que restablecer.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_180px_minmax(0,260px)]">
                <div className="flex flex-col gap-1">
                  <label htmlFor="reporte-desde" className={CLASE_LABEL}>Fecha de inicio *</label>
                  <Input id="reporte-desde" type="date" required max={hoy} className="h-9" value={parametros.desde}
                    aria-invalid={Boolean(erroresVisibles.desde) || undefined} aria-describedby={erroresVisibles.desde ? "error-desde" : undefined}
                    onChange={(e) => cambiar({ desde: e.target.value })} />
                  {erroresVisibles.desde && <p id="error-desde" className="text-[12px] text-destructive">{erroresVisibles.desde}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="reporte-hasta" className={CLASE_LABEL}>Fecha de finalización *</label>
                  <Input id="reporte-hasta" type="date" required max={hoy} className="h-9" value={parametros.hasta}
                    aria-invalid={Boolean(erroresVisibles.hasta) || undefined} aria-describedby={erroresVisibles.hasta ? "error-hasta" : undefined}
                    onChange={(e) => cambiar({ hasta: e.target.value })} />
                  {erroresVisibles.hasta && <p id="error-hasta" className="text-[12px] text-destructive">{erroresVisibles.hasta}</p>}
                </div>
                {parametros.tipo === "FLUJO_CAJA" && (
                  <div className="flex flex-col gap-1">
                    <span className={CLASE_LABEL}>Tipo de operación</span>
                    <Select value={parametros.tipoMovimiento || "TODOS"}
                      onValueChange={(v) => cambiar({ tipoMovimiento: v === "TODOS" ? "" : (v as TipoMovimientoFlujo) })}>
                      <SelectTrigger aria-label="Tipo de operación" className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TODOS">Ingresos y egresos</SelectItem>
                        <SelectItem value="Ingreso">Solo ingresos</SelectItem>
                        <SelectItem value="Gasto">Solo egresos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {parametros.tipo === "MOROSOS" && (
                  <div className="flex flex-col gap-1">
                    <span className={CLASE_LABEL}>Ordenar por</span>
                    <Select value={parametros.orden} onValueChange={(v) => cambiar({ orden: v as OrdenMorosos })}>
                      <SelectTrigger aria-label="Ordenar listado por" className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monto">Mayor monto adeudado</SelectItem>
                        <SelectItem value="antiguedad">Mayor antigüedad de la deuda</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <p className={`${CLASE_AYUDA} sm:col-span-2 xl:col-span-3`}>
                  {parametros.tipo === "FLUJO_CAJA"
                    ? "Se incluyen los movimientos registrados entre ambas fechas, inclusive. El tipo de operación filtra la lista de movimientos; los totales y saldos siempre son completos."
                    : "Solo obligaciones pendientes: expensas que vencieron entre ambas fechas, siguen impagas y no están en un plan de pagos."}
                  {" "}Se pueden consultar periodos anteriores sin límite; no se aceptan fechas futuras.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row">
              {/* BUG-06: acción principal claramente identificada (antes "Generar vista previa"). */}
              <Button size="lg" className="px-4 font-medium" onClick={() => void generar()} cargando={bolGenerando}
                aria-label={`Generar reporte: ${tipoActual.titulo}`}>
                <Play className="h-4 w-4" /> Generar reporte
              </Button>
              <Button variant="outline" onClick={restablecer} disabled={bolGenerando || !bolHayFiltrosCambiados}>
                <RotateCcw className="h-4 w-4" /> Restablecer filtros
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" disabled={!bolExportable || exportando !== null} cargando={exportando === "PDF"} onClick={() => void exportar("PDF")}>
                <FileText className="h-4 w-4" /> Exportar PDF
              </Button>
              <Button variant="outline" disabled={!bolExportable || exportando !== null} cargando={exportando === "EXCEL"} onClick={() => void exportar("EXCEL")}>
                <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
              </Button>
            </div>
          </div>
          <p className={CLASE_AYUDA}>
            {!reporte
              ? "Elige el tipo y los filtros y pulsa \"Generar reporte\" para verlo en pantalla; después podrás exportarlo."
              : !bolVistaVigente
                ? "Cambiaste los filtros: pulsa \"Generar reporte\" de nuevo para poder exportar."
                : avisos && avisos.inconsistencias.length > 0
                  ? "La exportación está bloqueada porque los totales de la vista previa no cuadran."
                  : "El archivo se genera con los mismos parámetros de la vista previa."}
          </p>

          {strErrorGenerar && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">{strErrorGenerar}</p>
          )}
          {errorExportar && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
              <span>{errorExportar.mensaje}</span>
              <Button size="sm" variant="outline" disabled={exportando !== null} onClick={() => void exportar(errorExportar.formato)}>Reintentar</Button>
            </div>
          )}
          {strAviso && <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">{strAviso}</p>}
          {strExito && <p role="status" className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">{strExito}</p>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-sm" aria-busy={bolGenerando || undefined}>
        {bolGenerando ? (
          <div className="space-y-3 p-5">
            <p className={CLASE_AYUDA}>Generando {tituloTipo(parametros.tipo).toLowerCase()}…</p>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : reporte && avisos ? (
          <div className={bolVistaVigente ? undefined : "opacity-60"}>
            <VistaReporte key={`${strClaveReporte}-${reporte.generadoEn}`} reporte={reporte} avisos={avisos} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <FileBarChart2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-[14px] font-medium text-foreground">Aún no hay un reporte generado</p>
            <p className={`${CLASE_AYUDA} max-w-md`}>Elige el tipo de reporte, ajusta los filtros y pulsa &quot;Generar reporte&quot; para verlo aquí antes de exportarlo.</p>
          </div>
        )}
      </Card>

      <HistorialReportes intRecarga={intRecargaHistorial} />
    </div>
  );
}
