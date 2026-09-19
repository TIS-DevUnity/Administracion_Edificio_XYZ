"use client";

import { FormEvent, useState } from "react";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { RolNombre, SeccionId, puedeEjecutar, validarAccion } from "@/lib/permissions";

export interface CampoRegistro {
  key: string;
  label: string;
  placeholder?: string;
}

export interface RegistroBase {
  id: string;
  [key: string]: string;
}

interface GestorSeccionProps {
  rol: RolNombre;
  seccion: SeccionId;
  campos: CampoRegistro[];
  registrosIniciales: RegistroBase[];
}

export function GestorSeccion({ rol, seccion, campos, registrosIniciales }: GestorSeccionProps) {
  const [registros, setRegistros] = useState<RegistroBase[]>(registrosIniciales);
  const [strIdEnEdicion, setStrIdEnEdicion] = useState<string | null>(null);
  const [bolMostrarFormularioNuevo, setBolMostrarFormularioNuevo] = useState(false);
  const [strMensajeError, setStrMensajeError] = useState("");

  const bolPuedeCrear = puedeEjecutar(rol, seccion, "crear");
  const bolPuedeEditar = puedeEjecutar(rol, seccion, "editar");
  const bolPuedeEliminar = puedeEjecutar(rol, seccion, "eliminar");

  function crearRegistro(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const objValidacion = validarAccion(rol, seccion, "crear");
    if (!objValidacion.permitido) {
      setStrMensajeError(objValidacion.mensaje);
      return;
    }

    const objFormulario = new FormData(event.currentTarget);
    const objNuevoRegistro: RegistroBase = { id: crypto.randomUUID() };
    campos.forEach((campo) => {
      objNuevoRegistro[campo.key] = String(objFormulario.get(campo.key) ?? "");
    });

    setRegistros((registrosPrevios) => [objNuevoRegistro, ...registrosPrevios]);
    setBolMostrarFormularioNuevo(false);
    setStrMensajeError("");
  }

  function guardarEdicion(strId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const objValidacion = validarAccion(rol, seccion, "editar");
    if (!objValidacion.permitido) {
      setStrMensajeError(objValidacion.mensaje);
      return;
    }

    const objFormulario = new FormData(event.currentTarget);
    setRegistros((registrosPrevios) =>
      registrosPrevios.map((registro) => {
        if (registro.id !== strId) {
          return registro;
        }

        const objActualizado: RegistroBase = { id: strId };
        campos.forEach((campo) => {
          objActualizado[campo.key] = String(objFormulario.get(campo.key) ?? registro[campo.key]);
        });
        return objActualizado;
      })
    );
    setStrIdEnEdicion(null);
    setStrMensajeError("");
  }

  function eliminarRegistro(strId: string) {
    const objValidacion = validarAccion(rol, seccion, "eliminar");
    if (!objValidacion.permitido) {
      setStrMensajeError(objValidacion.mensaje);
      return;
    }

    setRegistros((registrosPrevios) => registrosPrevios.filter((registro) => registro.id !== strId));
    setStrMensajeError("");
  }

  const bolHayAcciones = bolPuedeEditar || bolPuedeEliminar;

  return (
    <div>
      {strMensajeError && <AlertaPermiso mensaje={strMensajeError} />}

      {bolPuedeCrear && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setBolMostrarFormularioNuevo((bolValor) => !bolValor)}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98]"
          >
            {bolMostrarFormularioNuevo ? "Cancelar" : "+ Nuevo registro"}
          </button>

          {bolMostrarFormularioNuevo && (
            <form
              onSubmit={crearRegistro}
              autoComplete="off"
              className="animate-in fade-in slide-in-from-top-1 duration-300 mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4"
            >
              {campos.map((campo) => (
                <div key={campo.key} className="flex flex-col gap-1">
                  <label className="text-[12px] font-medium text-foreground">{campo.label}</label>
                  <input
                    name={campo.key}
                    placeholder={campo.placeholder}
                    autoComplete="off"
                    required
                    className="h-9 w-44 rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                  />
                </div>
              ))}
              <button
                type="submit"
                className="h-9 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Guardar
              </button>
            </form>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {campos.map((campo) => (
                <th
                  key={campo.key}
                  className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground"
                >
                  {campo.label}
                </th>
              ))}
              {bolHayAcciones && (
                <th className="font-caption px-5 py-2.5 text-right text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  Acciones
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {registros.map((registro) =>
              strIdEnEdicion === registro.id ? (
                <tr key={registro.id} className="border-b border-border last:border-0">
                  <td colSpan={campos.length + (bolHayAcciones ? 1 : 0)} className="px-5 py-3">
                    <form
                      onSubmit={(event) => guardarEdicion(registro.id, event)}
                      autoComplete="off"
                      className="flex flex-wrap items-end gap-3"
                    >
                      {campos.map((campo) => (
                        <div key={campo.key} className="flex flex-col gap-1">
                          <label className="text-[12px] font-medium text-foreground">{campo.label}</label>
                          <input
                            name={campo.key}
                            defaultValue={registro[campo.key]}
                            autoComplete="off"
                            required
                            className="h-9 w-44 rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                          />
                        </div>
                      ))}
                      <button
                        type="submit"
                        className="h-9 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setStrIdEnEdicion(null)}
                        className="h-9 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={registro.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                  {campos.map((campo) => (
                    <td key={campo.key} className="px-5 py-3 text-[13px] leading-[1.45] text-foreground">
                      {registro[campo.key]}
                    </td>
                  ))}

                  {bolHayAcciones && (
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {bolPuedeEditar && (
                          <button
                            type="button"
                            onClick={() => setStrIdEnEdicion(registro.id)}
                            className="font-caption text-[12px] font-medium text-primary hover:text-primary/80"
                          >
                            Editar
                          </button>
                        )}
                        {bolPuedeEliminar && (
                          <button
                            type="button"
                            onClick={() => eliminarRegistro(registro.id)}
                            className="font-caption text-[12px] font-medium text-destructive hover:text-destructive/80"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            )}

            {registros.length === 0 && (
              <tr>
                <td
                  colSpan={campos.length + (bolHayAcciones ? 1 : 0)}
                  className="px-5 py-8 text-center text-[13px] text-muted-foreground"
                >
                  No hay registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
