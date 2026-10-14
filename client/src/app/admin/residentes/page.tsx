"use client";

import { FormEvent, KeyboardEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, Search, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import {
  DialogoRegistrarPersona,
  ListaInmueblesSeleccionables,
  asignarAVarios,
} from "@/components/DialogoRegistrarPersona";
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
import { Button, Spinner } from "@/components/ui/button";
import {
  CampoPersona,
  Copropietario,
  InmueblesDePersona,
  listarCopropietarios,
  listarInmueblesDeCopropietario,
} from "@/lib/copropietarios";
import { BadgeTipoInmueble } from "@/components/BadgeTipoInmueble";
import {
  CLASES_INMUEBLE,
  ETIQUETA_CLASE,
  Inmueble,
  Ocupante,
  darDeBajaOcupante,
  esDepartamento,
  esOcupanteActivo,
  etiquetaRol,
  etiquetaTipoInmueble,
  formatearBs,
  listarInmuebles,
  listarOcupantes,
  motivoExpensa,
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
  const [bolAsignando, setBolAsignando] = useState(false);
  const [objPrefillNuevo, setObjPrefillNuevo] = useState<Partial<Record<CampoPersona, string>>>({});
  const [strFechaInicio, setStrFechaInicio] = useState(fechaHoyISO());
  const [camposError, setCamposError] = useState<Set<string>>(new Set());
  const [strError, setStrError] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [strExito, setStrExito] = useState("");

  const [bolDialogoNuevoCopropietario, setBolDialogoNuevoCopropietario] = useState(false);
  const [strRolAsignacion, setStrRolAsignacion] = useState<"" | "PROPIETARIO" | "INQUILINO">("");
  const [ocupanteParaRetirar, setOcupanteParaRetirar] = useState<Ocupante | null>(null);
  const [bolRetirando, setBolRetirando] = useState(false);

  const [seleccionados, setSeleccionados] = useState<Set<string>>(
    () => new Set(strInmuebleIdInicial ? [strInmuebleIdInicial] : [])
  );
  const [inmueblesDePersona, setInmueblesDePersona] = useState<InmueblesDePersona | null>(null);
  // Ocupantes vigentes de cada inmueble marcado, para avisar si la asignación reemplaza a alguien.
  const [ocupantesPorInmueble, setOcupantesPorInmueble] = useState<Record<string, Ocupante[]>>({});
  const [objAvisoConsulta, setObjAvisoConsulta] = useState<{ bolError: boolean; strTexto: string } | null>(null);
  const [bolDialogoInmuebles, setBolDialogoInmuebles] = useState(false);
  // Copia de trabajo del cuadro: "Cancelar" la descarta sin tocar la selección del formulario.
  const [borradorSeleccion, setBorradorSeleccion] = useState<Set<string>>(new Set());

  function abrirDialogoInmuebles() {
    setBorradorSeleccion(new Set(seleccionados));
    setBolDialogoInmuebles(true);
  }

  const bolPuedeRetirar = puedeEjecutar(rol, "residentes", "editar");
  const inmueblesActivos = inmuebles.filter((inmueble) => inmueble.activo);
  const inmuebleSeleccionado = inmuebles.find((inmueble) => inmueble.id === strInmuebleId) ?? null;

  // No se puede volver a asociar a la persona a un inmueble con el mismo rol que ya tiene vigente.
  const idsYaAsociados = useMemo(
    () =>
      new Set(
        (inmueblesDePersona?.vigentes ?? [])
          .filter((item) => !strRolAsignacion || item.rol === strRolAsignacion)
          .map((item) => item.inmuebleId)
      ),
    [inmueblesDePersona, strRolAsignacion]
  );

  // El backend deja un solo propietario y un solo inquilino vigentes por inmueble: asignar otro
  // con el mismo rol cierra la asociación anterior (inmuebles.service.js → asignarOcupante).
  const reemplazos = strRolAsignacion
    ? [...seleccionados].flatMap((strId) => {
        const ocupante = (ocupantesPorInmueble[strId] ?? []).find(
          (o) => o.esPropietario === (strRolAsignacion === "PROPIETARIO") && o.copropietarioId !== strCopropietarioId
        );
        const inmueble = inmuebles.find((i) => i.id === strId);
        return ocupante && inmueble ? [{ inmueble, ocupante }] : [];
      })
    : [];

  useEffect(() => {
    if (!strCopropietarioId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInmueblesDePersona(null);
      return;
    }
    let bolCancelado = false;
    listarInmueblesDeCopropietario(strCopropietarioId)
      .then((datos) => !bolCancelado && setInmueblesDePersona(datos))
      .catch(() => !bolCancelado && setInmueblesDePersona(null));
    return () => {
      bolCancelado = true;
    };
  }, [strCopropietarioId]);

  useEffect(() => {
    const faltantes = [...seleccionados].filter((strId) => !(strId in ocupantesPorInmueble));
    if (faltantes.length === 0) return;
    Promise.all(faltantes.map((strId) => listarOcupantes(strId).then((arr) => [strId, arr.filter(esOcupanteActivo)] as const)))
      .then((pares) => setOcupantesPorInmueble((prev) => ({ ...prev, ...Object.fromEntries(pares) })))
      .catch(() => undefined);
  }, [seleccionados, ocupantesPorInmueble]);

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

    const strRol = strRolAsignacion;

    const camposFaltantes = new Set<string>();
    if (!strCopropietarioId) camposFaltantes.add("copropietarioId");
    if (strRol !== "PROPIETARIO" && strRol !== "INQUILINO") camposFaltantes.add("rol");
    if (seleccionados.size === 0) camposFaltantes.add("inmuebles");

    if (camposFaltantes.size > 0 || !strRol) {
      setCamposError(camposFaltantes);
      setStrError(
        !strCopropietarioId
          ? "Selecciona un copropietario para continuar."
          : !strRol
            ? "Selecciona un rol (Propietario o Inquilino)."
            : "Selecciona al menos un inmueble (departamento, baulera o parqueo)."
      );
      return;
    }

    const persona = obtenerCopropietarioPorId(strCopropietarioId);
    const strNombre = persona ? `${persona.nombre} ${persona.apellido}` : "La persona";

    const duplicados = [...seleccionados].filter((strId) => idsYaAsociados.has(strId));
    if (duplicados.length > 0) {
      const strCodigos = duplicados.map((strId) => inmuebles.find((i) => i.id === strId)?.codigo ?? strId).join(", ");
      setCamposError(new Set(["inmuebles"]));
      setStrError(
        `${strNombre} ya se encuentra asociada como ${strRol === "PROPIETARIO" ? "propietario" : "inquilino"} a: ${strCodigos}.`
      );
      return;
    }

    setBolAsignando(true);
    try {
      const elegidos = inmuebles.filter((inmueble) => seleccionados.has(inmueble.id));
      const { asignados, errores } = await asignarAVarios(strCopropietarioId, elegidos, strRol, strFechaInicio);

      setCamposError(new Set());
      setStrError(errores.length > 0 ? `No se pudo asignar ${errores.join("; ")}.` : "");
      if (asignados.length > 0) {
        setStrExito(
          `Asignación registrada con éxito: ${strNombre} como ${strRol === "PROPIETARIO" ? "propietario" : "inquilino"} de ${asignados.join(", ")}.`
        );
        setSeleccionados(new Set());
        setStrRolAsignacion("");
        setStrFechaInicio(fechaHoyISO());
        setOcupantesPorInmueble({});
      }

      // Se recargan los inmuebles para refrescar `asignado` (define si genera expensa).
      const [arrInmuebles, datosPersona] = await Promise.all([
        listarInmuebles(),
        listarInmueblesDeCopropietario(strCopropietarioId),
        cargarResidentes(strInmuebleId),
      ]);
      setInmuebles(arrInmuebles);
      setInmueblesDePersona(datosPersona);
    } catch (error: unknown) {
      setStrError(obtenerMensajeError(error, "Ocurrió un error al asignar a la persona."));
    } finally {
      setBolAsignando(false);
    }
  }

  function abrirDialogoNuevoCopropietario(strTexto: string) {
    const strLimpio = strTexto.trim();
    // Si escribió un CI (tiene dígitos y no espacios) se precarga en CI; si no, se reparte en nombre/apellido.
    if (strLimpio && /\d/.test(strLimpio) && !/\s/.test(strLimpio)) {
      setObjPrefillNuevo({ nombre: "", apellido: "", ci: strLimpio });
    } else {
      const [strNombre = "", ...arrResto] = strLimpio.split(/\s+/);
      setObjPrefillNuevo({ nombre: strNombre, apellido: arrResto.join(" "), ci: "" });
    }
    setBolDialogoNuevoCopropietario(true);
  }

  function handlePersonaRegistrada(nuevo: Copropietario, strMensaje: string) {
    setCopropietarios((prev) => [nuevo, ...prev]);
    setStrCopropietarioId(nuevo.id);
    limpiarError("copropietarioId");
    setStrError("");
    setStrExito(`${strMensaje} Ahora elige su rol, sus inmuebles y presiona "Asignar".`);
    setBolDialogoNuevoCopropietario(false);
  }

  async function handleConfirmarRetiro() {
    if (!ocupanteParaRetirar || !inmuebleSeleccionado) return;

    const objValidacion = validarAccion(rol, "residentes", "editar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      setOcupanteParaRetirar(null);
      return;
    }

    setBolRetirando(true);
    try {
      await darDeBajaOcupante(inmuebleSeleccionado.id, ocupanteParaRetirar.id, {});
      setObjAvisoConsulta({
        bolError: false,
        strTexto: `Asociación retirada: ${ocupanteParaRetirar.copropietario.nombre} ${ocupanteParaRetirar.copropietario.apellido} ya no está vigente en ${inmuebleSeleccionado.codigo}. Queda en el historial.`,
      });
      setOcupanteParaRetirar(null);
      setOcupantesPorInmueble({});
      const [arrInmuebles] = await Promise.all([listarInmuebles(), cargarResidentes(inmuebleSeleccionado.id)]);
      setInmuebles(arrInmuebles);
      if (strCopropietarioId) setInmueblesDePersona(await listarInmueblesDeCopropietario(strCopropietarioId));
    } catch (error: unknown) {
      setObjAvisoConsulta({ bolError: true, strTexto: obtenerMensajeError(error, "Ocurrió un error al retirar la asociación.") });
      setOcupanteParaRetirar(null);
    } finally {
      setBolRetirando(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Asigna propietarios o inquilinos a uno o varios inmuebles: un departamento, una baulera, un parqueo o cualquier
        combinación de ellos.
      </p>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}

      {bolPuedeAsignar && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-subtitle mb-4 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Asignar persona a inmuebles
          </h2>

          <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1 lg:col-span-2">
                <label htmlFor="copropietario" className="text-[12px] font-medium text-foreground">
                  1. Persona
                </label>
                <SelectorCopropietario
                  copropietarios={copropietarios}
                  strSeleccionadoId={strCopropietarioId}
                  bolError={camposError.has("copropietarioId")}
                  onSeleccionar={(strId) => {
                    setStrCopropietarioId(strId);
                    limpiarError("copropietarioId");
                  }}
                  onCrear={abrirDialogoNuevoCopropietario}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="rol" className="text-[12px] font-medium text-foreground">
                  2. Rol
                </label>
                <select
                  id="rol"
                  value={strRolAsignacion}
                  onChange={(event) => {
                    setStrRolAsignacion(event.target.value as "PROPIETARIO" | "INQUILINO");
                    limpiarError("rol");
                  }}
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
                  Fecha de inicio
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

            {inmueblesDePersona && inmueblesDePersona.vigentes.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">Ya tiene asignados:</span>
                {inmueblesDePersona.vigentes.map((item) => (
                  <span
                    key={item.ocupanteId}
                    className="font-caption inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {item.codigo} · {ETIQUETA_CLASE[item.clase]} · {item.rol === "PROPIETARIO" ? "Propietario" : "Inquilino"}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-[12px] font-medium text-foreground">3. Inmuebles</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  aria-invalid={camposError.has("inmuebles") || undefined}
                  onClick={abrirDialogoInmuebles}
                  disabled={!bolLoading && inmueblesActivos.length === 0}
                >
                  <Building2 className="h-4 w-4" />
                  {seleccionados.size === 0 ? "Asignar inmuebles" : `Cambiar selección (${seleccionados.size})`}
                </Button>
                {[...seleccionados].map((strId) => {
                  const inmueble = inmuebles.find((i) => i.id === strId);
                  if (!inmueble) return null;
                  return (
                    <span
                      key={strId}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-[12px] text-foreground"
                    >
                      {inmueble.codigo}
                      <span className="text-muted-foreground">· {etiquetaTipoInmueble(inmueble)}</span>
                      <button
                        type="button"
                        aria-label={`Quitar ${inmueble.codigo}`}
                        onClick={() => {
                          const next = new Set(seleccionados);
                          next.delete(strId);
                          setSeleccionados(next);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
              {camposError.has("inmuebles") && seleccionados.size === 0 && (
                <p className="text-[12px] text-destructive">Elige al menos un inmueble.</p>
              )}
              {!bolLoading && inmueblesActivos.length === 0 && (
                <p className="font-caption text-[11px] leading-[1.3] text-muted-foreground">
                  Todavía no hay inmuebles activos — ve a &quot;Inmuebles&quot; para registrar uno primero.
                </p>
              )}
            </div>

            {seleccionados.size > 0 && (
              <ResumenExpensa inmuebles={inmuebles.filter((inmueble) => seleccionados.has(inmueble.id))} />
            )}

            {reemplazos.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] leading-[1.45] text-muted-foreground">
                <span className="font-medium text-foreground">Atención:</span> el sistema permite un solo{" "}
                {strRolAsignacion === "PROPIETARIO" ? "propietario" : "inquilino"} vigente por inmueble. Al asignar, pasarán
                al historial como finalizados:{" "}
                {reemplazos.map(({ inmueble, ocupante }, intIndice) => (
                  <span key={inmueble.id}>
                    {intIndice > 0 && ", "}
                    <span className="font-medium text-foreground">
                      {ocupante.copropietario.nombre} {ocupante.copropietario.apellido}
                    </span>{" "}
                    en {inmueble.codigo}
                  </span>
                ))}
                .
              </div>
            )}

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
                disabled={bolAsignando}
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 disabled:active:scale-100"
              >
                {bolAsignando && <Spinner />}
                {bolAsignando
                  ? "Asignando..."
                  : `Asignar${seleccionados.size > 1 ? ` ${seleccionados.size} inmuebles` : ""}`}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-subtitle text-[15px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
              Residentes actuales
            </h2>
            {inmuebleSeleccionado && <BadgeTipoInmueble inmueble={inmuebleSeleccionado} />}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="inmueble" className="sr-only">
              Inmueble a consultar
            </label>
            <select
              id="inmueble"
              value={strInmuebleId}
              onChange={(event) => {
                setStrInmuebleId(event.target.value);
                setObjAvisoConsulta(null);
              }}
              className={claseCampo(false) + " sm:w-64"}
            >
              <option value="">Consultar un inmueble...</option>
              {CLASES_INMUEBLE.map((clase) => {
                const arrDeClase = inmuebles.filter((inmueble) => inmueble.clase === clase);
                if (arrDeClase.length === 0) return null;
                return (
                  <optgroup key={clase} label={`${ETIQUETA_CLASE[clase]}s`}>
                    {arrDeClase.map((inmueble) => (
                      <option key={inmueble.id} value={inmueble.id}>
                        {inmueble.codigo} · {etiquetaTipoInmueble(inmueble)}
                        {inmueble.activo ? "" : " (inactivo)"}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            {inmuebleSeleccionado && (
              <Link
                href={`/admin/inmuebles/${inmuebleSeleccionado.id}`}
                className="font-caption whitespace-nowrap text-[12px] font-medium text-primary hover:text-primary/80"
              >
                Historial →
              </Link>
            )}
          </div>
        </div>
        {inmuebleSeleccionado && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-5 py-2.5 text-[12px] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">Expensa fija:</span>{" "}
              {esDepartamento(inmuebleSeleccionado)
                ? `${formatearBs(inmuebleSeleccionado.tipoInmueble.montoBase)}/mes + agua`
                : "No paga"}
            </span>
            <span>
              <span className="font-medium text-foreground">Piso:</span> {inmuebleSeleccionado.piso || "—"}
            </span>
            <span>{motivoExpensa(inmuebleSeleccionado).motivo}</span>
          </div>
        )}
        {objAvisoConsulta && (
          <div
            className={`mx-5 mt-3 rounded-lg border px-3 py-2 text-[13px] ${
              objAvisoConsulta.bolError
                ? "border-destructive/20 bg-danger-subtle text-destructive"
                : "border-success/20 bg-success-subtle text-success"
            }`}
          >
            {objAvisoConsulta.strTexto}
          </div>
        )}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Nombre</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Teléfono</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Correo</th>
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">Rol</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {bolCargandoResidentes && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
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
                    <td className="px-5 py-3 text-right">
                      {bolPuedeRetirar && (
                        <button
                          type="button"
                          onClick={() => setOcupanteParaRetirar(ocupante)}
                          className="font-caption whitespace-nowrap text-[12px] font-medium text-destructive hover:text-destructive/80"
                        >
                          Retirar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            {!bolCargandoResidentes && residentesDelInmueble.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  {strInmuebleId ? "Este inmueble todavía no tiene residentes asignados." : "Selecciona un inmueble para ver sus residentes."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={bolDialogoInmuebles} onOpenChange={setBolDialogoInmuebles}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              Asignar inmuebles
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {obtenerCopropietarioPorId(strCopropietarioId)
                ? `Elige los inmuebles para ${obtenerCopropietarioPorId(strCopropietarioId)?.nombre} ${obtenerCopropietarioPorId(strCopropietarioId)?.apellido}`
                : "Elige uno o varios inmuebles"}
              {strRolAsignacion ? ` como ${strRolAsignacion === "PROPIETARIO" ? "propietario" : "inquilino"}` : ""}: un
              departamento, una baulera, un parqueo o cualquier combinación.
              {strRolAsignacion && idsYaAsociados.size > 0 && " Los que ya tiene con ese rol aparecen deshabilitados."}
            </DialogDescription>
          </DialogHeader>

          <ListaInmueblesSeleccionables
            inmuebles={inmuebles}
            seleccionados={borradorSeleccion}
            setSeleccionados={setBorradorSeleccion}
            idsDeshabilitados={strRolAsignacion ? idsYaAsociados : undefined}
            className="max-h-[50vh]"
          />

          {borradorSeleccion.size > 0 && (
            <ResumenExpensa inmuebles={inmuebles.filter((inmueble) => borradorSeleccion.has(inmueble.id))} />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBolDialogoInmuebles(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={borradorSeleccion.size === 0}
              onClick={() => {
                setSeleccionados(new Set(borradorSeleccion));
                limpiarError("inmuebles");
                setBolDialogoInmuebles(false);
              }}
            >
              Confirmar selección{borradorSeleccion.size > 0 ? ` (${borradorSeleccion.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogoRegistrarPersona
        bolAbierto={bolDialogoNuevoCopropietario}
        onCerrar={() => setBolDialogoNuevoCopropietario(false)}
        prefill={objPrefillNuevo}
        onRegistrado={handlePersonaRegistrada}
      />

      <Dialog open={ocupanteParaRetirar !== null} onOpenChange={(bolOpen) => !bolOpen && setOcupanteParaRetirar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              Retirar asociación
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {ocupanteParaRetirar &&
                `¿Confirmas retirar a ${ocupanteParaRetirar.copropietario.nombre} ${ocupanteParaRetirar.copropietario.apellido} (${etiquetaRol(ocupanteParaRetirar.esPropietario).toLowerCase()}) de ${inmuebleSeleccionado?.codigo ?? "este inmueble"}? No se elimina a la persona ni al inmueble: la asociación queda como finalizada en el historial.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOcupanteParaRetirar(null)} disabled={bolRetirando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmarRetiro} cargando={bolRetirando}>
              {bolRetirando ? "Retirando..." : "Retirar asociación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Lo que pagará de expensa fija cada inmueble elegido (regla actual: solo departamentos). */
function ResumenExpensa({ inmuebles }: { inmuebles: Inmueble[] }) {
  const deptos = inmuebles.filter(esDepartamento);
  const intTotal = deptos.reduce((acc, inmueble) => acc + Number(inmueble.tipoInmueble.montoBase), 0);

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] leading-normal text-muted-foreground">
      <p className="mb-1 font-medium text-foreground">Expensa fija mensual de lo seleccionado</p>
      <ul className="flex flex-col gap-0.5">
        {inmuebles.map((inmueble) => (
          <li key={inmueble.id} className="flex justify-between gap-4">
            <span>
              {inmueble.codigo} · {etiquetaTipoInmueble(inmueble)}
            </span>
            <span className="tabular-nums">
              {esDepartamento(inmueble) ? formatearBs(inmueble.tipoInmueble.montoBase) : "No paga expensa"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 flex justify-between gap-4 border-t border-border pt-1 font-medium text-foreground">
        <span>Total (sin agua)</span>
        <span className="tabular-nums">{formatearBs(intTotal)}</span>
      </p>
    </div>
  );
}

const MAX_SUGERENCIAS = 8;

function normalizar(strTexto: string): string {
  return strTexto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function SelectorCopropietario({
  copropietarios,
  strSeleccionadoId,
  bolError,
  onSeleccionar,
  onCrear,
}: {
  copropietarios: Copropietario[];
  strSeleccionadoId: string;
  bolError: boolean;
  onSeleccionar: (strId: string) => void;
  onCrear: (strTexto: string) => void;
}) {
  const [strTexto, setStrTexto] = useState("");
  const [bolEscribiendo, setBolEscribiendo] = useState(false);
  const [bolAbierto, setBolAbierto] = useState(false);
  const [intActivo, setIntActivo] = useState(0);
  const refInput = useRef<HTMLInputElement>(null);

  const seleccionado = copropietarios.find((copropietario) => copropietario.id === strSeleccionadoId) ?? null;
  const strValor =
    seleccionado && !bolEscribiendo ? `${seleccionado.nombre} ${seleccionado.apellido} · CI ${seleccionado.ci}` : strTexto;

  const sugerencias = useMemo(() => {
    const strBusqueda = normalizar(strTexto);
    const arrFiltrados = strBusqueda
      ? copropietarios.filter((copropietario) =>
          normalizar(`${copropietario.nombre} ${copropietario.apellido} ${copropietario.ci}`).includes(strBusqueda)
        )
      : copropietarios;
    return arrFiltrados.slice(0, MAX_SUGERENCIAS);
  }, [copropietarios, strTexto]);

  const intTotalOpciones = sugerencias.length + 1; // +1 = "Registrar nuevo"

  function seleccionar(copropietario: Copropietario) {
    onSeleccionar(copropietario.id);
    setStrTexto("");
    setBolEscribiendo(false);
    setBolAbierto(false);
  }

  function crear() {
    setBolAbierto(false);
    setBolEscribiendo(false);
    onCrear(strTexto);
  }

  function limpiar() {
    onSeleccionar("");
    setStrTexto("");
    setBolEscribiendo(true);
    setBolAbierto(true);
    setIntActivo(0);
    refInput.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setBolAbierto(true);
      setIntActivo((intPrevio) =>
        event.key === "ArrowDown"
          ? (intPrevio + 1) % intTotalOpciones
          : (intPrevio - 1 + intTotalOpciones) % intTotalOpciones
      );
    } else if (event.key === "Enter" && bolAbierto) {
      // Sin esto, Enter enviaría el formulario de asignación.
      event.preventDefault();
      if (intActivo < sugerencias.length) seleccionar(sugerencias[intActivo]);
      else crear();
    } else if (event.key === "Escape") {
      setBolAbierto(false);
    }
  }

  const strTextoLimpio = strTexto.trim();

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={refInput}
        id="copropietario"
        role="combobox"
        aria-expanded={bolAbierto}
        aria-controls="lista-copropietarios"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Busca por nombre o CI, o escribe uno nuevo..."
        value={strValor}
        onChange={(event) => {
          setStrTexto(event.target.value);
          setBolEscribiendo(true);
          setBolAbierto(true);
          setIntActivo(0);
          if (strSeleccionadoId) onSeleccionar("");
        }}
        onFocus={() => setBolAbierto(true)}
        onBlur={() => setBolAbierto(false)}
        onKeyDown={handleKeyDown}
        className={`${claseCampo(bolError)} pl-9 ${seleccionado ? "pr-9 font-medium" : ""}`}
      />
      {seleccionado && (
        <button
          type="button"
          onClick={limpiar}
          aria-label="Quitar copropietario seleccionado"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {bolAbierto && (
        <div
          id="lista-copropietarios"
          role="listbox"
          // Evita que el input pierda el foco (y cierre la lista) antes de que el click llegue a la opción.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {sugerencias.length === 0 && strTextoLimpio && (
            <p className="px-2.5 py-2 text-[12px] text-muted-foreground">
              No hay ningún copropietario que coincida con «{strTextoLimpio}».
            </p>
          )}

          {sugerencias.map((copropietario, intIndice) => (
            <button
              key={copropietario.id}
              type="button"
              role="option"
              aria-selected={copropietario.id === strSeleccionadoId}
              onClick={() => seleccionar(copropietario)}
              onMouseEnter={() => setIntActivo(intIndice)}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[13px] ${
                intActivo === intIndice ? "bg-muted" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-foreground">
                  {copropietario.nombre} {copropietario.apellido}
                </span>
                <span className="font-caption block truncate text-[11px] tracking-[0.01em] text-muted-foreground">
                  CI {copropietario.ci}
                  {copropietario.email ? ` · ${copropietario.email}` : ""}
                </span>
              </span>
              {copropietario.id === strSeleccionadoId && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}

          <div className={sugerencias.length > 0 ? "mt-1 border-t border-border pt-1" : ""}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={crear}
              onMouseEnter={() => setIntActivo(sugerencias.length)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-primary ${
                intActivo === sugerencias.length ? "bg-primary/10" : ""
              }`}
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {strTextoLimpio ? `Registrar «${strTextoLimpio}» como nuevo copropietario` : "Registrar nuevo copropietario"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
