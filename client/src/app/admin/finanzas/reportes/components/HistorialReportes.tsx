"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Eraser, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { listarAuditoria, type PaginacionAuditoria, type RegistroAuditoria } from "@/lib/auditoria";
import { obtenerMensajeError } from "@/app/admin/morosidad/utils/morosidad";
import type { DetalleGeneracionReporte, FormatoReporte, TipoReporte } from "@/types/reportes";
import { CLASE_AYUDA, CLASE_HEADER_TABLA, CLASE_LABEL, CLASE_TITULO_SECCION, TIPOS_REPORTE, fechaCal, fechaHora, tituloTipo } from "../utils";

// Cada generación (vista previa, PDF o Excel) la registra el backend en la auditoría con esta entidad.
const ENTIDAD = "ReporteFinanciero";
const ETIQUETA_FORMATO: Record<FormatoReporte, string> = { JSON: "Vista previa", PDF: "PDF", EXCEL: "Excel" };

interface UsuarioResumen {
  id: string;
  nombre: string;
  apellido: string;
}

interface Filtros {
  tipo: TipoReporte | "TODOS";
  usuarioId: string;
  desde: string;
  hasta: string;
}
const FILTROS_INICIALES: Filtros = { tipo: "TODOS", usuarioId: "", desde: "", hasta: "" };

function detalleDe(registro: RegistroAuditoria): DetalleGeneracionReporte {
  return registro.detalle && typeof registro.detalle === "object" ? (registro.detalle as DetalleGeneracionReporte) : {};
}

function periodoConsultado(d: DetalleGeneracionReporte): string {
  if (d.tipo === "BALANCE_GENERAL") return d.fechaCorte ? `Al ${fechaCal(d.fechaCorte)}` : "A la fecha de emisión";
  if (!d.desde && !d.hasta) return "—";
  return `${fechaCal(d.desde)} al ${fechaCal(d.hasta)}`;
}

function parametrosExtra(d: DetalleGeneracionReporte): string | null {
  if (d.tipo === "MOROSOS" && d.orden) return `Orden: ${d.orden === "antiguedad" ? "antigüedad" : "monto"}`;
  if (d.tipo === "FLUJO_CAJA") return `Movimientos: ${d.filtroTipo === "Ingreso" ? "solo ingresos" : d.filtroTipo === "Gasto" ? "solo egresos" : "todos"}`;
  return null;
}

export function HistorialReportes({ intRecarga }: { intRecarga: number }) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [pagina, setPagina] = useState(1);
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [paginacion, setPaginacion] = useState<PaginacionAuditoria | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [strError, setStrError] = useState("");
  const [strAbierto, setStrAbierto] = useState<string | null>(null);
  const [intRefresco, setIntRefresco] = useState(0);

  const errorFechas = filtros.desde && filtros.hasta && filtros.desde > filtros.hasta
    ? "La fecha final de generación debe ser igual o posterior a la inicial."
    : "";

  useEffect(() => {
    api
      .get<{ usuarios: UsuarioResumen[] }>("/usuarios")
      .then(({ data }) => setUsuarios(data.usuarios ?? []))
      .catch(() => setUsuarios([]));
  }, []);

  useEffect(() => {
    if (errorFechas) return;
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setStrError("");
    listarAuditoria({
      entidad: ENTIDAD,
      accion: "GENERATE",
      pagina,
      ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
      ...(filtros.desde ? { desde: filtros.desde } : {}),
      ...(filtros.hasta ? { hasta: filtros.hasta } : {}),
    })
      .then((r) => {
        if (!activo) return;
        setRegistros(r.registros);
        setPaginacion(r.paginacion);
      })
      .catch((error) => activo && setStrError(obtenerMensajeError(error, "No se pudo cargar el historial de reportes.")))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [filtros.usuarioId, filtros.desde, filtros.hasta, pagina, intRecarga, intRefresco, errorFechas]);

  // El tipo vive dentro del detalle del registro: la auditoría no lo filtra, así que se filtra la página cargada.
  const visibles = useMemo(
    () => registros.filter((r) => filtros.tipo === "TODOS" || detalleDe(r).tipo === filtros.tipo),
    [registros, filtros.tipo]
  );

  const hayFiltros = filtros.tipo !== "TODOS" || Boolean(filtros.usuarioId || filtros.desde || filtros.hasta);
  const cambiar = (parcial: Partial<Filtros>) => {
    setPagina(1);
    setFiltros((prev) => ({ ...prev, ...parcial }));
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className={CLASE_TITULO_SECCION}>Historial de reportes generados</CardTitle>
          <p className={`${CLASE_AYUDA} mt-1`}>
            Cada vista previa y cada exportación quedan registradas con su tipo, usuario, fecha, periodo, formato y resultado.
          </p>
        </div>
        <div className="flex gap-2">
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={() => { setPagina(1); setFiltros(FILTROS_INICIALES); }}>
              <Eraser className="h-4 w-4" /> Limpiar filtros
            </Button>
          )}
          <Button variant="outline" size="sm" cargando={cargando} onClick={() => setIntRefresco((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>
      </CardHeader>

      <div className="grid gap-3 border-b border-border bg-muted/20 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className={CLASE_LABEL}>Tipo de reporte</span>
          <Select value={filtros.tipo} onValueChange={(v) => setFiltros((prev) => ({ ...prev, tipo: v as Filtros["tipo"] }))}>
            <SelectTrigger aria-label="Filtrar historial por tipo de reporte" className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos los tipos</SelectItem>
              {TIPOS_REPORTE.map((t) => <SelectItem key={t.id} value={t.id}>{t.titulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={CLASE_LABEL}>Generado por</span>
          <Select value={filtros.usuarioId || "TODOS"} onValueChange={(v) => cambiar({ usuarioId: v === "TODOS" ? "" : v })}>
            <SelectTrigger aria-label="Filtrar historial por usuario" className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos los usuarios</SelectItem>
              {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{`${u.nombre} ${u.apellido}`.trim()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="historial-desde" className={CLASE_LABEL}>Generado desde</label>
          <Input id="historial-desde" type="date" className="h-9" value={filtros.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="historial-hasta" className={CLASE_LABEL}>Generado hasta</label>
          <Input id="historial-hasta" type="date" className="h-9" value={filtros.hasta} aria-invalid={Boolean(errorFechas) || undefined}
            onChange={(e) => cambiar({ hasta: e.target.value })} />
        </div>
        {errorFechas && <p role="alert" className="text-[12px] text-destructive sm:col-span-2 xl:col-span-4">{errorFechas}</p>}
        {filtros.tipo !== "TODOS" && (
          <p className={`${CLASE_AYUDA} sm:col-span-2 xl:col-span-4`}>El filtro por tipo se aplica a los registros de esta página.</p>
        )}
      </div>

      <CardContent className="p-0">
        {strError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13px] text-destructive">
            <span>{strError}</span>
            <Button size="sm" variant="outline" onClick={() => setIntRefresco((n) => n + 1)}>Reintentar</Button>
          </div>
        ) : cargando && registros.length === 0 ? (
          <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : visibles.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            {hayFiltros ? "No hay reportes registrados con estos filtros." : "Todavía no se generó ningún reporte financiero."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={CLASE_HEADER_TABLA}>Fecha y hora</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Reporte</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Periodo consultado</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Formato</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Usuario</TableHead>
                  <TableHead className={CLASE_HEADER_TABLA}>Resultado</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((registro) => {
                  const d = detalleDe(registro);
                  const fallido = d.resultado === "FALLIDO";
                  const abierto = strAbierto === registro.id;
                  const extra = parametrosExtra(d);
                  return (
                    <Fragment key={registro.id}>
                      <TableRow>
                        <TableCell className="text-[13px] tabular-nums">{fechaHora(registro.createdAt)}</TableCell>
                        <TableCell className="text-[13px] font-medium">{tituloTipo(d.tipo)}</TableCell>
                        <TableCell className="text-[13px]">{periodoConsultado(d)}</TableCell>
                        <TableCell className="text-[13px]">{d.formato ? ETIQUETA_FORMATO[d.formato] ?? d.formato : "—"}</TableCell>
                        <TableCell className="text-[13px]">{registro.usuario ? `${registro.usuario.nombre} ${registro.usuario.apellido}`.trim() : "—"}</TableCell>
                        <TableCell>
                          <Badge className={`font-caption text-[11px] ${fallido ? "bg-danger-subtle text-destructive" : "bg-success-subtle text-success"}`}>
                            {fallido ? "Fallido" : "Exitoso"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="xs" aria-expanded={abierto} onClick={() => setStrAbierto(abierto ? null : registro.id)}>
                            {abierto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Detalle
                          </Button>
                        </TableCell>
                      </TableRow>
                      {abierto && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="whitespace-normal">
                            <dl className="grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-[auto_1fr]">
                              <dt className="text-muted-foreground">Tipo</dt><dd>{tituloTipo(d.tipo)}</dd>
                              <dt className="text-muted-foreground">Periodo</dt><dd>{periodoConsultado(d)}</dd>
                              {extra && (<><dt className="text-muted-foreground">Parámetros</dt><dd>{extra}</dd></>)}
                              <dt className="text-muted-foreground">Formato</dt><dd>{d.formato ? ETIQUETA_FORMATO[d.formato] ?? d.formato : "—"}</dd>
                              <dt className="text-muted-foreground">Usuario</dt>
                              <dd>{registro.usuario ? `${registro.usuario.nombre} ${registro.usuario.apellido} (${registro.usuario.email})` : "—"}</dd>
                              <dt className="text-muted-foreground">Fecha y hora</dt><dd>{fechaHora(registro.createdAt)}</dd>
                              {registro.ip && (<><dt className="text-muted-foreground">IP</dt><dd>{registro.ip}</dd></>)}
                              <dt className="text-muted-foreground">Resultado</dt>
                              <dd className={fallido ? "text-destructive" : "text-success"}>{fallido ? `Fallido${d.error ? `: ${d.error}` : ""}` : "Exitoso"}</dd>
                            </dl>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {paginacion && paginacion.totalPaginas > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className={CLASE_AYUDA}>Página {paginacion.pagina} de {paginacion.totalPaginas} · {paginacion.total} registros</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagina <= 1 || cargando} onClick={() => setPagina((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={pagina >= paginacion.totalPaginas || cargando} onClick={() => setPagina((p) => p + 1)}>
                Siguiente <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
