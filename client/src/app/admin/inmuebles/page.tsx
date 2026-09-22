"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import {
  Inmueble,
  TipoInmueble,
  actualizarInmueble,
  crearInmueble,
  listarInmuebles,
  listarTiposInmueble,
  obtenerMensajeError,
} from "@/lib/inmuebles";

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

  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [tiposInmueble, setTiposInmueble] = useState<TipoInmueble[]>([]);
  const [bolLoading, setBolLoading] = useState(true);
  const [strErrorCarga, setStrErrorCarga] = useState("");

  const bolPuedeCrear = puedeEjecutar(rol, "inmuebles", "crear");
  const bolPuedeCambiarEstado = puedeEjecutar(rol, "inmuebles", "eliminar");

  const [camposError, setCamposError] = useState<Set<string>>(new Set());
  const [strError, setStrError] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [strExito, setStrExito] = useState("");
  const [objInmuebleInactivoDuplicado, setObjInmuebleInactivoDuplicado] = useState<{
    inmueble: Inmueble;
    piso: string;
    areaM2: string;
  } | null>(null);

  async function cargarDatos() {
    try {
      setBolLoading(true);
      setStrErrorCarga("");
      const [arrInmuebles, arrTipos] = await Promise.all([listarInmuebles(), listarTiposInmueble()]);
      setInmuebles(arrInmuebles);
      setTiposInmueble(arrTipos);
    } catch (error: unknown) {
      console.error("Error al cargar inmuebles:", error);
      setStrErrorCarga("No se pudo cargar la lista de inmuebles.");
    } finally {
      setBolLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStrExito("");
    setObjInmuebleInactivoDuplicado(null);

    const objValidacionPermiso = validarAccion(rol, "inmuebles", "crear");
    if (!objValidacionPermiso.permitido) {
      setStrMensajePermiso(objValidacionPermiso.mensaje);
      return;
    }
    setStrMensajePermiso("");

    const objFormulario = new FormData(event.currentTarget);
    const strCodigo = String(objFormulario.get("codigo") ?? "").trim();
    const strTipoInmuebleId = String(objFormulario.get("tipoInmuebleId") ?? "");
    const strPiso = String(objFormulario.get("piso") ?? "").trim();
    const strAreaM2 = String(objFormulario.get("areaM2") ?? "").trim();

    const camposFaltantes = new Set<string>();
    if (!strCodigo) camposFaltantes.add("codigo");
    if (!strTipoInmuebleId) camposFaltantes.add("tipoInmuebleId");

    if (camposFaltantes.size > 0) {
      setCamposError(camposFaltantes);
      setStrError("Completa los campos obligatorios destacados.");
      return;
    }

    try {
      await crearInmueble({
        codigo: strCodigo,
        tipoInmuebleId: strTipoInmuebleId,
        piso: strPiso || undefined,
        areaM2: strAreaM2 ? Number(strAreaM2) : undefined,
      });

      setCamposError(new Set());
      setStrError("");
      setStrExito("Inmueble registrado con éxito.");
      event.currentTarget.reset();
      await cargarDatos();
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const objExistente = inmuebles.find(
          (inmueble) => inmueble.codigo.trim().toLowerCase() === strCodigo.toLowerCase()
        );

        if (objExistente && !objExistente.activo) {
          setCamposError(new Set(["codigo"]));
          setStrError(
            "Ya existe un inmueble inactivo con este código. Puedes reactivarlo para volver a rentarlo."
          );
          setObjInmuebleInactivoDuplicado({ inmueble: objExistente, piso: strPiso, areaM2: strAreaM2 });
          return;
        }
      }

      setCamposError(new Set(["codigo"]));
      setStrError(obtenerMensajeError(error, "Ocurrió un error al registrar el inmueble."));
    }
  }

  async function handleReactivar() {
    if (!objInmuebleInactivoDuplicado) return;

    const { inmueble, piso, areaM2 } = objInmuebleInactivoDuplicado;

    try {
      await actualizarInmueble(inmueble.id, {
        activo: true,
        piso: piso || undefined,
        areaM2: areaM2 ? Number(areaM2) : undefined,
      });

      setObjInmuebleInactivoDuplicado(null);
      setCamposError(new Set());
      setStrError("");
      setStrExito("Inmueble reactivado con éxito.");
      await cargarDatos();
    } catch (error: unknown) {
      setStrError(obtenerMensajeError(error, "Ocurrió un error al reactivar el inmueble."));
    }
  }

  async function handleAlternarEstado(inmueble: Inmueble) {
    const objValidacion = validarAccion(rol, "inmuebles", "eliminar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");

    try {
      await actualizarInmueble(inmueble.id, { activo: !inmueble.activo });
      await cargarDatos();
    } catch (error: unknown) {
      setStrError(obtenerMensajeError(error, "Ocurrió un error al cambiar el estado del inmueble."));
    }
  }

  return (
    <div className="px-6 py-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Registra los departamentos, parqueos y bauleras del edificio.
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
                <label htmlFor="codigo" className="text-[12px] font-medium text-foreground">
                  Código
                </label>
                <input
                  id="codigo"
                  name="codigo"
                  autoComplete="off"
                  placeholder="Ej. DPTO-101"
                  onChange={() =>
                    setCamposError((prev) => {
                      const next = new Set(prev);
                      next.delete("codigo");
                      return next;
                    })
                  }
                  className={claseCampo(camposError.has("codigo"))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="tipoInmuebleId" className="text-[12px] font-medium text-foreground">
                  Tipo de inmueble
                </label>
                <select
                  id="tipoInmuebleId"
                  name="tipoInmuebleId"
                  defaultValue=""
                  onChange={() =>
                    setCamposError((prev) => {
                      const next = new Set(prev);
                      next.delete("tipoInmuebleId");
                      return next;
                    })
                  }
                  className={claseCampo(camposError.has("tipoInmuebleId"))}
                >
                  <option value="" disabled>
                    Selecciona un tipo...
                  </option>
                  {tiposInmueble.map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>
                      {tipo.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="piso" className="text-[12px] font-medium text-foreground">
                  Piso <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input id="piso" name="piso" autoComplete="off" className={claseCampo(false)} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="areaM2" className="text-[12px] font-medium text-foreground">
                  Área m² <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="areaM2"
                  name="areaM2"
                  type="number"
                  min="0"
                  step="0.01"
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
              <div className="animate-in fade-in slide-in-from-top-1 duration-300 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                <span>{strError}</span>
                {objInmuebleInactivoDuplicado && (
                  <button
                    type="button"
                    onClick={handleReactivar}
                    className="font-caption whitespace-nowrap rounded-md border border-destructive/30 px-2 py-1 text-[12px] font-medium text-destructive hover:bg-destructive/10"
                  >
                    Reactivar inmueble
                  </button>
                )}
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
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Código</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Tipo</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Piso</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Área m²</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Estado</th>
              <th className="font-caption px-5 py-2.5 text-right text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                {bolPuedeCambiarEstado ? "Acciones" : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {bolLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  Cargando inmuebles...
                </td>
              </tr>
            )}
            {!bolLoading && strErrorCarga && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[13px] text-destructive">
                  {strErrorCarga}
                </td>
              </tr>
            )}
            {!bolLoading &&
              !strErrorCarga &&
              inmuebles.map((inmueble) => (
                <tr key={inmueble.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                  <td className="px-5 py-3 text-[13px] text-foreground">{inmueble.codigo}</td>
                  <td className="px-5 py-3 text-[13px] text-foreground">{inmueble.tipoInmueble.nombre}</td>
                  <td className="px-5 py-3 text-[13px] text-muted-foreground">{inmueble.piso || "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-muted-foreground">{inmueble.areaM2 || "—"}</td>
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
                          onClick={() => handleAlternarEstado(inmueble)}
                          className="font-caption text-[12px] font-medium text-destructive hover:text-destructive/80"
                        >
                          {inmueble.activo ? "Desactivar" : "Activar"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            {!bolLoading && !strErrorCarga && inmuebles.length === 0 && (
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
