"use client";

import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Copropietario,
  crearCopropietario,
  esCorreoValido,
  esTelefonoValido,
  listarCopropietarios,
} from "@/lib/copropietarios";
import {
  Inmueble,
  Ocupante,
  asignarOcupante,
  esOcupanteActivo,
  etiquetaRol,
  listarInmuebles,
  listarOcupantes,
  obtenerMensajeError,
} from "@/lib/inmuebles";

function claseCampo(bolError: boolean) {
  return `h-9 w-full rounded-lg border bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:ring-4 ${
    bolError
      ? "border-destructive focus:border-destructive focus:ring-destructive/15"
      : "border-input focus:border-primary focus:ring-primary/15"
  }`;
}

function fechaHoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ResidentesPage() {
  return (
    <Suspense fallback={null}>
      <ResidentesContenido />
    </Suspense>
  );
}

function ResidentesContenido() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");

  const bolPuedeAsignar = puedeEjecutar(rol, "residentes", "crear");

  const searchParams = useSearchParams();
  const strInmuebleIdInicial = searchParams.get("inmuebleId") ?? "";

  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [copropietarios, setCopropietarios] = useState<Copropietario[]>([]);
  const [residentesDelInmueble, setResidentesDelInmueble] = useState<Ocupante[]>([]);
  const [bolLoading, setBolLoading] = useState(true);
  const [bolCargandoResidentes, setBolCargandoResidentes] = useState(false);

  const [strInmuebleId, setStrInmuebleId] = useState(strInmuebleIdInicial);
  const [strCopropietarioId, setStrCopropietarioId] = useState("");
  const [strBusquedaCopropietario, setStrBusquedaCopropietario] = useState("");
  const [strFechaInicio, setStrFechaInicio] = useState(fechaHoyISO());
  const [camposError, setCamposError] = useState<Set<string>>(new Set());
  const [strError, setStrError] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [strExito, setStrExito] = useState("");

  const [bolDialogoNuevoCopropietario, setBolDialogoNuevoCopropietario] = useState(false);
  const [strTelefonoNuevo, setStrTelefonoNuevo] = useState("");
  const [camposErrorNuevo, setCamposErrorNuevo] = useState<Set<string>>(new Set());
  const [strErrorNuevo, setStrErrorNuevo] = useState("");
  const [bolGuardandoNuevo, setBolGuardandoNuevo] = useState(false);

  const inmueblesActivos = inmuebles.filter((inmueble) => inmueble.activo);
  const inmuebleSeleccionado = inmuebles.find((inmueble) => inmueble.id === strInmuebleId) ?? null;

  const copropietariosFiltrados = useMemo(() => {
    const strBusqueda = strBusquedaCopropietario.trim().toLowerCase();
    if (!strBusqueda) return copropietarios;

    return copropietarios.filter((copropietario) => {
      const strNombreCompleto = `${copropietario.nombre} ${copropietario.apellido}`.toLowerCase();
      return strNombreCompleto.includes(strBusqueda) || copropietario.ci.toLowerCase().includes(strBusqueda);
    });
  }, [copropietarios, strBusquedaCopropietario]);

  async function cargarBase() {
    try {
      setBolLoading(true);
      const [arrInmuebles, arrCopropietarios] = await Promise.all([listarInmuebles(), listarCopropietarios()]);
      setInmuebles(arrInmuebles);
      setCopropietarios(arrCopropietarios);
    } catch (error: unknown) {
      console.error("Error al cargar datos:", error);
      setStrError("No se pudieron cargar los inmuebles o copropietarios.");
    } finally {
      setBolLoading(false);
    }
  }

  async function cargarResidentes(strId: string) {
    if (!strId) {
      setResidentesDelInmueble([]);
      return;
    }
    try {
      setBolCargandoResidentes(true);
      const arrOcupantes = await listarOcupantes(strId);
      setResidentesDelInmueble(arrOcupantes.filter(esOcupanteActivo));
    } catch (error: unknown) {
      console.error("Error al cargar residentes:", error);
    } finally {
      setBolCargandoResidentes(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarBase();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarResidentes(strInmuebleId);
  }, [strInmuebleId]);

  function limpiarError(strCampo: string) {
    setCamposError((prev) => {
      const next = new Set(prev);
      next.delete(strCampo);
      return next;
    });
  }

  function obtenerCopropietarioPorId(strId: string): Copropietario | undefined {
    return copropietarios.find((copropietario) => copropietario.id === strId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStrExito("");

    const objValidacionPermiso = validarAccion(rol, "residentes", "crear");
    if (!objValidacionPermiso.permitido) {
      setStrMensajePermiso(objValidacionPermiso.mensaje);
      return;
    }
    setStrMensajePermiso("");

    const objFormulario = new FormData(event.currentTarget);
    const strRol = String(objFormulario.get("rol") ?? "");

    const camposFaltantes = new Set<string>();
    if (!strInmuebleId) camposFaltantes.add("inmuebleId");
    if (!strCopropietarioId) camposFaltantes.add("copropietarioId");
    if (strRol !== "PROPIETARIO" && strRol !== "INQUILINO") camposFaltantes.add("rol");

    if (camposFaltantes.size > 0) {
      setCamposError(camposFaltantes);
      setStrError(
        !strInmuebleId
          ? "Selecciona un inmueble para continuar."
          : !strCopropietarioId
            ? "Selecciona un copropietario para continuar."
            : "Selecciona un rol (Propietario o Inquilino)."
      );
      return;
    }

    const bolEsPropietario = strRol === "PROPIETARIO";

    const bolYaActivo = residentesDelInmueble.some(
      (ocupante) => ocupante.copropietarioId === strCopropietarioId && ocupante.esPropietario === bolEsPropietario
    );
    if (bolYaActivo) {
      setCamposError(new Set(["copropietarioId"]));
      setStrError("Esta persona ya se encuentra asignada activamente a este inmueble con este rol.");
      return;
    }

    try {
      await asignarOcupante(strInmuebleId, {
        copropietarioId: strCopropietarioId,
        esPropietario: bolEsPropietario,
        fechaInicio: strFechaInicio || undefined,
      });

      setCamposError(new Set());
      setStrError("");
      setStrExito("Persona asignada correctamente.");
      setStrCopropietarioId("");
      setStrFechaInicio(fechaHoyISO());
      event.currentTarget.reset();
      await cargarResidentes(strInmuebleId);
    } catch (error: unknown) {
      setStrError(obtenerMensajeError(error, "Ocurrió un error al asignar a la persona."));
    }
  }

  function abrirDialogoNuevoCopropietario() {
    setStrTelefonoNuevo("");
    setCamposErrorNuevo(new Set());
    setStrErrorNuevo("");
    setBolDialogoNuevoCopropietario(true);
  }

  function handleTelefonoNuevoChange(event: ChangeEvent<HTMLInputElement>) {
    setStrTelefonoNuevo(event.target.value.replace(/[^0-9]/g, ""));
  }

  async function handleCrearCopropietario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const objFormulario = new FormData(event.currentTarget);
    const strNombre = String(objFormulario.get("nombre") ?? "").trim();
    const strApellido = String(objFormulario.get("apellido") ?? "").trim();
    const strCi = String(objFormulario.get("ci") ?? "").trim();
    const strEmail = String(objFormulario.get("email") ?? "").trim();

    const camposFaltantes = new Set<string>();
    if (!strNombre) camposFaltantes.add("nombre");
    if (!strApellido) camposFaltantes.add("apellido");
    if (!strCi) camposFaltantes.add("ci");
    if (strEmail && !esCorreoValido(strEmail)) camposFaltantes.add("email");
    if (strTelefonoNuevo && !esTelefonoValido(strTelefonoNuevo)) camposFaltantes.add("telefono");

    if (camposFaltantes.size > 0) {
      setCamposErrorNuevo(camposFaltantes);
      setStrErrorNuevo("Completa los campos obligatorios destacados.");
      return;
    }

    setBolGuardandoNuevo(true);
    setStrErrorNuevo("");

    try {
      const nuevo = await crearCopropietario({
        nombre: strNombre,
        apellido: strApellido,
        ci: strCi,
        email: strEmail || undefined,
        telefono: strTelefonoNuevo || undefined,
      });

      setCopropietarios((prev) => [nuevo, ...prev]);
      setStrCopropietarioId(nuevo.id);
      limpiarError("copropietarioId");
      setBolDialogoNuevoCopropietario(false);
    } catch (error: unknown) {
      setStrErrorNuevo(obtenerMensajeError(error, "Ocurrió un error al registrar al copropietario."));
    } finally {
      setBolGuardandoNuevo(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Asigna propietarios o inquilinos a un inmueble ya registrado.
      </p>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}

      <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-1">
          <label htmlFor="inmueble" className="text-[12px] font-medium text-foreground">
            Inmueble
          </label>
          <select
            id="inmueble"
            value={strInmuebleId}
            onChange={(event) => {
              setStrInmuebleId(event.target.value);
              limpiarError("inmuebleId");
            }}
            className={claseCampo(camposError.has("inmuebleId")) + " sm:max-w-xs"}
          >
            <option value="">Selecciona un inmueble activo...</option>
            {inmueblesActivos.map((inmueble) => (
              <option key={inmueble.id} value={inmueble.id}>
                {inmueble.codigo} · {inmueble.tipoInmueble.nombre}
              </option>
            ))}
          </select>
          {!bolLoading && inmuebles.length === 0 && (
            <p className="font-caption mt-1 text-[11px] leading-[1.3] text-muted-foreground">
              Todavía no hay inmuebles registrados — ve a &quot;Inmuebles&quot; para crear uno primero.
            </p>
          )}
        </div>

        {inmuebleSeleccionado && (
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">Código:</span> {inmuebleSeleccionado.codigo}
            </span>
            <span>
              <span className="font-medium text-foreground">Tipo:</span> {inmuebleSeleccionado.tipoInmueble.nombre}
            </span>
            <span>
              <span className="font-medium text-foreground">Piso:</span> {inmuebleSeleccionado.piso || "—"}
            </span>
            <span>
              <span className="font-medium text-foreground">Área m²:</span> {inmuebleSeleccionado.areaM2 || "—"}
            </span>
          </div>
        )}

        {bolPuedeAsignar && (
          <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1 lg:col-span-2">
                <label htmlFor="copropietario" className="text-[12px] font-medium text-foreground">
                  Copropietario
                </label>
                <input
                  placeholder="Buscar por nombre o CI..."
                  value={strBusquedaCopropietario}
                  onChange={(event) => setStrBusquedaCopropietario(event.target.value)}
                  className={claseCampo(false) + " mb-1"}
                />
                <div className="flex gap-2">
                  <select
                    id="copropietario"
                    value={strCopropietarioId}
                    onChange={(event) => {
                      setStrCopropietarioId(event.target.value);
                      limpiarError("copropietarioId");
                    }}
                    className={claseCampo(camposError.has("copropietarioId"))}
                  >
                    <option value="">Selecciona un copropietario...</option>
                    {copropietariosFiltrados.map((copropietario) => (
                      <option key={copropietario.id} value={copropietario.id}>
                        {copropietario.nombre} {copropietario.apellido} · CI {copropietario.ci}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={abrirDialogoNuevoCopropietario}
                    className="font-caption h-9 shrink-0 whitespace-nowrap rounded-lg border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    + Nuevo
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="rol" className="text-[12px] font-medium text-foreground">
                  Rol
                </label>
                <select
                  id="rol"
                  name="rol"
                  defaultValue=""
                  onChange={() => limpiarError("rol")}
                  className={claseCampo(camposError.has("rol"))}
                >
                  <option value="" disabled>
                    Selecciona un rol...
                  </option>
                  <option value="PROPIETARIO">Propietario</option>
                  <option value="INQUILINO">Inquilino</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="fechaInicio" className="text-[12px] font-medium text-foreground">
                  Fecha de inicio de ocupación
                </label>
                <input
                  id="fechaInicio"
                  type="date"
                  value={strFechaInicio}
                  onChange={(event) => setStrFechaInicio(event.target.value)}
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
                Asignar
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-subtitle text-[15px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Residentes actuales {inmuebleSeleccionado ? `— ${inmuebleSeleccionado.codigo}` : ""}
          </h2>
          {inmuebleSeleccionado && (
            <Link
              href={`/admin/inmuebles/${inmuebleSeleccionado.id}`}
              className="font-caption text-[12px] font-medium text-primary hover:text-primary/80"
            >
              Ver historial completo →
            </Link>
          )}
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Nombre</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Teléfono</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Correo</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Rol</th>
            </tr>
          </thead>
          <tbody>
            {bolCargandoResidentes && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  Cargando residentes...
                </td>
              </tr>
            )}
            {!bolCargandoResidentes &&
              residentesDelInmueble.map((ocupante) => {
                const copropietario = obtenerCopropietarioPorId(ocupante.copropietarioId);
                return (
                  <tr key={ocupante.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3 text-[13px] text-foreground">
                      {ocupante.copropietario.nombre} {ocupante.copropietario.apellido}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-muted-foreground tabular-nums">
                      {copropietario?.telefono || "—"}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-muted-foreground">{copropietario?.email || "—"}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          ocupante.esPropietario ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {etiquetaRol(ocupante.esPropietario)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            {!bolCargandoResidentes && residentesDelInmueble.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  {strInmuebleId ? "Este inmueble todavía no tiene residentes asignados." : "Selecciona un inmueble para ver sus residentes."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={bolDialogoNuevoCopropietario} onOpenChange={setBolDialogoNuevoCopropietario}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              Registrar copropietario
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCrearCopropietario} autoComplete="off" className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="nombre" className="text-[12px] font-medium text-foreground">
                  Nombre
                </label>
                <input
                  id="nombre"
                  name="nombre"
                  autoComplete="off"
                  className={claseCampo(camposErrorNuevo.has("nombre"))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="apellido" className="text-[12px] font-medium text-foreground">
                  Apellido
                </label>
                <input
                  id="apellido"
                  name="apellido"
                  autoComplete="off"
                  className={claseCampo(camposErrorNuevo.has("apellido"))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ci" className="text-[12px] font-medium text-foreground">
                  CI
                </label>
                <input id="ci" name="ci" autoComplete="off" className={claseCampo(camposErrorNuevo.has("ci"))} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="telefono" className="text-[12px] font-medium text-foreground">
                  Teléfono <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="telefono"
                  name="telefono"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Solo números"
                  value={strTelefonoNuevo}
                  onChange={handleTelefonoNuevoChange}
                  className={claseCampo(camposErrorNuevo.has("telefono"))}
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="email" className="text-[12px] font-medium text-foreground">
                  Correo electrónico <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  placeholder="nombre@correo.com"
                  className={claseCampo(camposErrorNuevo.has("email"))}
                />
              </div>
            </div>

            {strErrorNuevo && (
              <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                {strErrorNuevo}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBolDialogoNuevoCopropietario(false)}
                disabled={bolGuardandoNuevo}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={bolGuardandoNuevo}>
                {bolGuardandoNuevo ? "Guardando..." : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
