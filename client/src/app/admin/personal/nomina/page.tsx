"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Plus, Eye, CheckCircle2 } from "lucide-react";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";
import type { EstadoNomina } from "@/types/nomina";
import { nominaService, mensajeErrorNomina } from "@/services/nomina.service";
import { dinero, nombreEmpleado, periodoActualBolivia, tituloPeriodo } from "@/components/nomina/nomina-utils";
import { NominaNav } from "@/components/nomina/NominaNav";
import { DetalleNominaDialog } from "@/components/nomina/DetalleNominaDialog";
import { CargandoNomina, CLASE_LABEL, CLASE_TITULO_TARJETA, EstadoBadge, ErrorNomina, IndicadorNomina } from "@/components/nomina/NominaUI";
import { Badge } from "@/components/ui/badge";
import { abrirCalendario } from "@/components/personal/PersonalUI";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function PaginaNominaMensual() {
  const [periodo, setPeriodo] = useState(periodoActualBolivia);
  const [estado, setEstado] = useState("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [idDetalle, setIdDetalle] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const { usuario } = useSesionActual();
  const administrador = usuario ? normalizarRol(usuario.rol) === "ADMINISTRADOR" : false;
  const cliente = useQueryClient();
  const filtros = {
    periodo,
    ...(estado !== "TODAS" ? { estado: estado as EstadoNomina } : {}),
    ...(q ? { q } : {}),
    pagina,
    porPagina: 10,
  };
  const consulta = useQuery({
    queryKey: ["hu8", "nominas", filtros],
    queryFn: () => nominaService.listar(filtros),
    enabled: Boolean(periodo),
  });
  const generacion = useMutation({
    mutationFn: () => nominaService.generar(periodo),
    onSuccess: (data) => {
      setPagina(1);
      setAviso(`${data.mensaje}. ${data.creadas} nómina(s) nuevas; ${data.omitidas} ya existente(s).`);
      void cliente.invalidateQueries({ queryKey: ["hu8"] });
    },
  });
  const datos = consulta.data;
  const futuro = periodo > periodoActualBolivia();
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 text-foreground sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="font-subtitle text-[16px]">Nómina mensual</h2>
        <p className="font-body text-[13px] text-muted-foreground">HU8 · Generación, validación y consulta de sueldos según el período.</p>
      </div>
      <Badge variant="outline" className="font-caption text-[11px]">{tituloPeriodo(periodo)}</Badge>
    </header>
    <NominaNav />
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-42 space-y-1"><span className={CLASE_LABEL}>Período</span><Input type="month" className="cursor-pointer" onClick={abrirCalendario} value={periodo} onChange={(e) => { setPeriodo(e.target.value); setPagina(1); setAviso(""); }} /></label>
          <div className="min-w-40 space-y-1"><span className={CLASE_LABEL}>Estado</span>
            <Select value={estado} onValueChange={(v) => { setEstado(v); setPagina(1); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="TODAS">Todas</SelectItem><SelectItem value="PENDIENTE">Pendientes</SelectItem><SelectItem value="PAGADA">Pagadas</SelectItem></SelectContent>
            </Select>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setQ(busqueda.trim()); setPagina(1); }} className="flex min-w-60 flex-1 gap-2">
            <Input aria-label="Buscar empleado" placeholder="Nombre, apellido o documento" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <Button type="submit" variant="outline">Buscar</Button>
          </form>
          <Button variant="outline" onClick={() => void consulta.refetch()}><RefreshCw className="h-4 w-4" /> Actualizar</Button>
          {administrador && <Button onClick={() => { setAviso(""); generacion.mutate(); }} cargando={generacion.isPending} disabled={!periodo || futuro}>
            <Plus className="h-4 w-4" /> Generar nóminas
          </Button>}
        </div>
        <p className="font-caption text-[11px] text-muted-foreground">Genera una nómina pendiente por cada empleado activo aún sin nómina en este mes. Las nóminas existentes se conservan.</p>
        {futuro && <p className="text-[12px] text-destructive">No es posible generar nóminas de un mes futuro.</p>}
      </CardContent>
    </Card>
    {aviso && <p role="status" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-[13px] text-success"><CheckCircle2 className="h-4 w-4" />{aviso}</p>}
    {generacion.isError && <ErrorNomina mensaje={mensajeErrorNomina(generacion.error)} />}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <IndicadorNomina etiqueta="Total de nóminas" valor={String(datos?.resumen.cantidad ?? 0)} detalle="Empleados del filtro actual" />
      <IndicadorNomina etiqueta="Pendiente por pagar" valor={dinero(datos?.resumen.pendientes.total)} tono="negativo" detalle={`${datos?.resumen.pendientes.cantidad ?? 0} nómina(s) pendientes`} />
      <IndicadorNomina etiqueta="Total pagado" valor={dinero(datos?.resumen.pagadas.total)} tono="positivo" detalle={`${datos?.resumen.pagadas.cantidad ?? 0} nómina(s) pagadas`} />
    </div>
    <Card>
      <CardHeader><CardTitle className={CLASE_TITULO_TARJETA}>Nóminas del período</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {consulta.isPending ? <CargandoNomina /> : consulta.isError ? <ErrorNomina mensaje={mensajeErrorNomina(consulta.error)} reintentar={() => void consulta.refetch()} /> : <>
          <Table>
            <TableHeader><TableRow>
              <TableHead className={CLASE_LABEL}>Empleado / cargo</TableHead><TableHead className={CLASE_LABEL}>Sueldo base</TableHead><TableHead className={CLASE_LABEL}>Bonos + extra</TableHead>
              <TableHead className={CLASE_LABEL}>Descuentos + anticipos</TableHead><TableHead className={CLASE_LABEL}>Sueldo neto</TableHead><TableHead className={CLASE_LABEL}>Estado</TableHead><TableHead className={CLASE_LABEL}>Acciones</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {datos?.nominas.map((n) => <TableRow key={n.id}>
                <TableCell><p className="font-medium">{nombreEmpleado(n.empleado)}</p><p className="font-caption text-[11px] text-muted-foreground">{n.empleado.cargo} · {n.empleado.documento}</p></TableCell>
                <TableCell>{dinero(n.sueldoBase)}</TableCell>
                <TableCell className="text-success">{dinero(Number(n.totalBonos) + Number(n.totalHorasExtra))}</TableCell>
                <TableCell className="text-destructive">{dinero(Number(n.totalDescuentos) + Number(n.totalAnticipos))}</TableCell>
                <TableCell className="font-medium">{dinero(n.sueldoNeto)}</TableCell><TableCell><EstadoBadge estado={n.estado} /></TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => setIdDetalle(n.id)}><Eye className="h-4 w-4" /> Detalle</Button></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
          {!datos?.nominas.length && <p className="py-10 text-center text-[13px] text-muted-foreground">No hay nóminas para esta selección. {administrador ? "Puedes generar el período si existen empleados activos." : ""}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="font-caption text-[11px] text-muted-foreground">Página {datos?.paginacion.pagina ?? 1} de {Math.max(1, datos?.paginacion.totalPaginas ?? 1)} · {datos?.paginacion.total ?? 0} resultados</p>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={pagina >= (datos?.paginacion.totalPaginas ?? 1)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button></div>
          </div>
        </>}
      </CardContent>
    </Card>
    <DetalleNominaDialog nominaId={idDetalle} onCerrar={() => setIdDetalle(null)} />
  </main>;
}
