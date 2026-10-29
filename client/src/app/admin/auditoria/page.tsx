"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Eraser, Info, Search } from "lucide-react";

import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  ACCIONES_AUDITORIA,
  ENTIDADES_AUDITORIA,
  PaginacionAuditoria,
  RegistroAuditoria,
  etiquetaAccion,
  etiquetaEntidad,
  listarAuditoria,
} from "@/lib/auditoria";

const CLASE_HEADER_TABLA =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_LABEL_CAMPO =
  "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_TITULO_DIALOGO =
  "font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground";

const CLASE_BADGE_ACCION: Record<string, string> = {
  CREATE: "bg-success-subtle text-success",
  UPDATE: "bg-accent-secondary/10 text-accent-secondary",
  DELETE: "bg-danger-subtle text-destructive",
  LOGIN: "bg-muted text-muted-foreground",
  LOGIN_FALLIDO: "bg-danger-subtle text-destructive",
};

interface UsuarioResumen {
  id: string;
  nombre: string;
  apellido: string;
  rol: string;
}

function formatearFechaHora(strFechaISO: string): string {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(strFechaISO));
}

function formatearValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function esDiff(valor: unknown): valor is { antes?: unknown; despues?: unknown } {
  return Boolean(
    valor &&
      typeof valor === "object" &&
      !Array.isArray(valor) &&
      ("antes" in (valor as object) || "despues" in (valor as object))
  );
}

function RenderDetalle({ detalle }: { detalle: unknown }) {
  if (!detalle || typeof detalle !== "object") {
    return <p className="text-[13px] text-muted-foreground">Sin detalle adicional.</p>;
  }

  const entradas = Object.entries(detalle as Record<string, unknown>);
  if (entradas.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Sin detalle adicional.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {entradas.map(([campo, valor]) => (
        <div key={campo} className="text-[13px]">
          <span className="font-medium text-foreground">{campo}: </span>
          {esDiff(valor) ? (
            <span>
              <span className="text-muted-foreground line-through">{formatearValor(valor.antes)}</span>
              {" → "}
              <span className="text-foreground">{formatearValor(valor.despues)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{formatearValor(valor)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [paginacion, setPaginacion] = useState<PaginacionAuditoria | null>(null);
  const [usuariosMap, setUsuariosMap] = useState<Record<string, UsuarioResumen>>({});
  const [usuarios, setUsuarios] = useState<UsuarioResumen[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [strError, setStrError] = useState("");

  const [filtroUsuarioId, setFiltroUsuarioId] = useState("");
  const [filtroEntidad, setFiltroEntidad] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("");
  const [strDesde, setStrDesde] = useState("");
  const [strHasta, setStrHasta] = useState("");

  const [registroDetalle, setRegistroDetalle] = useState<RegistroAuditoria | null>(null);

  useEffect(() => {
    api
      .get<{ usuarios: UsuarioResumen[] }>("/usuarios")
      .then((response) => {
        setUsuarios(response.data.usuarios);
        const mapa: Record<string, UsuarioResumen> = {};
        response.data.usuarios.forEach((u) => {
          mapa[u.id] = u;
        });
        setUsuariosMap(mapa);
      })
      .catch((error) => console.error("Error al cargar usuarios:", error));
  }, []);

  async function cargarAuditoria(intPagina: number) {
    setIsLoading(true);
    setStrError("");

    try {
      const resultado = await listarAuditoria({
        usuarioId: filtroUsuarioId || undefined,
        entidad: filtroEntidad || undefined,
        accion: filtroAccion || undefined,
        desde: strDesde || undefined,
        hasta: strHasta || undefined,
        pagina: intPagina,
      });
      setRegistros(resultado.registros);
      setPaginacion(resultado.paginacion);
    } catch (error) {
      // Ante un error no se deja la tabla anterior ni datos parciales: se limpia y
      // se muestra únicamente el mensaje de error.
      setRegistros([]);
      setPaginacion(null);
      if (axios.isAxiosError(error)) {
        const strMensaje = (error.response?.data as { error?: string } | undefined)?.error;
        setStrError(strMensaje || "No fue posible cargar la bitácora de auditoría.");
      } else {
        setStrError("No fue posible cargar la bitácora de auditoría.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarAuditoria(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroUsuarioId, filtroEntidad, filtroAccion, strDesde, strHasta]);

  function handleLimpiarFiltros() {
    setFiltroUsuarioId("");
    setFiltroEntidad("");
    setFiltroAccion("");
    setStrDesde("");
    setStrHasta("");
  }

  const bolHayFiltros = Boolean(filtroUsuarioId || filtroEntidad || filtroAccion || strDesde || strHasta);

  function obtenerNombreUsuario(registro: RegistroAuditoria): string {
    if (!registro.usuarioId) return "Sistema";
    const usuario = usuariosMap[registro.usuarioId];
    return usuario ? `${usuario.nombre} ${usuario.apellido}` : registro.usuarioId;
  }

  function obtenerRolUsuario(registro: RegistroAuditoria): string {
    if (!registro.usuarioId) return "—";
    // El backend no guarda el rol que tenía el usuario en el momento del evento,
    // así que se muestra su rol actual (puede diferir si su rol cambió después).
    return usuariosMap[registro.usuarioId]?.rol ?? "—";
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Registro inalterable de operaciones de creación, edición y eliminación sobre módulos
        clave del sistema. Solo lectura: no existe forma de editar o eliminar un evento desde
        aquí.
      </p>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
              Filtros
            </CardTitle>
            {bolHayFiltros && (
              <Button variant="ghost" size="sm" onClick={handleLimpiarFiltros}>
                <Eraser className="mr-2 h-4 w-4" />
                Limpiar filtros
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="grid gap-1">
              <label className={CLASE_LABEL_CAMPO}>Desde</label>
              <Input type="date" value={strDesde} onChange={(e) => setStrDesde(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label className={CLASE_LABEL_CAMPO}>Hasta</label>
              <Input type="date" value={strHasta} onChange={(e) => setStrHasta(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label className={CLASE_LABEL_CAMPO}>Usuario</label>
              <Select value={filtroUsuarioId || "TODOS"} onValueChange={(v) => setFiltroUsuarioId(v === "TODOS" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre} {u.apellido}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <label className={CLASE_LABEL_CAMPO}>Módulo</label>
              <Select value={filtroEntidad || "TODOS"} onValueChange={(v) => setFiltroEntidad(v === "TODOS" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  {ENTIDADES_AUDITORIA.map((entidad) => (
                    <SelectItem key={entidad} value={entidad}>
                      {etiquetaEntidad(entidad)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <label className={CLASE_LABEL_CAMPO}>Acción</label>
              <Select value={filtroAccion || "TODAS"} onValueChange={(v) => setFiltroAccion(v === "TODAS" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas</SelectItem>
                  {ACCIONES_AUDITORIA.map((accion) => (
                    <SelectItem key={accion} value={accion}>
                      {etiquetaAccion(accion)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading && (
            <div className="space-y-4 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!isLoading && strError && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-[14px] font-medium text-destructive">{strError}</p>
              <Button variant="outline" size="sm" onClick={() => cargarAuditoria(1)}>
                Reintentar
              </Button>
            </div>
          )}

          {!isLoading && !strError && registros.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground" />
              <p className="text-[14px] font-medium text-foreground">
                No se encontraron eventos que coincidan con los filtros aplicados.
              </p>
            </div>
          )}

          {!isLoading && !strError && registros.length > 0 && (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={CLASE_HEADER_TABLA}>Fecha y hora</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Usuario</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Rol</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Módulo</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>Acción</TableHead>
                      <TableHead className={CLASE_HEADER_TABLA}>IP</TableHead>
                      <TableHead className={`${CLASE_HEADER_TABLA} text-right`}>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registros.map((registro) => (
                      <TableRow key={registro.id}>
                        <TableCell className="text-[13px] text-foreground">
                          {formatearFechaHora(registro.createdAt)}
                        </TableCell>
                        <TableCell className="text-[13px] text-foreground">
                          {obtenerNombreUsuario(registro)}
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">
                          {obtenerRolUsuario(registro)}
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">
                          {etiquetaEntidad(registro.entidad)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ACCION[registro.accion] ?? "bg-muted text-muted-foreground"}`}>
                            {etiquetaAccion(registro.accion)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">{registro.ip ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setRegistroDetalle(registro)}>
                            <Info className="mr-2 h-4 w-4" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 p-4 md:hidden">
                {registros.map((registro) => (
                  <button
                    key={registro.id}
                    type="button"
                    onClick={() => setRegistroDetalle(registro)}
                    className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ACCION[registro.accion] ?? "bg-muted text-muted-foreground"}`}>
                        {etiquetaAccion(registro.accion)}
                      </Badge>
                      <span className="text-[12px] text-muted-foreground">
                        {formatearFechaHora(registro.createdAt)}
                      </span>
                    </div>
                    <p className="text-[13px] font-medium text-foreground">{obtenerNombreUsuario(registro)}</p>
                    <p className="text-[12px] text-muted-foreground">{etiquetaEntidad(registro.entidad)}</p>
                  </button>
                ))}
              </div>

              {paginacion && paginacion.totalPaginas > 1 && (
                <div className="flex items-center justify-between border-t border-border p-4">
                  <p className="text-[12px] text-muted-foreground">
                    Página {paginacion.pagina} de {paginacion.totalPaginas} · {paginacion.total} eventos
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={paginacion.pagina <= 1}
                      onClick={() => cargarAuditoria(paginacion.pagina - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={paginacion.pagina >= paginacion.totalPaginas}
                      onClick={() => cargarAuditoria(paginacion.pagina + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Diálogo: detalle del evento (solo lectura, sin acciones de edición/eliminación) */}
      <Dialog open={registroDetalle !== null} onOpenChange={(bolOpen) => !bolOpen && setRegistroDetalle(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Detalle del evento</DialogTitle>
          </DialogHeader>

          {registroDetalle && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Badge className={`font-caption text-[11px] ${CLASE_BADGE_ACCION[registroDetalle.accion] ?? "bg-muted text-muted-foreground"}`}>
                  {etiquetaAccion(registroDetalle.accion)}
                </Badge>
                <span className="text-[13px] text-muted-foreground">{etiquetaEntidad(registroDetalle.entidad)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/30 p-3">
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Usuario</p>
                  <p className="mt-1 text-[13px] text-foreground">{obtenerNombreUsuario(registroDetalle)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Rol</p>
                  <p className="mt-1 text-[13px] text-foreground">{obtenerRolUsuario(registroDetalle)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Fecha y hora</p>
                  <p className="mt-1 text-[13px] text-foreground">{formatearFechaHora(registroDetalle.createdAt)}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Dirección IP</p>
                  <p className="mt-1 text-[13px] text-foreground">{registroDetalle.ip ?? "—"}</p>
                </div>
                <div>
                  <p className={CLASE_LABEL_CAMPO}>Registro afectado</p>
                  <p className="mt-1 break-all text-[12px] text-foreground">{registroDetalle.entidadId ?? "—"}</p>
                </div>
              </div>

              <div>
                <p className={`${CLASE_LABEL_CAMPO} mb-2`}>Valor anterior / nuevo</p>
                <RenderDetalle detalle={registroDetalle.detalle} />
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setRegistroDetalle(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
