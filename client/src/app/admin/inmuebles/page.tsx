"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import {
  alternarActivoInmueble,
  registrarInmueble,
  useInmuebles,
} from "@/lib/inmueblesStore";

function claseCampo(bolError: boolean) {
  return `h-9 w-full rounded-lg border bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:ring-4 ${
    bolError
      ? "border-destructive focus:border-destructive focus:ring-destructive/15"
      : "border-input focus:border-primary focus:ring-primary/15"
  }`;
}

export default function InmueblesPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");
  const inmuebles = useInmuebles();

  const bolPuedeCrear = puedeEjecutar(rol, "inmuebles", "crear");
  const bolPuedeCambiarEstado = puedeEjecutar(rol, "inmuebles", "eliminar");

  const [camposError, setCamposError] = useState<Set<string>>(new Set());
  const [strError, setStrError] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [strExito, setStrExito] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStrExito("");

    const objValidacionPermiso = validarAccion(rol, "inmuebles", "crear");
    if (!objValidacionPermiso.permitido) {
      setStrMensajePermiso(objValidacionPermiso.mensaje);
      return;
    }
    setStrMensajePermiso("");

    const objFormulario = new FormData(event.currentTarget);
    const strNumeroDepartamento = String(objFormulario.get("numeroDepartamento") ?? "");
    const strPiso = String(objFormulario.get("piso") ?? "");
    const strNumeroParqueo = String(objFormulario.get("numeroParqueo") ?? "");
    const strNumeroBaulera = String(objFormulario.get("numeroBaulera") ?? "");

    const camposFaltantes = new Set<string>();
    if (!strNumeroDepartamento.trim()) camposFaltantes.add("numeroDepartamento");
    if (!strPiso.trim()) camposFaltantes.add("piso");

    if (camposFaltantes.size > 0) {
      setCamposError(camposFaltantes);
      setStrError("Completa los campos obligatorios destacados.");
      return;
    }

    const resultado = registrarInmueble({
      numeroDepartamento: strNumeroDepartamento,
      piso: strPiso,
      numeroParqueo: strNumeroParqueo,
      numeroBaulera: strNumeroBaulera,
    });

    if (!resultado.ok) {
      setCamposError(resultado.campo ? new Set([resultado.campo]) : new Set());
      setStrError(resultado.mensaje);
      return;
    }

    setCamposError(new Set());
    setStrError("");
    setStrExito("Inmueble registrado con éxito.");
    event.currentTarget.reset();
  }

  function handleAlternarEstado(strId: string) {
    const objValidacion = validarAccion(rol, "inmuebles", "eliminar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");
    alternarActivoInmueble(strId);
  }

  return (
    <div className="px-6 py-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Registra los departamentos del edificio, junto con su parqueo y baulera asociados (opcionales).
      </p>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}

      {bolPuedeCrear && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-subtitle mb-4 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Registrar inmueble
          </h2>

          <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="numeroDepartamento" className="text-[12px] font-medium text-foreground">
                  N° de departamento
                </label>
                <input
                  id="numeroDepartamento"
                  name="numeroDepartamento"
                  autoComplete="off"
                  onChange={() => setCamposError((prev) => { const next = new Set(prev); next.delete("numeroDepartamento"); return next; })}
                  className={claseCampo(camposError.has("numeroDepartamento"))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="piso" className="text-[12px] font-medium text-foreground">
                  Piso
                </label>
                <input
                  id="piso"
                  name="piso"
                  autoComplete="off"
                  onChange={() => setCamposError((prev) => { const next = new Set(prev); next.delete("piso"); return next; })}
                  className={claseCampo(camposError.has("piso"))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="numeroParqueo" className="text-[12px] font-medium text-foreground">
                  N° de parqueo <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="numeroParqueo"
                  name="numeroParqueo"
                  autoComplete="off"
                  className={claseCampo(false)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="numeroBaulera" className="text-[12px] font-medium text-foreground">
                  N° de baulera <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="numeroBaulera"
                  name="numeroBaulera"
                  autoComplete="off"
                  className={claseCampo(false)}
                />
              </div>
            </div>

            {strExito && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-300 rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">
                {strExito}
              </div>
            )}
            {strError && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-300 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                {strError}
              </div>
            )}

            <div>
              <button
                type="submit"
                className="flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98]"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Departamento</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Piso</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Parqueo</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Baulera</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Estado</th>
              <th className="font-caption px-5 py-2.5 text-right text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                {bolPuedeCambiarEstado ? "Acciones" : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {inmuebles.map((inmueble) => (
              <tr key={inmueble.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                <td className="px-5 py-3 text-[13px] text-foreground">{inmueble.numeroDepartamento}</td>
                <td className="px-5 py-3 text-[13px] text-foreground">{inmueble.piso}</td>
                <td className="px-5 py-3 text-[13px] text-muted-foreground">{inmueble.numeroParqueo || "—"}</td>
                <td className="px-5 py-3 text-[13px] text-muted-foreground">{inmueble.numeroBaulera || "—"}</td>
                <td className="px-5 py-3">
                  <span
                    className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      inmueble.activo ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"
                    }`}
                  >
                    {inmueble.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/inmuebles/${inmueble.id}`}
                      className="font-caption text-[12px] font-medium text-primary hover:text-primary/80"
                    >
                      Ver ficha →
                    </Link>
                    {bolPuedeCambiarEstado && (
                      <button
                        type="button"
                        onClick={() => handleAlternarEstado(inmueble.id)}
                        className="font-caption text-[12px] font-medium text-destructive hover:text-destructive/80"
                      >
                        {inmueble.activo ? "Desactivar" : "Activar"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {inmuebles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  Todavía no hay inmuebles registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
