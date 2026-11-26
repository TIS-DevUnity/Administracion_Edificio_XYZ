"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Download, Printer, RefreshCw } from "lucide-react";
import { nominaService, mensajeErrorNomina } from "@/services/nomina.service";
import { descargarBlob, dinero, fechaCorta, imprimirBlob, nombreEmpleado, periodoActualBolivia } from "@/components/nomina/nomina-utils";
import { DetalleNominaDialog } from "@/components/nomina/DetalleNominaDialog";
import { NominaNav } from "@/components/nomina/NominaNav";
import { CLASE_LABEL, CLASE_TITULO_TARJETA, CargandoNomina, ErrorNomina, EstadoBadge, IndicadorNomina } from "@/components/nomina/NominaUI";
import { ETIQUETA_METODO } from "@/components/personal/PersonalUI";
import { abrirCalendario } from "@/components/personal/PersonalUI";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstadoNomina } from "@/types/nomina";

export default function PaginaPagosNomina() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState(periodoActualBolivia);
  const [estado, setEstado] = useState("TODAS");
  const [buscar, setBuscar] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [enPdf, setEnPdf] = useState<string | null>(null);
  const [errorPdf, setErrorPdf] = useState("");
  const rangoInvalido = !!desde && !!hasta && desde > hasta;
  const filtros = {
    ...(desde ? { periodoDesde: desde } : {}),
    ...(hasta ? { periodoHasta: hasta } : {}),
    ...(estado !== "TODAS" ? { estado: estado as EstadoNomina } : {}),
    ...(q ? { q } : {}),
    pagina,
    porPagina: 15,
  };
  const consulta = useQuery({
    queryKey: ["hu8", "historial", filtros],
    queryFn: () => nominaService.listar(filtros),
    enabled: !rangoInvalido,
  });
  async function manejarPdf(id: string, periodo: string, documento: string, imprimir: boolean) {
    if (enPdf) return;
    setEnPdf(id); setErrorPdf("");
    try {
      if (imprimir) await imprimirBlob(nominaService.boletaPdf(id));
      else descargarBlob(await nominaService.boletaPdf(id), `boleta-nomina-${periodo}-${documento}.pdf`);
    } catch (err) { setErrorPdf(mensajeErrorNomina(err)); }
    finally { setEnPdf(null); }
  }
  const datos = consulta.data;
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 text-foreground sm:px-6">
    <header className="space-y-1"><h2 className="font-subtitle text-[16px]">Control de pagos e historial salarial</h2>
      <p className="font-body text-[13px] text-muted-foreground">HU8 · Consulta de nóminas pendientes y pagadas, métodos de pago y boletas anteriores.</p>
    </header>
    <NominaNav />
    <Card><CardContent className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className={CLASE_LABEL}>Desde</span><Input type="month" className="cursor-pointer" onClick={abrirCalendario} value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} /></label>
        <label className="space-y-1"><span className={CLASE_LABEL}>Hasta</span><Input type="month" className="cursor-pointer" onClick={abrirCalendario} value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(1); }} /></label>
        <div className="min-w-36 space-y-1"><span className={CLASE_LABEL}>Estado</span>
          <Select value={estado} onValueChange={(v) => { setEstado(v); setPagina(1); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="TODAS">Todos</SelectItem><SelectItem value="PENDIENTE">Pendiente</SelectItem><SelectItem value="PAGADA">Pagada</SelectItem></SelectContent>
          </Select>
        </div>
        <form className="flex min-w-50 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQ(buscar.trim()); setPagina(1); }}>
          <Input aria-label="Buscar empleado" placeholder="Empleado o documento" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        <Button variant="outline" onClick={() => void consulta.refetch()} disabled={rangoInvalido}><RefreshCw className="h-4 w-4" />Actualizar</Button>
      </div>
      {rangoInvalido && <p className="text-[12px] text-destructive">El período inicial no puede ser posterior al final.</p>}
    </CardContent></Card>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <IndicadorNomina etiqueta="Registros" valor={String(datos?.resumen.cantidad ?? 0)} />
      <IndicadorNomina etiqueta="Pagado" valor={dinero(datos?.resumen.pagadas.total)} tono="positivo" />
      <IndicadorNomina etiqueta="Pendiente" valor={dinero(datos?.resumen.pendientes.total)} tono="negativo" />
    </div>
    {errorPdf && <ErrorNomina mensaje={errorPdf} />}
    <Card>
      <CardHeader><CardTitle className={CLASE_TITULO_TARJETA}>Historial de nóminas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rangoInvalido ? <p className="py-8 text-center text-muted-foreground">Corrige el intervalo de períodos.</p> : consulta.isPending ? <CargandoNomina /> : consulta.isError ? <ErrorNomina mensaje={mensajeErrorNomina(consulta.error)} reintentar={() => void consulta.refetch()} /> : <>
          <Table><TableHeader><TableRow>
            <TableHead className={CLASE_LABEL}>Período</TableHead><TableHead className={CLASE_LABEL}>Empleado</TableHead><TableHead className={CLASE_LABEL}>Sueldo neto</TableHead>
            <TableHead className={CLASE_LABEL}>Estado</TableHead><TableHead className={CLASE_LABEL}>Fecha de pago</TableHead><TableHead className={CLASE_LABEL}>Método</TableHead><TableHead className={CLASE_LABEL}>Acciones</TableHead>
          </TableRow></TableHeader><TableBody>
            {datos?.nominas.map((n) => <TableRow key={n.id}>
              <TableCell>{n.periodo}</TableCell><TableCell><p className="font-medium">{nombreEmpleado(n.empleado)}</p><p className="font-caption text-[11px] text-muted-foreground">{n.empleado.cargo}</p></TableCell>
              <TableCell className="font-medium">{dinero(n.sueldoNeto)}</TableCell><TableCell><EstadoBadge estado={n.estado} /></TableCell>
              <TableCell>{fechaCorta(n.fechaPago)}</TableCell><TableCell>{n.metodoPago ? ETIQUETA_METODO[n.metodoPago] : "—"}</TableCell>
              <TableCell><div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => setSeleccion(n.id)} title="Ver nómina"><Eye className="h-4 w-4" /></Button>
                {n.estado === "PAGADA" && <><Button size="sm" variant="ghost" title="Descargar boleta" disabled={!!enPdf} onClick={() => void manejarPdf(n.id, n.periodo, n.empleado.documento, false)}><Download className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" title="Imprimir boleta" disabled={!!enPdf} onClick={() => void manejarPdf(n.id, n.periodo, n.empleado.documento, true)}><Printer className="h-4 w-4" /></Button></>}
              </div></TableCell>
            </TableRow>)}
          </TableBody></Table>
          {!datos?.nominas.length && <p className="py-10 text-center text-[13px] text-muted-foreground">No hay registros de nómina para estos filtros.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="font-caption text-[11px] text-muted-foreground">Página {pagina} / {Math.max(1, datos?.paginacion.totalPaginas ?? 1)} · {datos?.paginacion.total ?? 0} registros</p>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={pagina >= (datos?.paginacion.totalPaginas ?? 1)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button></div>
          </div>
        </>}
      </CardContent>
    </Card>
    <DetalleNominaDialog nominaId={seleccion} onCerrar={() => setSeleccion(null)} />
  </main>;
}
