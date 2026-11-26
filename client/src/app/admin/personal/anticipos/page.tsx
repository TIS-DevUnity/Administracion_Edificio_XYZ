"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, HandCoins, Printer, RefreshCw } from "lucide-react";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { mensajeErrorNomina } from "@/services/nomina.service";
import { anticiposService, empleadosService } from "@/services/personal.service";
import type { EstadoAnticipo } from "@/types/personal";
import { descargarBlob, dinero, fechaCorta, imprimirBlob, nombreEmpleado } from "@/components/nomina/nomina-utils";
import { CLASE_LABEL, CargandoNomina, ErrorNomina, IndicadorNomina } from "@/components/nomina/NominaUI";
import { abrirCalendario, EstadoAnticipoBadge, ETIQUETA_METODO, PersonalNav } from "@/components/personal/PersonalUI";
import { RegistrarAnticipoDialog } from "@/components/personal/RegistrarAnticipoDialog";
import { DetalleAnticipoDialog } from "@/components/personal/DetalleAnticipoDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const POR_PAGINA = 15;

/** Anticipos salariales: registro, control de pendientes, historial y comprobantes (HU8 funcionalidad 4 y 6.2). */
function ContenidoAnticipos() {
  const searchParams = useSearchParams();
  const empleadoUrl = searchParams.get("empleadoId") ?? "";
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeRegistrar = puedeEjecutar(rol, "personal", "crear");

  const [empleadoId, setEmpleadoId] = useState(empleadoUrl || "TODOS");
  const [estado, setEstado] = useState<"TODOS" | EstadoAnticipo>("TODOS");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [registrar, setRegistrar] = useState(false);
  // Al llegar desde "Registrar anticipo" en la ficha del empleado se abre el registro con él elegido.
  // La sesión se lee después del primer render, por eso no se decide en el estado inicial.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (empleadoUrl && bolPuedeRegistrar) setRegistrar(true);
  }, [empleadoUrl, bolPuedeRegistrar]);
  const [idDetalle, setIdDetalle] = useState<string | null>(null);
  const [mensajePermiso, setMensajePermiso] = useState("");
  const [enPdf, setEnPdf] = useState<string | null>(null);
  const [errorPdf, setErrorPdf] = useState("");
  const rangoInvalido = !!desde && !!hasta && desde > hasta;

  const filtros = {
    ...(empleadoId !== "TODOS" ? { empleadoId } : {}),
    ...(estado !== "TODOS" ? { estado } : {}),
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
    pagina,
    porPagina: POR_PAGINA,
  };
  const consulta = useQuery({ queryKey: ["hu8", "anticipos", filtros], queryFn: () => anticiposService.listar(filtros), enabled: !rangoInvalido });
  const pendientes = useQuery({ queryKey: ["hu8", "anticipos-pendientes"], queryFn: anticiposService.pendientes });
  const empleados = useQuery({ queryKey: ["hu8", "empleados-todos"], queryFn: () => empleadosService.listar({ porPagina: 200 }) });

  function abrirRegistro() {
    const permiso = validarAccion(rol, "personal", "crear");
    if (!permiso.permitido) {
      setMensajePermiso(permiso.mensaje);
      return;
    }
    setMensajePermiso("");
    setRegistrar(true);
  }

  async function comprobante(id: string, nombre: string, imprimir: boolean) {
    if (enPdf) return;
    setEnPdf(id);
    setErrorPdf("");
    try {
      if (imprimir) await imprimirBlob(anticiposService.comprobantePdf(id, true));
      else descargarBlob(await anticiposService.comprobantePdf(id), nombre);
    } catch (err) {
      setErrorPdf(mensajeErrorNomina(err));
    } finally {
      setEnPdf(null);
    }
  }

  const datos = consulta.data;
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 text-foreground sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="font-subtitle text-[16px]">Anticipos salariales</h2>
        <p className="text-[13px] leading-[1.45] text-muted-foreground">Dinero entregado por adelantado. Se descuenta automáticamente del sueldo neto en las nóminas siguientes.</p>
      </div>
      {bolPuedeRegistrar && <Button onClick={abrirRegistro}><HandCoins className="h-4 w-4" /> Registrar anticipo</Button>}
    </header>
    <PersonalNav />
    {mensajePermiso && <AlertaPermiso mensaje={mensajePermiso} />}

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <IndicadorNomina etiqueta="Total entregado" valor={dinero(datos?.resumen.totalOtorgado)} detalle={`${datos?.resumen.cantidad ?? 0} anticipo(s) del filtro`} />
      <IndicadorNomina etiqueta="Ya descontado" valor={dinero(datos?.resumen.totalDescontado)} tono="positivo" detalle="Aplicado en nóminas" />
      <IndicadorNomina etiqueta="Pendiente de descuento" valor={dinero(datos?.resumen.totalPendiente)} tono="negativo" detalle="Se descontará en próximas nóminas" />
    </div>

    <Card>
      <CardHeader><CardTitle className="font-subtitle text-[14px]">Pendientes de descuento por empleado</CardTitle></CardHeader>
      <CardContent>
        {pendientes.isPending ? <CargandoNomina /> : pendientes.isError ? <ErrorNomina mensaje={mensajeErrorNomina(pendientes.error)} reintentar={() => void pendientes.refetch()} />
          : !pendientes.data?.pendientes.length ? <p className="text-[13px] text-muted-foreground">No hay anticipos pendientes de descuento.</p> : <div className="space-y-1">
            {pendientes.data.pendientes.map((p) => <button key={p.empleado.id} type="button"
              onClick={() => { setEmpleadoId(p.empleado.id); setEstado("TODOS"); setPagina(1); }}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition-colors hover:bg-muted/60">
              <span className="text-foreground">{nombreEmpleado(p.empleado)} <span className="text-muted-foreground">· {p.cantidad} anticipo(s)</span></span>
              <span className="font-medium tabular-nums text-destructive">{dinero(p.totalPendiente)}</span>
            </button>)}
            <div className="flex justify-between border-t border-border px-2 pt-2 text-[13px]">
              <span className="font-medium text-foreground">Total pendiente ({pendientes.data.cantidadEmpleados} empleado(s))</span>
              <span className="font-medium tabular-nums text-destructive">{dinero(pendientes.data.totalGeneral)}</span>
            </div>
          </div>}
      </CardContent>
    </Card>

    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1"><span className={CLASE_LABEL}>Empleado</span>
            <Select value={empleadoId} onValueChange={(v) => { setEmpleadoId(v); setPagina(1); }}>
              <SelectTrigger className="w-full" aria-label="Filtrar por empleado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los empleados</SelectItem>
                {(empleados.data?.empleados ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{nombreEmpleado(e)}{e.estado === "INACTIVO" ? " (inactivo)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-44 space-y-1"><span className={CLASE_LABEL}>Estado</span>
            <Select value={estado} onValueChange={(v) => { setEstado(v as typeof estado); setPagina(1); }}>
              <SelectTrigger className="w-full" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="PENDIENTE">Pendiente de descuento</SelectItem>
                <SelectItem value="PARCIAL">Descontado en parte</SelectItem>
                <SelectItem value="DESCONTADO">Descontado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1"><span className={CLASE_LABEL}>Desde</span>
            <Input type="date" className="cursor-pointer" value={desde} onClick={abrirCalendario} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} />
          </label>
          <label className="space-y-1"><span className={CLASE_LABEL}>Hasta</span>
            <Input type="date" className="cursor-pointer" value={hasta} onClick={abrirCalendario} onChange={(e) => { setHasta(e.target.value); setPagina(1); }} />
          </label>
          <Button variant="outline" onClick={() => void consulta.refetch()} disabled={rangoInvalido}><RefreshCw className="h-4 w-4" /> Actualizar</Button>
        </div>
        {rangoInvalido && <p className="font-caption text-[12px] text-destructive">La fecha inicial no puede ser posterior a la final.</p>}
      </CardContent>
    </Card>

    {errorPdf && <ErrorNomina mensaje={errorPdf} />}

    <Card>
      <CardHeader><CardTitle className="font-subtitle text-[14px]">Historial de anticipos</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rangoInvalido ? <p className="py-8 text-center text-[13px] text-muted-foreground">Corrige el rango de fechas.</p>
          : consulta.isPending ? <CargandoNomina /> : consulta.isError ? <ErrorNomina mensaje={mensajeErrorNomina(consulta.error)} reintentar={() => void consulta.refetch()} /> : <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className={CLASE_LABEL}>Fecha</TableHead><TableHead className={CLASE_LABEL}>Empleado</TableHead>
                  <TableHead className={CLASE_LABEL}>Concepto</TableHead><TableHead className={CLASE_LABEL}>Método</TableHead>
                  <TableHead className={`${CLASE_LABEL} text-right`}>Monto</TableHead><TableHead className={`${CLASE_LABEL} text-right`}>Descontado</TableHead>
                  <TableHead className={`${CLASE_LABEL} text-right`}>Pendiente</TableHead><TableHead className={CLASE_LABEL}>Estado</TableHead>
                  <TableHead className={`${CLASE_LABEL} text-right`}>Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {datos?.anticipos.map((a) => <TableRow key={a.id}>
                    <TableCell className="tabular-nums">{fechaCorta(a.fecha)}</TableCell>
                    <TableCell><p className="font-medium">{a.empleado ? nombreEmpleado(a.empleado) : "—"}</p><p className="font-caption text-[11px] text-muted-foreground">{a.empleado?.cargo}</p></TableCell>
                    <TableCell className="max-w-56 break-words">{a.descripcion}</TableCell>
                    <TableCell>{ETIQUETA_METODO[a.metodoPago]}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{dinero(a.monto)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{dinero(a.montoDescontado)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(a.saldoPendiente) > 0 ? "text-destructive" : "text-muted-foreground"}`}>{dinero(a.saldoPendiente)}</TableCell>
                    <TableCell><EstadoAnticipoBadge estado={a.estado} /></TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setIdDetalle(a.id)}><Eye className="h-4 w-4" /> Detalle</Button>
                      <Button size="sm" variant="ghost" title="Descargar comprobante" disabled={!!enPdf}
                        onClick={() => void comprobante(a.id, `comprobante-anticipo-${a.fecha}-${a.empleado?.documento ?? a.id}.pdf`, false)}><Download className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="Imprimir comprobante" disabled={!!enPdf}
                        onClick={() => void comprobante(a.id, "", true)}><Printer className="h-4 w-4" /></Button>
                    </div></TableCell>
                  </TableRow>)}
                </TableBody>
              </Table>
            </div>
            {!datos?.anticipos.length && <p className="py-10 text-center text-[13px] text-muted-foreground">No hay anticipos para estos filtros.</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <p className="font-caption text-[11px] text-muted-foreground">Página {datos?.paginacion.pagina ?? 1} de {Math.max(1, datos?.paginacion.totalPaginas ?? 1)} · {datos?.paginacion.total ?? 0} anticipos</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={pagina >= (datos?.paginacion.totalPaginas ?? 1)} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
              </div>
            </div>
          </>}
      </CardContent>
    </Card>

    {registrar && <RegistrarAnticipoDialog
      abierto={registrar}
      empleadoIdInicial={empleadoUrl || undefined}
      onCerrar={() => setRegistrar(false)}
      onRegistrado={() => setPagina(1)}
    />}
    <DetalleAnticipoDialog anticipoId={idDetalle} onCerrar={() => setIdDetalle(null)} />
  </main>;
}

export default function PaginaAnticipos() {
  return <Suspense fallback={<div className="px-6 py-6 text-[13px] text-muted-foreground">Cargando anticipos...</div>}>
    <ContenidoAnticipos />
  </Suspense>;
}
