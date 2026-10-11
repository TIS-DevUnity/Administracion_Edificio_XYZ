"use client";

import { FormEvent, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BadgeTipoInmueble } from "@/components/BadgeTipoInmueble";
import {
  CampoPersona,
  Copropietario,
  crearCopropietario,
  validarDatosPersona,
} from "@/lib/copropietarios";
import {
  CLASES_INMUEBLE,
  ETIQUETA_CLASE,
  Inmueble,
  asignarOcupante,
  obtenerMensajeError,
} from "@/lib/inmuebles";

export function claseCampoPersona(bolError: boolean) {
  return `h-9 w-full rounded-lg border bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:ring-4 ${
    bolError
      ? "border-destructive focus:border-destructive focus:ring-destructive/15"
      : "border-input focus:border-primary focus:ring-primary/15"
  }`;
}

export type RolAsignacion = "PROPIETARIO" | "INQUILINO";

/** Checkboxes de inmuebles activos agrupados por clase; permite elegir uno o varios. */
export function ListaInmueblesSeleccionables({
  inmuebles,
  setSeleccionados,
  seleccionados,
  idsDeshabilitados = new Set(),
  bolError = false,
}: {
  inmuebles: Inmueble[];
  seleccionados: Set<string>;
  setSeleccionados: (next: Set<string>) => void;
  /** Inmuebles que no se pueden elegir (ej. ya asociados con ese mismo rol). */
  idsDeshabilitados?: Set<string>;
  bolError?: boolean;
}) {
  const activos = inmuebles.filter((inmueble) => inmueble.activo);

  function alternar(strId: string) {
    const next = new Set(seleccionados);
    if (next.has(strId)) next.delete(strId);
    else next.add(strId);
    setSeleccionados(next);
  }

  if (activos.length === 0) {
    return <p className="text-[12px] text-muted-foreground">No hay inmuebles activos para asignar.</p>;
  }

  return (
    <div
      className={`max-h-56 overflow-y-auto rounded-lg border p-2 ${bolError ? "border-destructive" : "border-input"}`}
    >
      {CLASES_INMUEBLE.map((clase) => {
        const deClase = activos.filter((inmueble) => inmueble.clase === clase);
        if (deClase.length === 0) return null;
        return (
          <div key={clase} className="mb-2 last:mb-0">
            <p className="font-caption px-1 pb-1 text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground">
              {ETIQUETA_CLASE[clase]}s
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {deClase.map((inmueble) => {
                const bolDeshabilitado = idsDeshabilitados.has(inmueble.id);
                return (
                  <label
                    key={inmueble.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                      bolDeshabilitado ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={seleccionados.has(inmueble.id)}
                      disabled={bolDeshabilitado}
                      onChange={() => alternar(inmueble.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="font-medium text-foreground">{inmueble.codigo}</span>
                    <BadgeTipoInmueble inmueble={inmueble} />
                    {inmueble.piso && (
                      <span className="font-caption text-[11px] text-muted-foreground">Piso {inmueble.piso}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Asigna a una persona a varios inmuebles con el mismo rol. Se hace uno por uno porque el
 * backend solo tiene POST /inmuebles/:id/ocupantes; devuelve los códigos asignados y los errores.
 */
export async function asignarAVarios(
  strCopropietarioId: string,
  inmuebles: Inmueble[],
  rol: RolAsignacion,
  strFechaInicio?: string
): Promise<{ asignados: string[]; errores: string[] }> {
  const asignados: string[] = [];
  const errores: string[] = [];
  for (const inmueble of inmuebles) {
    try {
      await asignarOcupante(inmueble.id, {
        copropietarioId: strCopropietarioId,
        esPropietario: rol === "PROPIETARIO",
        fechaInicio: strFechaInicio || undefined,
      });
      asignados.push(inmueble.codigo);
    } catch (error: unknown) {
      errores.push(`${inmueble.codigo}: ${obtenerMensajeError(error, "no se pudo asignar")}`);
    }
  }
  return { asignados, errores };
}

const CAMPOS: { id: CampoPersona; etiqueta: string; opcional?: boolean; tipo?: string; placeholder?: string }[] = [
  { id: "nombre", etiqueta: "Nombre" },
  { id: "apellido", etiqueta: "Apellido" },
  { id: "ci", etiqueta: "CI" },
  { id: "telefono", etiqueta: "Teléfono", opcional: true, placeholder: "Solo números" },
  { id: "email", etiqueta: "Correo electrónico", opcional: true, tipo: "email", placeholder: "ejemplo@dominio.com" },
];

export function DialogoRegistrarPersona({
  bolAbierto,
  onCerrar,
  prefill,
  inmueblesParaAsignar,
  onRegistrado,
}: {
  bolAbierto: boolean;
  onCerrar: () => void;
  prefill?: Partial<Record<CampoPersona, string>>;
  /** Si se pasa, el formulario también permite elegir rol e inmuebles a asignar. */
  inmueblesParaAsignar?: Inmueble[];
  onRegistrado: (copropietario: Copropietario, strMensaje: string) => void;
}) {
  const [errores, setErrores] = useState<Partial<Record<CampoPersona | "rol" | "inmuebles", string>>>({});
  const [strErrorGeneral, setStrErrorGeneral] = useState("");
  const [bolGuardando, setBolGuardando] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [strRol, setStrRol] = useState<RolAsignacion | "">("");

  function cerrar() {
    setErrores({});
    setStrErrorGeneral("");
    setSeleccionados(new Set());
    setStrRol("");
    onCerrar();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const objFormulario = new FormData(event.currentTarget);
    const datos = Object.fromEntries(
      CAMPOS.map((campo) => [campo.id, String(objFormulario.get(campo.id) ?? "").trim()])
    ) as Record<CampoPersona, string>;

    const nuevosErrores: typeof errores = validarDatosPersona(datos);
    if (inmueblesParaAsignar && seleccionados.size > 0 && !strRol) {
      nuevosErrores.rol = "Selecciona el rol (Propietario o Inquilino) para los inmuebles elegidos.";
    }
    if (inmueblesParaAsignar && strRol && seleccionados.size === 0) {
      nuevosErrores.inmuebles = "Elegiste un rol: selecciona al menos un inmueble o quita el rol.";
    }

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) {
      setStrErrorGeneral("Corrige los datos señalados.");
      return;
    }

    setBolGuardando(true);
    setStrErrorGeneral("");
    try {
      const nuevo = await crearCopropietario({
        nombre: datos.nombre,
        apellido: datos.apellido,
        ci: datos.ci,
        telefono: datos.telefono || undefined,
        email: datos.email || undefined,
      });

      let strMensaje = `Persona registrada con éxito: ${nuevo.nombre} ${nuevo.apellido}.`;
      if (inmueblesParaAsignar && strRol && seleccionados.size > 0) {
        const elegidos = inmueblesParaAsignar.filter((inmueble) => seleccionados.has(inmueble.id));
        const { asignados, errores: erroresAsignacion } = await asignarAVarios(nuevo.id, elegidos, strRol);
        if (asignados.length > 0) {
          strMensaje += ` Asignada como ${strRol === "PROPIETARIO" ? "propietario" : "inquilino"} a: ${asignados.join(", ")}.`;
        }
        if (erroresAsignacion.length > 0) {
          strMensaje += ` No se pudo asignar ${erroresAsignacion.join("; ")}.`;
        }
      }

      setErrores({});
      setSeleccionados(new Set());
      setStrRol("");
      onRegistrado(nuevo, strMensaje);
    } catch (error: unknown) {
      const strMensaje = obtenerMensajeError(error, "Ocurrió un error al registrar a la persona.");
      if (/CI/i.test(strMensaje)) setErrores({ ci: strMensaje });
      setStrErrorGeneral(strMensaje);
    } finally {
      setBolGuardando(false);
    }
  }

  function limpiarError(campo: keyof typeof errores) {
    if (!errores[campo]) return;
    setErrores((prev) => {
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  }

  return (
    <Dialog open={bolAbierto} onOpenChange={(bolOpen) => !bolOpen && cerrar()}>
      <DialogContent className={inmueblesParaAsignar ? "sm:max-w-xl" : undefined}>
        <DialogHeader>
          <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
            Registrar persona
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
            Datos personales y de contacto del propietario o inquilino.
          </DialogDescription>
        </DialogHeader>

        {bolAbierto && (
          <form onSubmit={handleSubmit} autoComplete="off" noValidate className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CAMPOS.map((campo, intIndice) => (
                <div key={campo.id} className={`flex flex-col gap-1 ${campo.id === "email" ? "sm:col-span-2" : ""}`}>
                  <label htmlFor={`persona-${campo.id}`} className="text-[12px] font-medium text-foreground">
                    {campo.etiqueta} {campo.opcional && <span className="text-muted-foreground">(opcional)</span>}
                  </label>
                  <input
                    id={`persona-${campo.id}`}
                    name={campo.id}
                    type={campo.tipo ?? "text"}
                    inputMode={campo.id === "telefono" ? "numeric" : undefined}
                    autoComplete="off"
                    placeholder={campo.placeholder}
                    defaultValue={prefill?.[campo.id] ?? ""}
                    autoFocus={
                      prefill
                        ? !prefill[campo.id] && CAMPOS.slice(0, intIndice).every((previo) => prefill[previo.id])
                        : intIndice === 0
                    }
                    aria-invalid={Boolean(errores[campo.id])}
                    onChange={() => limpiarError(campo.id)}
                    className={claseCampoPersona(Boolean(errores[campo.id]))}
                  />
                  {errores[campo.id] && <p className="text-[12px] text-destructive">{errores[campo.id]}</p>}
                </div>
              ))}
            </div>

            {inmueblesParaAsignar && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-subtitle text-[12px] font-semibold tracking-[-0.005em] text-foreground">
                  Asignar inmuebles <span className="font-body normal-case text-muted-foreground">(opcional)</span>
                </p>
                <div className="flex flex-col gap-1 sm:max-w-xs">
                  <label htmlFor="persona-rol" className="text-[12px] font-medium text-foreground">
                    Rol
                  </label>
                  <select
                    id="persona-rol"
                    value={strRol}
                    onChange={(event) => {
                      setStrRol(event.target.value as RolAsignacion | "");
                      limpiarError("rol");
                      limpiarError("inmuebles");
                    }}
                    className={claseCampoPersona(Boolean(errores.rol))}
                  >
                    <option value="">Sin asignar por ahora</option>
                    <option value="PROPIETARIO">Propietario</option>
                    <option value="INQUILINO">Inquilino</option>
                  </select>
                  {errores.rol && <p className="text-[12px] text-destructive">{errores.rol}</p>}
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Puedes elegir departamentos, bauleras y parqueos en cualquier combinación.
                </p>
                <ListaInmueblesSeleccionables
                  inmuebles={inmueblesParaAsignar}
                  seleccionados={seleccionados}
                  setSeleccionados={(next) => {
                    setSeleccionados(next);
                    limpiarError("rol");
                    limpiarError("inmuebles");
                  }}
                  bolError={Boolean(errores.inmuebles)}
                />
                {errores.inmuebles && <p className="text-[12px] text-destructive">{errores.inmuebles}</p>}
              </div>
            )}

            {strErrorGeneral && (
              <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                {strErrorGeneral}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={cerrar} disabled={bolGuardando}>
                Cancelar
              </Button>
              <Button type="submit" cargando={bolGuardando}>
                {bolGuardando ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
