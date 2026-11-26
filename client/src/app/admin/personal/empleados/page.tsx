"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Pencil, Power, RefreshCw, UserPlus } from "lucide-react";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { mensajeErrorNomina } from "@/services/nomina.service";
import { empleadosService } from "@/services/personal.service";
import type { Empleado, EstadoEmpleado } from "@/types/personal";
import { dinero, fechaCorta, nombreEmpleado } from "@/components/nomina/nomina-utils";
import { CLASE_LABEL, CargandoNomina, ErrorNomina } from "@/components/nomina/NominaUI";
import { EstadoEmpleadoBadge, PersonalNav } from "@/components/personal/PersonalUI";
import { FormularioEmpleadoDialog } from "@/components/personal/FormularioEmpleadoDialog";
import { DetalleEmpleadoDialog } from "@/components/personal/DetalleEmpleadoDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const POR_PAGINA = 15;

/** Registro y gestión de empleados del edificio (HU8 funcionalidad 1). */
export default function PaginaEmpleados() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const bolPuedeCrear = puedeEjecutar(rol, "personal", "crear");
  const bolPuedeEditar = puedeEjecutar(rol, "personal", "editar");
  const cliente = useQueryClient();

  const [estado, setEstado] = useState<"TODOS" | EstadoEmpleado>("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [formulario, setFormulario] = useState<{ abierto: boolean; empleado: Empleado | null }>({ abierto: false, empleado: null });
  const [idDetalle, setIdDetalle] = useState<string | null>(null);
  const [confirmarEstado, setConfirmarEstado] = useState<Empleado | null>(null);
  const [aviso, setAviso] = useState("");
  const [mensajePermiso, setMensajePermiso] = useState("");

  const filtros = { ...(estado !== "TODOS" ? { estado } : {}), ...(q ? { q } : {}), pagina, porPagina: POR_PAGINA };
  const consulta = useQuery({ queryKey: ["hu8", "empleados", filtros], queryFn: () => empleadosService.listar(filtros) });

  const cambioEstado = useMutation({
    mutationFn: (e: Empleado) => empleadosService.cambiarEstado(e.id, e.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO"),
    onSuccess: (r) => {
      setConfirmarEstado(null);
      setAviso(r.empleado.estado === "INACTIVO"
        ? `${r.mensaje}. Ya no se incluirá en nuevas nóminas; su historial de pagos se conserva.`
        : `${r.mensaje}. Se incluirá en las próximas nóminas.`);
      void cliente.invalidateQueries({ queryKey: ["hu8"] });
    },
  });

  function conPermiso(accion: "crear" | "editar", fn: () => void) {
    const permiso = validarAccion(rol, "personal", accion);
    if (!permiso.permitido) {
      setMensajePermiso(permiso.mensaje);
      return;
    }
    setMensajePermiso("");
    setAviso("");
    fn();
  }

  const datos = consulta.data;
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 text-foreground sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="font-subtitle text-[16px]">Empleados del edificio</h2>
        <p className="text-[13px] leading-[1.45] text-muted-foreground">Registro, consulta y edición del personal, su cargo, sueldo base y estado.</p>
      </div>
      {bolPuedeCrear && <Button onClick={() => conPermiso("crear", () => setFormulario({ abierto: true, empleado: null }))}>
        <UserPlus className="h-4 w-4" /> Registrar empleado
      </Button>}
    </header>
    <PersonalNav />

    {mensajePermiso && <AlertaPermiso mensaje={mensajePermiso} />}
    {aviso && <p role="status" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-[13px] text-success"><CheckCircle2 className="h-4 w-4 shrink-0" />{aviso}</p>}

    <Card>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 space-y-1"><span className={CLASE_LABEL}>Estado</span>
          <Select value={estado} onValueChange={(v) => { setEstado(v as typeof estado); setPagina(1); }}>
            <SelectTrigger className="w-full" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="TODOS">Todos</SelectItem><SelectItem value="ACTIVO">Activos</SelectItem><SelectItem value="INACTIVO">Inactivos</SelectItem></SelectContent>
          </Select>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setQ(busqueda.trim()); setPagina(1); }} className="flex min-w-60 flex-1 gap-2">
          <Input aria-label="Buscar empleado" placeholder="Nombre, apellido, documento o cargo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        <Button variant="outline" onClick={() => void consulta.refetch()}><RefreshCw className="h-4 w-4" /> Actualizar</Button>
      </CardContent>
    </Card>

    {cambioEstado.isError && <ErrorNomina mensaje={mensajeErrorNomina(cambioEstado.error)} />}
    {confirmarEstado && <div className="flex flex-col gap-2 rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 p-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
      <span className="text-foreground">
        {confirmarEstado.estado === "ACTIVO"
          ? `¿Inactivar a ${nombreEmpleado(confirmarEstado)}? No se incluirá en nuevas nóminas ni podrá recibir anticipos; su historial se conserva.`
          : `¿Activar a ${nombreEmpleado(confirmarEstado)}? Volverá a incluirse en las nóminas que se generen.`}
      </span>
      <span className="flex gap-2">
        <Button size="sm" variant="outline" disabled={cambioEstado.isPending} onClick={() => setConfirmarEstado(null)}>Cancelar</Button>
        <Button size="sm" variant={confirmarEstado.estado === "ACTIVO" ? "destructive" : "default"} cargando={cambioEstado.isPending}
          onClick={() => conPermiso("editar", () => cambioEstado.mutate(confirmarEstado))}>
          {confirmarEstado.estado === "ACTIVO" ? "Sí, inactivar" : "Sí, activar"}
        </Button>
      </span>
    </div>}

    <Card>
      <CardHeader><CardTitle className="font-subtitle text-[14px]">Empleados registrados</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {consulta.isPending ? <CargandoNomina /> : consulta.isError ? <ErrorNomina mensaje={mensajeErrorNomina(consulta.error)} reintentar={() => void consulta.refetch()} /> : <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className={CLASE_LABEL}>Empleado</TableHead><TableHead className={CLASE_LABEL}>Cargo</TableHead>
                <TableHead className={CLASE_LABEL}>Ingreso</TableHead><TableHead className={CLASE_LABEL}>Teléfono</TableHead>
                <TableHead className={`${CLASE_LABEL} text-right`}>Sueldo base</TableHead><TableHead className={CLASE_LABEL}>Estado</TableHead>
                <TableHead className={`${CLASE_LABEL} text-right`}>Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {datos?.empleados.map((e) => <TableRow key={e.id}>
                  <TableCell><p className="font-medium">{nombreEmpleado(e)}</p><p className="font-caption text-[11px] text-muted-foreground">Doc. {e.documento}</p></TableCell>
                  <TableCell>{e.cargo}</TableCell>
                  <TableCell className="tabular-nums">{fechaCorta(e.fechaIngreso)}</TableCell>
                  <TableCell className="tabular-nums">{e.telefono}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{dinero(e.sueldoBase)}</TableCell>
                  <TableCell><EstadoEmpleadoBadge estado={e.estado} /></TableCell>
                  <TableCell><div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setIdDetalle(e.id)}><Eye className="h-4 w-4" /> Detalle</Button>
                    {bolPuedeEditar && <>
                      <Button size="sm" variant="ghost" title="Editar" onClick={() => conPermiso("editar", () => setFormulario({ abierto: true, empleado: e }))}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title={e.estado === "ACTIVO" ? "Inactivar" : "Activar"} className={e.estado === "ACTIVO" ? "text-destructive" : "text-success"}
                        onClick={() => { setAviso(""); setConfirmarEstado(e); }}><Power className="h-4 w-4" /></Button>
                    </>}
                  </div></TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </div>
          {!datos?.empleados.length && <p className="py-10 text-center text-[13px] text-muted-foreground">
            {q || estado !== "TODOS" ? "No hay empleados que coincidan con los filtros." : "Todavía no hay empleados registrados."}
          </p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="font-caption text-[11px] text-muted-foreground">Página {datos?.paginacion.pagina ?? 1} de {Math.max(1, datos?.paginacion.totalPaginas ?? 1)} · {datos?.paginacion.total ?? 0} empleados</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={pagina >= (datos?.paginacion.totalPaginas ?? 1)} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        </>}
      </CardContent>
    </Card>

    {formulario.abierto && <FormularioEmpleadoDialog
      key={formulario.empleado?.id ?? "nuevo"}
      abierto={formulario.abierto}
      empleado={formulario.empleado}
      onCerrar={() => setFormulario({ abierto: false, empleado: null })}
      onGuardado={(mensaje) => { setFormulario({ abierto: false, empleado: null }); setAviso(mensaje); }}
    />}
    <DetalleEmpleadoDialog empleadoId={idDetalle} onCerrar={() => setIdDetalle(null)} bolPuedeRegistrarAnticipo={bolPuedeCrear} />
  </main>;
}
