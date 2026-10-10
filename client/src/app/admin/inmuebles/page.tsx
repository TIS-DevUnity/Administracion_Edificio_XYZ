"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Building2, Car, Droplets, Package, Pencil, Plus, Search } from "lucide-react";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { BadgeTipoInmueble } from "@/components/BadgeTipoInmueble";
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
  CLASES_INMUEBLE,
  ClaseInmueble,
  ETIQUETA_CLASE,
  Inmueble,
  TipoInmueble,
  actualizarInmueble,
  actualizarTipoInmueble,
  crearInmueble,
  crearTipoInmueble,
  esDepartamento,
  formatearBs,
  listarInmuebles,
  listarTiposInmueble,
  motivoExpensa,
  obtenerMensajeError,
} from "@/lib/inmuebles";

function claseCampo(bolError: boolean) {
  return `h-10 w-full rounded-lg border bg-background px-3 text-[14px] text-foreground outline-none transition-colors focus:ring-4 ${
    bolError
      ? "border-destructive focus:border-destructive focus:ring-destructive/15"
      : "border-input focus:border-primary focus:ring-primary/15"
  }`;
}

const CLASE_TH =
  "font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";

const ICONO_CLASE: Record<ClaseInmueble, typeof Building2> = {
  DEPARTAMENTO: Building2,
  BAULERA: Package,
  PARQUEO: Car,
};

// "TODOS", una clase ("BAULERA"/"PARQUEO") o el id de un tipo de departamento.
type Filtro = string;

export default function InmueblesPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");

  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [tiposInmueble, setTiposInmueble] = useState<TipoInmueble[]>([]);
  const [bolLoading, setBolLoading] = useState(true);
  const [strErrorCarga, setStrErrorCarga] = useState("");
  const [strBusqueda, setStrBusqueda] = useState("");
  const [strFiltro, setStrFiltro] = useState<Filtro>("TODOS");

  const bolPuedeCrear = puedeEjecutar(rol, "inmuebles", "crear");
  const bolPuedeCambiarEstado = puedeEjecutar(rol, "inmuebles", "eliminar");
  // El backend solo deja crear/editar tipos al ADMINISTRADOR (tipos-inmueble.routes.js).
  const bolPuedeGestionarTipos = rol === "ADMINISTRADOR";

  const [strClase, setStrClase] = useState<ClaseInmueble>("DEPARTAMENTO");
  const [strTipoId, setStrTipoId] = useState("");
  const [camposError, setCamposError] = useState<Set<string>>(new Set());
  const [strError, setStrError] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [strExito, setStrExito] = useState("");
  const [objInmuebleInactivoDuplicado, setObjInmuebleInactivoDuplicado] = useState<{
    inmueble: Inmueble;
    piso: string;
    areaM2: string;
  } | null>(null);

  const [objDialogoTipo, setObjDialogoTipo] = useState<{ tipo: TipoInmueble | null } | null>(null);
  const [strErrorTipo, setStrErrorTipo] = useState("");
  const [bolGuardandoTipo, setBolGuardandoTipo] = useState(false);

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

  const conteoPorTipo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const inmueble of inmuebles) {
      if (inmueble.tipoInmuebleId) {
        mapa.set(inmueble.tipoInmuebleId, (mapa.get(inmueble.tipoInmuebleId) ?? 0) + 1);
      }
    }
    return mapa;
  }, [inmuebles]);

  const conteoPorClase = useMemo(() => {
    const mapa: Record<ClaseInmueble, number> = { DEPARTAMENTO: 0, BAULERA: 0, PARQUEO: 0 };
    for (const inmueble of inmuebles) mapa[inmueble.clase] += 1;
    return mapa;
  }, [inmuebles]);

  const inmueblesVisibles = useMemo(() => {
    const strBusquedaNormalizada = strBusqueda.trim().toLowerCase();

    return inmuebles.filter((inmueble) => {
      if (strFiltro !== "TODOS") {
        const bolPorClase = strFiltro === "BAULERA" || strFiltro === "PARQUEO";
        if (bolPorClase ? inmueble.clase !== strFiltro : inmueble.tipoInmuebleId !== strFiltro) return false;
      }
      if (!strBusquedaNormalizada) return true;
      return (
        inmueble.codigo.toLowerCase().includes(strBusquedaNormalizada) ||
        (inmueble.piso ?? "").toLowerCase().includes(strBusquedaNormalizada) ||
        inmueble.tipoInmueble.nombre.toLowerCase().includes(strBusquedaNormalizada) ||
        ETIQUETA_CLASE[inmueble.clase].toLowerCase().includes(strBusquedaNormalizada)
      );
    });
  }, [inmuebles, strBusqueda, strFiltro]);

  const tipoSeleccionado = tiposInmueble.find((tipo) => tipo.id === strTipoId) ?? null;

  function limpiarError(strCampo: string) {
    setCamposError((prev) => {
      const next = new Set(prev);
      next.delete(strCampo);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const objForm = event.currentTarget;
    setStrExito("");
    setObjInmuebleInactivoDuplicado(null);

    const objValidacionPermiso = validarAccion(rol, "inmuebles", "crear");
    if (!objValidacionPermiso.permitido) {
      setStrMensajePermiso(objValidacionPermiso.mensaje);
      return;
    }
    setStrMensajePermiso("");

    const objFormulario = new FormData(objForm);
    const strCodigo = String(objFormulario.get("codigo") ?? "").trim();
    const strPiso = String(objFormulario.get("piso") ?? "").trim();
    const strAreaM2 = String(objFormulario.get("areaM2") ?? "").trim();
    const bolDepto = strClase === "DEPARTAMENTO";

    const camposFaltantes = new Set<string>();
    if (!strCodigo) camposFaltantes.add("codigo");
    if (bolDepto && !strTipoId) camposFaltantes.add("tipoInmuebleId");

    if (camposFaltantes.size > 0) {
      setCamposError(camposFaltantes);
      setStrError(
        camposFaltantes.has("tipoInmuebleId") && camposFaltantes.size === 1
          ? "Selecciona el tipo de departamento (A, B, C...): define cuánto paga de expensa."
          : "Completa los campos obligatorios destacados."
      );
      return;
    }

    try {
      const nuevo = await crearInmueble({
        codigo: strCodigo,
        clase: strClase,
        tipoInmuebleId: bolDepto ? strTipoId : undefined,
        piso: strPiso || undefined,
        areaM2: strAreaM2 ? Number(strAreaM2) : undefined,
      });

      setCamposError(new Set());
      setStrError("");
      setStrExito(
        bolDepto
          ? `Departamento ${nuevo.codigo} (Tipo ${nuevo.tipoInmueble.nombre}) registrado con éxito. Asígnale un propietario o inquilino para que empiece a generar expensa.`
          : `${ETIQUETA_CLASE[strClase]} ${nuevo.codigo} registrado con éxito.`
      );
      objForm.reset();
      setStrTipoId("");
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

  function abrirDialogoTipo(tipo: TipoInmueble | null) {
    setStrErrorTipo("");
    setObjDialogoTipo({ tipo });
  }

  async function handleGuardarTipo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!objDialogoTipo) return;

    if (!bolPuedeGestionarTipos) {
      setStrErrorTipo("Permiso insuficiente: solo el Administrador puede gestionar los tipos de departamento.");
      return;
    }

    const objFormulario = new FormData(event.currentTarget);
    const strNombre = String(objFormulario.get("nombreTipo") ?? "").trim();
    const strMonto = String(objFormulario.get("montoBase") ?? "").trim();
    const strPeso = String(objFormulario.get("pesoAgua") ?? "").trim();

    if (!strNombre || strMonto === "") {
      setStrErrorTipo("El nombre y la expensa fija son obligatorios.");
      return;
    }
    if (Number(strMonto) < 0) {
      setStrErrorTipo("La expensa fija no puede ser negativa.");
      return;
    }
    if (strPeso !== "" && Number(strPeso) <= 0) {
      setStrErrorTipo("El peso de agua debe ser mayor que 0.");
      return;
    }

    setBolGuardandoTipo(true);
    setStrErrorTipo("");

    try {
      const datos = {
        nombre: strNombre,
        montoBase: Number(strMonto),
        pesoAgua: strPeso === "" ? undefined : Number(strPeso),
      };
      if (objDialogoTipo.tipo) {
        await actualizarTipoInmueble(objDialogoTipo.tipo.id, datos);
        setStrExito(`Tipo ${strNombre} actualizado. El cambio se aplica desde la próxima expensa generada.`);
      } else {
        await crearTipoInmueble(datos);
        setStrExito(`Tipo ${strNombre} creado.`);
      }
      setObjDialogoTipo(null);
      await cargarDatos();
    } catch (error: unknown) {
      setStrErrorTipo(obtenerMensajeError(error, "Ocurrió un error al guardar el tipo de departamento."));
    } finally {
      setBolGuardandoTipo(false);
    }
  }

  const filtros: { id: Filtro; etiqueta: string; total: number }[] = [
    { id: "TODOS", etiqueta: "Todos", total: inmuebles.length },
    ...tiposInmueble.map((tipo) => ({
      id: tipo.id,
      etiqueta: `Tipo ${tipo.nombre}`,
      total: conteoPorTipo.get(tipo.id) ?? 0,
    })),
    { id: "BAULERA", etiqueta: "Bauleras", total: conteoPorClase.BAULERA },
    { id: "PARQUEO", etiqueta: "Parqueos", total: conteoPorClase.PARQUEO },
  ];

  return (
    <div className="px-4 py-6 sm:px-6">
      <p className="mb-6 max-w-2xl text-[13px] leading-[1.45] text-muted-foreground">
        Registra los departamentos, parqueos y bauleras del edificio. La expensa mensual depende solo del{" "}
        <span className="font-medium text-foreground">tipo de departamento</span> (A, B, C...) más su parte de la
        factura de agua; bauleras y parqueos no pagan expensa.
      </p>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}

      {/* Tipos de departamento */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
              Tipos de departamento
            </h2>
            <p className="font-caption mt-0.5 text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
              Cada tipo define la expensa fija mensual y su peso en el reparto del agua.
            </p>
          </div>
          {bolPuedeGestionarTipos && (
            <Button variant="outline" size="sm" onClick={() => abrirDialogoTipo(null)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo tipo
            </Button>
          )}
        </div>

        {!bolLoading && tiposInmueble.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">
            Todavía no hay tipos de departamento. {bolPuedeGestionarTipos && "Crea el Tipo A para empezar."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tiposInmueble.map((tipo) => (
              <div
                key={tipo.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3"
              >
                <div className="font-title flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-[20px] font-bold text-primary">
                  {tipo.nombre}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-foreground">
                    {formatearBs(tipo.montoBase)}
                    <span className="text-[12px] font-normal text-muted-foreground"> / mes</span>
                  </p>
                  <p className="font-caption mt-0.5 flex items-center gap-1 text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                    <Droplets className="h-3 w-3" />
                    Peso agua {Number(tipo.pesoAgua)} · {conteoPorTipo.get(tipo.id) ?? 0} depto
                    {(conteoPorTipo.get(tipo.id) ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                {bolPuedeGestionarTipos && (
                  <button
                    type="button"
                    onClick={() => abrirDialogoTipo(tipo)}
                    aria-label={`Editar tipo ${tipo.nombre}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {bolPuedeCrear && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="font-subtitle mb-4 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
            Registrar inmueble
          </h2>

          <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-foreground">¿Qué vas a registrar?</p>
              <div className="grid grid-cols-3 gap-2 sm:inline-grid sm:w-auto">
                {CLASES_INMUEBLE.map((clase) => {
                  const Icono = ICONO_CLASE[clase];
                  const bolActiva = strClase === clase;
                  return (
                    <button
                      key={clase}
                      type="button"
                      onClick={() => {
                        setStrClase(clase);
                        limpiarError("tipoInmuebleId");
                        setStrError("");
                      }}
                      aria-pressed={bolActiva}
                      className={`flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-[13px] font-medium transition-colors ${
                        bolActiva
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icono className="h-4 w-4" />
                      {ETIQUETA_CLASE[clase]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
              <div>
                <label htmlFor="codigo" className="mb-1 block text-[12px] font-medium text-foreground">
                  Código
                </label>
                <input
                  id="codigo"
                  name="codigo"
                  autoComplete="off"
                  placeholder={strClase === "DEPARTAMENTO" ? "Ej. A-101" : strClase === "BAULERA" ? "Ej. BAU-01" : "Ej. PAR-01"}
                  onChange={() => limpiarError("codigo")}
                  className={claseCampo(camposError.has("codigo"))}
                />
              </div>

              {strClase === "DEPARTAMENTO" && (
                <div>
                  <label htmlFor="tipoInmuebleId" className="mb-1 block text-[12px] font-medium text-foreground">
                    Tipo de departamento
                  </label>
                  <select
                    id="tipoInmuebleId"
                    value={strTipoId}
                    onChange={(event) => {
                      setStrTipoId(event.target.value);
                      limpiarError("tipoInmuebleId");
                    }}
                    className={claseCampo(camposError.has("tipoInmuebleId"))}
                  >
                    <option value="" disabled>
                      Selecciona A, B, C...
                    </option>
                    {tiposInmueble.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>
                        Tipo {tipo.nombre} — {formatearBs(tipo.montoBase)}/mes
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="piso" className="mb-1 block text-[12px] font-medium text-foreground">
                  Piso <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input id="piso" name="piso" autoComplete="off" className={claseCampo(false)} />
              </div>

              <div>
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

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] leading-[1.45] text-muted-foreground">
              {strClase !== "DEPARTAMENTO" ? (
                <>
                  Las {strClase === "BAULERA" ? "bauleras" : "parqueos"} no tienen tipo y{" "}
                  <span className="font-medium text-foreground">no pagan expensa</span>.
                </>
              ) : tipoSeleccionado ? (
                <>
                  Expensa mensual estimada:{" "}
                  <span className="font-medium text-foreground">{formatearBs(tipoSeleccionado.montoBase)}</span> fija
                  del Tipo {tipoSeleccionado.nombre} + su parte del agua (peso {Number(tipoSeleccionado.pesoAgua)}).
                  Solo se cobra cuando el departamento tiene un propietario o inquilino asignado.
                </>
              ) : (
                <>Elige el tipo de departamento para ver cuánto pagará de expensa.</>
              )}
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
                Guardar {ETIQUETA_CLASE[strClase].toLowerCase()}
              </button>
            </div>
          </form>
        </div>
      )}

      {!bolPuedeCrear && strExito && (
        <div className="mb-4 rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">
          {strExito}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {filtros.map((filtro) => {
            const bolActivo = strFiltro === filtro.id;
            return (
              <button
                key={filtro.id}
                type="button"
                onClick={() => setStrFiltro(filtro.id)}
                aria-pressed={bolActivo}
                className={`font-caption inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors ${
                  bolActivo
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {filtro.etiqueta}
                <span className="tabular-nums opacity-70">{filtro.total}</span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full lg:w-70">
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
              <th className={CLASE_TH}>Código</th>
              <th className={CLASE_TH}>Tipo</th>
              <th className={CLASE_TH}>Expensa fija</th>
              <th className={CLASE_TH}>Piso</th>
              <th className={CLASE_TH}>Ocupación</th>
              <th className={CLASE_TH}>Estado</th>
              <th className={`${CLASE_TH} text-right`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {bolLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  Cargando inmuebles...
                </td>
              </tr>
            )}
            {!bolLoading && strErrorCarga && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-destructive">
                  {strErrorCarga}
                </td>
              </tr>
            )}
            {!bolLoading &&
              !strErrorCarga &&
              inmueblesVisibles.map((inmueble) => (
                <tr key={inmueble.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                  <td className="px-5 py-3 text-[13px] font-medium text-foreground">{inmueble.codigo}</td>
                  <td className="px-5 py-3">
                    <BadgeTipoInmueble inmueble={inmueble} />
                  </td>
                  <td className="px-5 py-3 text-[13px] tabular-nums text-foreground">
                    {esDepartamento(inmueble) ? (
                      formatearBs(inmueble.tipoInmueble.montoBase)
                    ) : (
                      <span className="text-muted-foreground">No paga</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-muted-foreground">{inmueble.piso || "—"}</td>
                  <td className="px-5 py-3">
                    <BadgeOcupacion inmueble={inmueble} />
                  </td>
                  <td className="px-5 py-3">
                    <BadgeEstado bolActivo={inmueble.activo} />
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
                <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  Todavía no hay inmuebles registrados.
                </td>
              </tr>
            )}
            {!bolLoading && !strErrorCarga && inmuebles.length > 0 && inmueblesVisibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  Ningún inmueble coincide con la búsqueda o el filtro.
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
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col items-start gap-1.5">
                  <p className="font-subtitle text-[15px] font-semibold leading-[1.4] text-foreground">
                    {inmueble.codigo}
                  </p>
                  <BadgeTipoInmueble inmueble={inmueble} />
                </div>
                <BadgeEstado bolActivo={inmueble.activo} />
              </div>

              <div className="my-3 border-t border-border" />

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground">
                    Expensa fija
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium tabular-nums text-foreground">
                    {esDepartamento(inmueble) ? formatearBs(inmueble.tipoInmueble.montoBase) : "No paga"}
                  </p>
                </div>
                <div>
                  <p className="font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground">
                    Piso
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-foreground">{inmueble.piso || "—"}</p>
                </div>
                <div>
                  <p className="font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground">
                    Ocupación
                  </p>
                  <div className="mt-1">
                    <BadgeOcupacion inmueble={inmueble} />
                  </div>
                </div>
              </div>

              <div className="my-3 border-t border-border" />

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
            Ningún inmueble coincide con la búsqueda o el filtro.
          </div>
        )}
      </div>

      <Dialog open={objDialogoTipo !== null} onOpenChange={(bolOpen) => !bolOpen && setObjDialogoTipo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              {objDialogoTipo?.tipo ? `Editar Tipo ${objDialogoTipo.tipo.nombre}` : "Nuevo tipo de departamento"}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {objDialogoTipo?.tipo
                ? "Los cambios solo afectan a las expensas que se generen después; las ya generadas no cambian."
                : "Define la expensa fija mensual y el peso con el que participa en el reparto de la factura de agua."}
            </DialogDescription>
          </DialogHeader>

          {objDialogoTipo && (
            <form
              key={objDialogoTipo.tipo?.id ?? "nuevo"}
              onSubmit={handleGuardarTipo}
              autoComplete="off"
              className="flex flex-col gap-3"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="nombreTipo" className="text-[12px] font-medium text-foreground">
                    Nombre
                  </label>
                  <input
                    id="nombreTipo"
                    name="nombreTipo"
                    maxLength={50}
                    placeholder="Ej. A"
                    defaultValue={objDialogoTipo.tipo?.nombre ?? ""}
                    className={claseCampo(false)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="montoBase" className="text-[12px] font-medium text-foreground">
                    Expensa fija (Bs)
                  </label>
                  <input
                    id="montoBase"
                    name="montoBase"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="300"
                    defaultValue={objDialogoTipo.tipo ? Number(objDialogoTipo.tipo.montoBase) : ""}
                    className={claseCampo(false)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="pesoAgua" className="text-[12px] font-medium text-foreground">
                    Peso agua
                  </label>
                  <input
                    id="pesoAgua"
                    name="pesoAgua"
                    type="number"
                    min="0.001"
                    step="0.001"
                    placeholder="1"
                    defaultValue={objDialogoTipo.tipo ? Number(objDialogoTipo.tipo.pesoAgua) : ""}
                    className={claseCampo(false)}
                  />
                </div>
              </div>
              <p className="font-caption text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Peso agua: con 1 paga una parte normal de la factura; con 1.5 paga 50% más que un tipo de peso 1.
              </p>

              {strErrorTipo && (
                <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strErrorTipo}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setObjDialogoTipo(null)} disabled={bolGuardandoTipo}>
                  Cancelar
                </Button>
                <Button type="submit" cargando={bolGuardandoTipo}>
                  {bolGuardandoTipo ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BadgeEstado({ bolActivo }: { bolActivo: boolean }) {
  return (
    <span
      className={`font-caption inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        bolActivo ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"
      }`}
    >
      {bolActivo ? "Activo" : "Inactivo"}
    </span>
  );
}

function BadgeOcupacion({ inmueble }: { inmueble: Inmueble }) {
  const { paga, motivo } = motivoExpensa(inmueble);
  return (
    <span
      title={motivo}
      className={`font-caption inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
        inmueble.asignado ? "bg-accent-secondary/10 text-accent-secondary" : "bg-muted text-muted-foreground"
      }`}
    >
      {inmueble.asignado ? "Asignado" : "Sin asignar"}
      {esDepartamento(inmueble) && inmueble.activo && !paga && " · sin expensa"}
    </span>
  );
}
