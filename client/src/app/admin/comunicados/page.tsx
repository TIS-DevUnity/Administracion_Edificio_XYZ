"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FilePenLine, Megaphone, Plus, RefreshCcw, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FormularioComunicadoDialog } from "@/components/comunicados/FormularioComunicadoDialog";
import { HistorialComunicados } from "@/components/comunicados/HistorialComunicados";
import { DetalleComunicadoDialog } from "@/components/comunicados/DetalleComunicadoDialog";
import {
  Comunicado, DatosComunicado, crearBorradorComunicado, editarBorradorComunicado,
  eliminarBorradorComunicado, listarComunicados, obtenerComunicado, obtenerErrorComunicado,
} from "@/lib/comunicados";
import { normalizarRol, puedeEjecutar } from "@/lib/permissions";
import { useSesionActual } from "@/lib/session";

export default function ComunicadosPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const puedeGestionar = puedeEjecutar(rol, "comunicados", "crear");
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [notificacion, setNotificacion] = useState("");
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [borradorEditar, setBorradorEditar] = useState<Comunicado | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Comunicado | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");
  const [borradorEliminar, setBorradorEliminar] = useState<Comunicado | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      setComunicados(await listarComunicados());
    } catch (error) {
      setErrorCarga(obtenerErrorComunicado(error, "No fue posible consultar los comunicados."));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    // La carga inicial es asíncrona; evita modificar estado de manera síncrona desde un effect.
    listarComunicados()
      .then((registros) => { if (activo) setComunicados(registros); })
      .catch((error: unknown) => {
        if (activo) setErrorCarga(obtenerErrorComunicado(error, "No fue posible consultar los comunicados."));
      })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  function abrirNuevo() {
    if (!puedeGestionar) return;
    setBorradorEditar(null);
    setFormularioAbierto(true);
  }

  function abrirEdicion(comunicado: Comunicado) {
    if (!puedeGestionar || comunicado.estado !== "BORRADOR") return;
    setBorradorEditar(comunicado);
    setFormularioAbierto(true);
  }

  async function guardar(datos: DatosComunicado) {
    if (!puedeGestionar) throw new Error("Permiso insuficiente para modificar comunicados.");
    if (borradorEditar) await editarBorradorComunicado(borradorEditar.id, datos);
    else await crearBorradorComunicado(datos);
    setFormularioAbierto(false);
    setBorradorEditar(null);
    setNotificacion(borradorEditar ? "Borrador actualizado correctamente." : "Borrador guardado correctamente. No se envió ningún mensaje.");
    await cargar();
  }

  async function abrirDetalle(id: string) {
    setDetalleId(id);
    setDetalle(null);
    setErrorDetalle("");
    setCargandoDetalle(true);
    try {
      const respuesta = await obtenerComunicado(id);
      setDetalle(respuesta);
    } catch (error) {
      setErrorDetalle(obtenerErrorComunicado(error, "No se pudo consultar el detalle del comunicado."));
    } finally {
      setCargandoDetalle(false);
    }
  }

  function pedirEliminacion(comunicado: Comunicado) {
    if (!puedeGestionar || comunicado.estado !== "BORRADOR") return;
    setErrorEliminar("");
    setBorradorEliminar(comunicado);
  }

  async function confirmarEliminacion() {
    if (!borradorEliminar || !puedeGestionar || eliminando) return;
    setEliminando(true);
    setErrorEliminar("");
    try {
      await eliminarBorradorComunicado(borradorEliminar.id);
      setBorradorEliminar(null);
      setNotificacion("Borrador eliminado correctamente.");
      await cargar();
    } catch (error) {
      setErrorEliminar(obtenerErrorComunicado(error, "No fue posible eliminar el borrador."));
    } finally {
      setEliminando(false);
    }
  }

  const borradores = comunicados.filter((comunicado) => comunicado.estado === "BORRADOR").length;
  const enviados = comunicados.filter((comunicado) => comunicado.estado === "ENVIADO").length;
  const fallidos = comunicados.filter((comunicado) => comunicado.estado === "FALLIDO").length;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2"><Megaphone className="size-6 text-primary" /><h1 className="text-2xl font-bold tracking-tight">Comunicados</h1><Badge variant="outline"></Badge></div>
          <p className="text-sm text-muted-foreground">Redacta avisos y consulta el historial de comunicaciones del edificio.</p>
        </div>
        {puedeGestionar && <Button onClick={abrirNuevo}><Plus /> Nuevo comunicado</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { titulo: "Total", numero: comunicados.length, icono: Megaphone },
          { titulo: "Borradores", numero: borradores, icono: FilePenLine },
          { titulo: "Enviados", numero: enviados, icono: Send },
          { titulo: "Fallidos", numero: fallidos, icono: AlertTriangle },
        ].map(({ titulo, numero, icono: Icono }) => (
          <Card key={titulo}>
            <CardContent className="flex items-center justify-between py-4">
              <div><p className="text-xs text-muted-foreground">{titulo}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{numero}</p></div>
              <Icono className="size-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      {notificacion && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><span>{notificacion}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotificacion("")} className="shrink-0 font-semibold">Cerrar</button></div>}
      {!puedeGestionar && <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Tu perfil tiene acceso de solo lectura al historial de comunicados emitidos.</p>}
      {puedeGestionar && <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">El envío por correo y WhatsApp aún no está disponible en el backend. Puedes redactar, guardar y gestionar borradores; ningún registro creado desde esta pantalla se enviará automáticamente.</p>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-lg">Historial de comunicados</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}><RefreshCcw className={cargando ? "animate-spin" : ""} /> Actualizar</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorCarga && <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span>{errorCarga}</span><Button variant="outline" size="sm" className="self-start" onClick={() => void cargar()}>Reintentar</Button></div>}
          {cargando ? <div className="py-16 text-center text-sm text-muted-foreground">Cargando historial de comunicados...</div> : !errorCarga && (
            <HistorialComunicados comunicados={comunicados} puedeGestionar={puedeGestionar} onVer={(id) => void abrirDetalle(id)} onEditar={abrirEdicion} onEliminar={pedirEliminacion} />
          )}
        </CardContent>
      </Card>

      {formularioAbierto && <FormularioComunicadoDialog key={borradorEditar?.id ?? "nuevo"} abierto={formularioAbierto} comunicado={borradorEditar} onCerrar={() => setFormularioAbierto(false)} onGuardar={guardar} />}
      <DetalleComunicadoDialog abierto={detalleId !== null} cargando={cargandoDetalle} comunicado={detalle} error={errorDetalle} onCerrar={() => setDetalleId(null)} />
      <Dialog open={borradorEliminar !== null} onOpenChange={(abierto) => { if (!abierto && !eliminando) setBorradorEliminar(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar borrador</DialogTitle>
            <DialogDescription>¿Deseas eliminar el comunicado «{borradorEliminar?.titulo}»? Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          {errorEliminar && <p role="alert" className="text-sm text-destructive">{errorEliminar}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={eliminando} onClick={() => setBorradorEliminar(null)}>Cancelar</Button>
            <Button variant="destructive" cargando={eliminando} onClick={() => void confirmarEliminacion()}><Trash2 /> Eliminar borrador</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
