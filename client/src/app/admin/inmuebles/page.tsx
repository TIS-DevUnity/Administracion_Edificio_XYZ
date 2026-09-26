"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Search } from "lucide-react";
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
  return `h-10 w-full rounded-lg border bg-background px-3 text-[14px] text-foreground outline-none transition-colors focus:ring-4 ${
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
  const [strBusqueda, setStrBusqueda] = useState("");

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

    const strQuery = new URLSearchParams(window.location.search).get("q");
    if (strQuery) setStrBusqueda(strQuery);
  }, []);

  const inmueblesVisibles = useMemo(() => {
    const strBusquedaNormalizada = strBusqueda.trim().toLowerCase();
    if (!strBusquedaNormalizada) return inmuebles;

    return inmuebles.filter(
      (inmueble) =>
        inmueble.codigo.toLowerCase().includes(strBusquedaNormalizada) ||
        (inmueble.piso ?? "").toLowerCase().includes(strBusquedaNormalizada) ||
        inmueble.tipoInmueble.nombre.toLowerCase().includes(strBusquedaNormalizada)
    );
  }, [inmuebles, strBusqueda]);

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
    <div className="px-4 py-6 sm:px-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Registra los departamentos, parqueos y bauleras del edificio.
      </p>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}

      {bolPuedeCrear && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="font-subtitle mb-4 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Registrar inmueble
          </h2>

          {/* En mobile: una tarjeta por campo, apiladas. Desde sm: vuelve a grid. */}
          <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-background/50 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                <label htmlFor="codigo" className="mb-1 block text-[12px] font-medium text-foreground">
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

              <div className="rounded-xl border border-border bg-background/50 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                <label htmlFor="tipoInmuebleId" className="mb-1 block text-[12px] font-medium text-foreground">
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

              <div className="rounded-xl border border-border bg-background/50 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                <label htmlFor="piso" className="mb-1 block text-[12px] font-medium text-foreground">
                  Piso <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input id="piso" name="piso" autoComplete="off" className={claseCampo(false)} />
              </div>

              <div className="rounded-xl border border-border bg-background/50 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                <label htmlFor="areaM2" className="mb-1 block text-[12px] font-medium text-foreground">
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
                className="flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-[14px] font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98] sm:h-10 sm:w-auto sm:text-[13px]"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-4 flex justify-end">
        <div className="relative w-full sm:w-[280px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar por código, piso o tipo..."
            value={strBusqueda}
            onChange={(event) => setStrBusqueda(event.target.value)}
            className={claseCampo(false) + " pl-9"}
          />
        </div>
      </div>

      {/* Vista tabla (md en adelante) */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm md:block">
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
              inmueblesVisibles.map((inmueble) => (
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
            {!bolLoading && !strErrorCarga && inmuebles.length > 0 && inmueblesVisibles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  Ningún inmueble coincide con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Vista tarjetas (mobile) */}
      <div className="flex flex-col gap-3 md:hidden">
        {bolLoading && (
          <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-[13px] text-muted-foreground shadow-sm">
            Cargando inmuebles...
          </div>
        )}

        {!bolLoading && strErrorCarga && (
          <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-[13px] text-destructive shadow-sm">
            {strErrorCarga}
          </div>
        )}

        {!bolLoading &&
          !strErrorCarga &&
          inmueblesVisibles.map((inmueble) => (
            <div key={inmueble.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              {/* Encabezado: código + badge de estado */}
              <div className="flex items-start justify-between gap-3">
                <p className="font-subtitle text-[15px] font-semibold leading-[1.4] text-foreground">
                  {inmueble.codigo}
                </p>
                <span
                  className={`font-caption inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    inmueble.activo ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"
                  }`}
                >
                  {inmueble.activo ? "Activo" : "Inactivo"}
                </span>
              </div>

              {/* Subtítulo: tipo de inmueble */}
              <p className="mt-1 text-[13px] text-muted-foreground">{inmueble.tipoInmueble.nombre}</p>

              {/* Divisoria */}
              <div className="my-3 border-t border-border" />

              {/* Datos: piso / área */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground">
                    Piso
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-foreground">{inmueble.piso || "—"}</p>
                </div>
                <div>
                  <p className="font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground">
                    Área m²
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-foreground">{inmueble.areaM2 || "—"}</p>
                </div>
              </div>

              {/* Divisoria */}
              <div className="my-3 border-t border-border" />

              {/* Acciones: botones apilados de ancho completo */}
              <div className="flex flex-col gap-2">
                <Link
                  href={`/admin/inmuebles/${inmueble.id}`}
                  className="flex h-10 w-full items-center justify-center rounded-lg border border-border text-[13px] font-medium text-primary transition-colors hover:bg-primary/5"
                >
                  Ver ficha
                </Link>

                {bolPuedeCambiarEstado && (
                  <button
                    type="button"
                    onClick={() => handleAlternarEstado(inmueble)}
                    className="flex h-10 w-full items-center justify-center rounded-lg border border-border text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/5"
                  >
                    {inmueble.activo ? "Desactivar" : "Activar"}
                  </button>
                )}
              </div>
            </div>
          ))}

        {!bolLoading && !strErrorCarga && inmuebles.length === 0 && (
          <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-[13px] text-muted-foreground shadow-sm">
            Todavía no hay inmuebles registrados.
          </div>
        )}

        {!bolLoading && !strErrorCarga && inmuebles.length > 0 && inmueblesVisibles.length === 0 && (
          <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-[13px] text-muted-foreground shadow-sm">
            Ningún inmueble coincide con la búsqueda.
          </div>
        )}
      </div>
    </div>
  );
}