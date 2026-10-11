"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Car, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ListaInmueblesSeleccionables,
  RolAsignacion,
  asignarAVarios,
  claseCampoPersona,
} from "@/components/DialogoRegistrarPersona";
import { Copropietario, InmuebleDePersona, InmueblesDePersona, listarInmueblesDeCopropietario } from "@/lib/copropietarios";
import {
  ClaseInmueble,
  ETIQUETA_CLASE,
  Inmueble,
  darDeBajaOcupante,
  etiquetaClasificacion,
  formatearFecha,
  obtenerMensajeError,
} from "@/lib/inmuebles";
import { RolNombre, validarAccion } from "@/lib/permissions";

const ICONO_CLASE: Record<ClaseInmueble, typeof Building2> = {
  DEPARTAMENTO: Building2,
  BAULERA: Package,
  PARQUEO: Car,
};

const CLASE_ETIQUETA_CAMPO = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";

function clasificacion(item: InmuebleDePersona): string {
  if (item.clase === "DEPARTAMENTO" && item.tipoInmueble) return etiquetaClasificacion(item.tipoInmueble);
  return "Sin clasificación";
}

function FilaInmueble({
  item,
  accion,
}: {
  item: InmuebleDePersona;
  accion?: React.ReactNode;
}) {
  const Icono = ICONO_CLASE[item.clase];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Link href={`/admin/inmuebles/${item.inmuebleId}`} className="text-[13px] font-medium text-foreground hover:text-primary">
          {item.codigo}
        </Link>
      </span>
      <span className="text-[12px] text-muted-foreground">
        {ETIQUETA_CLASE[item.clase]} · {clasificacion(item)} · Piso {item.piso || "—"}
      </span>
      <span
        className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
          item.rol === "PROPIETARIO" ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground"
        }`}
      >
        {item.rol === "PROPIETARIO" ? "Propietario" : "Inquilino"}
      </span>
      <span className="font-caption text-[11px] text-muted-foreground">
        {formatearFecha(item.fechaInicio)} — {item.fechaFin ? formatearFecha(item.fechaFin) : "vigente"}
      </span>
      {accion && <span className="ml-auto">{accion}</span>}
    </li>
  );
}

export function InmueblesDeLaPersona({
  copropietario,
  inmuebles,
  bolPuedeAsignar,
  bolPuedeRetirar,
  rol,
  onCambio,
}: {
  copropietario: Copropietario;
  inmuebles: Inmueble[];
  bolPuedeAsignar: boolean;
  bolPuedeRetirar: boolean;
  rol: RolNombre;
  onCambio: () => void;
}) {
  const [datos, setDatos] = useState<InmueblesDePersona | null>(null);
  const [strErrorCarga, setStrErrorCarga] = useState("");
  const [strExito, setStrExito] = useState("");
  const [strError, setStrError] = useState("");

  const [bolAsignando, setBolAsignando] = useState(false);
  const [bolMostrarAsignar, setBolMostrarAsignar] = useState(false);
  const [strRol, setStrRol] = useState<RolAsignacion | "">("");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const [strRetirandoId, setStrRetirandoId] = useState<string | null>(null);
  const [strConfirmarRetiroId, setStrConfirmarRetiroId] = useState<string | null>(null);

  async function cargar() {
    try {
      setStrErrorCarga("");
      setDatos(await listarInmueblesDeCopropietario(copropietario.id));
    } catch (error: unknown) {
      setStrErrorCarga(obtenerMensajeError(error, "No se pudieron cargar los inmuebles de esta persona."));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copropietario.id]);

  // No se puede volver a asociar a un inmueble con el mismo rol que ya tiene vigente.
  const idsYaAsociados = new Set(
    (datos?.vigentes ?? []).filter((item) => item.rol === strRol).map((item) => item.inmuebleId)
  );

  async function handleAsignar() {
    setStrExito("");
    const objValidacion = validarAccion(rol, "residentes", "crear");
    if (!objValidacion.permitido) {
      setStrError(objValidacion.mensaje);
      return;
    }
    if (!strRol) {
      setStrError("Selecciona el rol (Propietario o Inquilino).");
      return;
    }
    if (seleccionados.size === 0) {
      setStrError("Selecciona al menos un inmueble.");
      return;
    }

    setBolAsignando(true);
    setStrError("");
    const elegidos = inmuebles.filter((inmueble) => seleccionados.has(inmueble.id));
    const { asignados, errores } = await asignarAVarios(copropietario.id, elegidos, strRol);
    setBolAsignando(false);

    if (asignados.length > 0) {
      setStrExito(
        `Asignación registrada con éxito como ${strRol === "PROPIETARIO" ? "propietario" : "inquilino"}: ${asignados.join(", ")}.`
      );
      setSeleccionados(new Set());
      setStrRol("");
      setBolMostrarAsignar(false);
      onCambio();
    }
    if (errores.length > 0) setStrError(`No se pudo asignar ${errores.join("; ")}.`);
    await cargar();
  }

  async function handleRetirar(item: InmuebleDePersona) {
    const objValidacion = validarAccion(rol, "residentes", "editar");
    if (!objValidacion.permitido) {
      setStrError(objValidacion.mensaje);
      return;
    }
    setStrRetirandoId(item.ocupanteId);
    setStrError("");
    setStrExito("");
    try {
      await darDeBajaOcupante(item.inmuebleId, item.ocupanteId, {});
      setStrExito(`Asociación con ${item.codigo} retirada. Queda registrada en el historial.`);
      setStrConfirmarRetiroId(null);
      onCambio();
      await cargar();
    } catch (error: unknown) {
      setStrError(obtenerMensajeError(error, "Ocurrió un error al retirar la asociación."));
    } finally {
      setStrRetirandoId(null);
    }
  }

  if (strErrorCarga) {
    return <p className="text-[13px] text-destructive">{strErrorCarga}</p>;
  }
  if (!datos) {
    return <p className="text-[13px] text-muted-foreground">Cargando inmuebles asociados...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className={CLASE_ETIQUETA_CAMPO}>Inmuebles asociados ({datos.resumen.total})</p>
          <p className="font-caption text-[11px] text-muted-foreground">
            {datos.resumen.departamentos} depto. · {datos.resumen.bauleras} baulera
            {datos.resumen.bauleras === 1 ? "" : "s"} · {datos.resumen.parqueos} parqueo
            {datos.resumen.parqueos === 1 ? "" : "s"}
          </p>
        </div>

        {datos.vigentes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
            Esta persona no tiene inmuebles asociados actualmente.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {datos.vigentes.map((item) => (
              <FilaInmueble
                key={item.ocupanteId}
                item={item}
                accion={
                  bolPuedeRetirar &&
                  (strConfirmarRetiroId === item.ocupanteId ? (
                    <span className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        cargando={strRetirandoId === item.ocupanteId}
                        onClick={() => handleRetirar(item)}
                      >
                        Confirmar retiro
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={strRetirandoId === item.ocupanteId}
                        onClick={() => setStrConfirmarRetiroId(null)}
                      >
                        Cancelar
                      </Button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStrConfirmarRetiroId(item.ocupanteId)}
                      className="font-caption text-[12px] font-medium text-destructive hover:text-destructive/80"
                    >
                      Retirar
                    </button>
                  ))
                }
              />
            ))}
          </ul>
        )}
      </div>

      {strExito && (
        <p className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">{strExito}</p>
      )}
      {strError && (
        <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
          {strError}
        </p>
      )}

      {bolPuedeAsignar &&
        (bolMostrarAsignar ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="font-subtitle text-[12px] font-semibold tracking-[-0.005em] text-foreground">Asignar inmuebles</p>
            <div className="flex flex-col gap-1 sm:max-w-xs">
              <label htmlFor="rol-asignar" className="text-[12px] font-medium text-foreground">
                Rol
              </label>
              <select
                id="rol-asignar"
                value={strRol}
                onChange={(event) => {
                  setStrRol(event.target.value as RolAsignacion | "");
                  setSeleccionados(new Set());
                  setStrError("");
                }}
                className={claseCampoPersona(false)}
              >
                <option value="" disabled>
                  Selecciona un rol...
                </option>
                <option value="PROPIETARIO">Propietario</option>
                <option value="INQUILINO">Inquilino</option>
              </select>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Elige uno o varios: departamentos, bauleras y parqueos en cualquier combinación. Los que ya tiene con ese
              rol aparecen deshabilitados.
            </p>
            <ListaInmueblesSeleccionables
              inmuebles={inmuebles}
              seleccionados={seleccionados}
              setSeleccionados={(next) => {
                setSeleccionados(next);
                setStrError("");
              }}
              idsDeshabilitados={idsYaAsociados}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={bolAsignando}
                onClick={() => {
                  setBolMostrarAsignar(false);
                  setSeleccionados(new Set());
                  setStrRol("");
                  setStrError("");
                }}
              >
                Cancelar
              </Button>
              <Button size="sm" cargando={bolAsignando} onClick={handleAsignar}>
                {bolAsignando ? "Asignando..." : `Asignar${seleccionados.size > 0 ? ` (${seleccionados.size})` : ""}`}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setBolMostrarAsignar(true)}>
            <Plus className="h-4 w-4" />
            Asignar inmuebles
          </Button>
        ))}

      <div>
        <p className={`${CLASE_ETIQUETA_CAMPO} mb-2`}>Historial de asociaciones finalizadas ({datos.anteriores.length})</p>
        {datos.anteriores.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Sin asociaciones anteriores.</p>
        ) : (
          <ul className="flex flex-col gap-2 opacity-80">
            {datos.anteriores.map((item) => (
              <FilaInmueble
                key={item.ocupanteId}
                item={item}
                accion={
                  <span className="font-caption inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Finalizada
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
