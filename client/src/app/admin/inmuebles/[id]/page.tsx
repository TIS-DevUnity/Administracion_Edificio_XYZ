"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Inmueble,
  Ocupante,
  actualizarInmueble,
  darDeBajaOcupante,
  esOcupanteActivo,
  etiquetaRol,
  formatearFecha,
  listarOcupantes,
  obtenerInmueble,
  obtenerMensajeError,
} from "@/lib/inmuebles";

type Tab = "datos" | "historial";

function fechaHoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FichaInmueblePage() {
  const params = useParams<{ id: string }>();
  const strId = Array.isArray(params.id) ? params.id[0] : params.id;

  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");

  const [inmueble, setInmueble] = useState<Inmueble | null>(null);
  const [historial, setHistorial] = useState<Ocupante[]>([]);
  const [bolLoading, setBolLoading] = useState(true);
  const [strErrorCarga, setStrErrorCarga] = useState("");
  const [strTab, setStrTab] = useState<Tab>("datos");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");

  const [ocupanteParaBaja, setOcupanteParaBaja] = useState<Ocupante | null>(null);
  const [strFechaFin, setStrFechaFin] = useState("");
  const [strErrorBaja, setStrErrorBaja] = useState("");
  const [bolGuardandoBaja, setBolGuardandoBaja] = useState(false);

  const bolPuedeCambiarEstado = puedeEjecutar(rol, "inmuebles", "eliminar");
  const bolPuedeDarBaja = puedeEjecutar(rol, "residentes", "editar");

  async function cargarInmueble() {
    if (!strId) return;
    try {
      setBolLoading(true);
      setStrErrorCarga("");
      const [objInmueble, arrHistorial] = await Promise.all([obtenerInmueble(strId), listarOcupantes(strId)]);
      setInmueble(objInmueble);
      setHistorial(arrHistorial);
    } catch (error: unknown) {
      console.error("Error al cargar el inmueble:", error);
      setStrErrorCarga("Este inmueble no existe o no se pudo cargar.");
    } finally {
      setBolLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarInmueble();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strId]);

  async function handleAlternarEstado() {
    if (!inmueble) return;
    const objValidacion = validarAccion(rol, "inmuebles", "eliminar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");

    try {
      await actualizarInmueble(inmueble.id, { activo: !inmueble.activo });
      await cargarInmueble();
    } catch (error: unknown) {
      setStrMensajePermiso(obtenerMensajeError(error, "Ocurrió un error al cambiar el estado del inmueble."));
    }
  }

  function abrirDialogoBaja(registro: Ocupante) {
    setOcupanteParaBaja(registro);
    setStrFechaFin(fechaHoyISO());
    setStrErrorBaja("");
  }

  function cerrarDialogoBaja() {
    setOcupanteParaBaja(null);
    setStrErrorBaja("");
  }

  async function handleConfirmarBaja() {
    if (!inmueble || !ocupanteParaBaja) return;

    setBolGuardandoBaja(true);
    setStrErrorBaja("");

    try {
      await darDeBajaOcupante(inmueble.id, ocupanteParaBaja.id, { fechaFin: strFechaFin || undefined });
      setOcupanteParaBaja(null);
      await cargarInmueble();
    } catch (error: unknown) {
      setStrErrorBaja(obtenerMensajeError(error, "Ocurrió un error al dar de baja al ocupante."));
    } finally {
      setBolGuardandoBaja(false);
    }
  }

  if (bolLoading) {
    return (
      <div className="px-6 py-6">
        <p className="text-[13px] text-muted-foreground">Cargando inmueble...</p>
      </div>
    );
  }

  if (strErrorCarga || !inmueble) {
    return (
      <div className="px-6 py-6">
        <p className="text-[13px] text-muted-foreground">
          {strErrorCarga || "Este inmueble no existe o fue eliminado."}{" "}
          <Link href="/admin/inmuebles" className="text-primary hover:text-primary/80">
            Volver a Inmuebles
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <Link
        href="/admin/inmuebles"
        className="font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground hover:text-foreground"
      >
        ← Inmuebles
      </Link>

      <div className="mb-4 mt-1 flex items-center justify-between">
        <h1 className="font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          {inmueble.codigo} · {inmueble.tipoInmueble.nombre}
        </h1>
        <span
          className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
            inmueble.activo ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"
          }`}
        >
          {inmueble.activo ? "Activo" : "Inactivo"}
        </span>
      </div>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}

      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setStrTab("datos")}
          className={`font-subtitle px-4 py-2 text-[13px] font-medium leading-[1.3] tracking-[-0.005em] transition-colors ${
            strTab === "datos"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Datos generales
        </button>
        <button
          type="button"
          onClick={() => setStrTab("historial")}
          className={`font-subtitle px-4 py-2 text-[13px] font-medium leading-[1.3] tracking-[-0.005em] transition-colors ${
            strTab === "historial"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Historial de Ocupantes
        </button>
      </div>

      {strTab === "datos" ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Código
              </dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.codigo}</dd>
            </div>
            <div>
              <dt className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Tipo
              </dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.tipoInmueble.nombre}</dd>
            </div>
            <div>
              <dt className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Piso
              </dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.piso || "—"}</dd>
            </div>
            <div>
              <dt className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Área m²
              </dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.areaM2 || "—"}</dd>
            </div>
          </dl>

          {bolPuedeCambiarEstado && (
            <button
              type="button"
              onClick={handleAlternarEstado}
              className="mt-5 flex h-9 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              {inmueble.activo ? "Desactivar inmueble" : "Activar inmueble"}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">
              Línea de tiempo de propietarios e inquilinos que han ocupado este inmueble.
            </p>
            <Link
              href={`/admin/residentes?inmuebleId=${inmueble.id}`}
              className="font-caption whitespace-nowrap text-[12px] font-medium text-primary hover:text-primary/80"
            >
              + Asignar nuevo ocupante
            </Link>
          </div>

          {historial.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              No hay historial de ocupantes registrado para este inmueble
            </p>
          ) : (
            <ol className="flex flex-col gap-5">
              {historial.map((registro) => {
                const bolActivo = esOcupanteActivo(registro);

                return (
                  <li key={registro.id} className="relative border-l-2 border-border pl-5">
                    <span
                      className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-card ${
                        bolActivo ? "bg-primary" : "bg-muted-foreground"
                      }`}
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-medium text-foreground">
                        {registro.copropietario.nombre} {registro.copropietario.apellido}
                      </p>
                      <span
                        className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          registro.esPropietario
                            ? "bg-success-subtle text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {etiquetaRol(registro.esPropietario)}
                      </span>
                      {bolActivo && (
                        <span className="font-caption inline-flex rounded-full bg-accent-secondary/10 px-2 py-0.5 text-[11px] font-medium text-accent-secondary">
                          Actual
                        </span>
                      )}
                    </div>

                    <p className="font-caption mt-1 text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                      {formatearFecha(registro.fechaInicio)} —{" "}
                      {bolActivo ? "Actual" : formatearFecha(registro.fechaFin as string)}
                    </p>

                    <p className="font-caption mt-1 text-[12px] leading-[1.4] tracking-[0.01em] text-muted-foreground">
                      CI: {registro.copropietario.ci}
                    </p>

                    {bolActivo && bolPuedeDarBaja && (
                      <button
                        type="button"
                        onClick={() => abrirDialogoBaja(registro)}
                        className="font-caption mt-2 text-[12px] font-medium text-destructive hover:text-destructive/80"
                      >
                        Dar de baja
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      <Dialog open={ocupanteParaBaja !== null} onOpenChange={(bolOpen) => !bolOpen && cerrarDialogoBaja()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              Dar de baja a ocupante
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {ocupanteParaBaja &&
                `¿Confirmas dar de baja a ${ocupanteParaBaja.copropietario.nombre} ${ocupanteParaBaja.copropietario.apellido}? Se registrará la fecha de finalización de su ocupación.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            <label htmlFor="fechaFin" className="text-[12px] font-medium text-foreground">
              Fecha de finalización
            </label>
            <input
              id="fechaFin"
              type="date"
              value={strFechaFin}
              min={ocupanteParaBaja?.fechaInicio.slice(0, 10)}
              onChange={(event) => setStrFechaFin(event.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </div>

          {strErrorBaja && (
            <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
              {strErrorBaja}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={cerrarDialogoBaja} disabled={bolGuardandoBaja}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmarBaja} disabled={bolGuardandoBaja}>
              {bolGuardandoBaja ? "Guardando..." : "Confirmar baja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
