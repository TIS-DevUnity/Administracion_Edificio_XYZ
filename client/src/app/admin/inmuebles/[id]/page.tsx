"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { Button, Spinner } from "@/components/ui/button";
import { Copropietario, listarCopropietarios } from "@/lib/copropietarios";
import {
  CLASES_INMUEBLE,
  ClaseInmueble,
  ETIQUETA_CLASE,
  Inmueble,
  Ocupante,
  TipoInmueble,
  actualizarInmueble,
  darDeBajaOcupante,
  esDepartamento,
  esOcupanteActivo,
  etiquetaClasificacion,
  etiquetaRol,
  formatearBs,
  formatearFecha,
  listarOcupantes,
  listarTiposInmueble,
  motivoExpensa,
  obtenerInmueble,
  obtenerMensajeError,
} from "@/lib/inmuebles";

const CLASE_CAMPO =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15";

const CLASE_DT = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";

type Tab = "datos" | "historial";

function BadgeRol({ bolEsPropietario }: { bolEsPropietario: boolean }) {
  return (
    <span
      className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
        bolEsPropietario ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {etiquetaRol(bolEsPropietario)}
    </span>
  );
}

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

  const [tiposInmueble, setTiposInmueble] = useState<TipoInmueble[]>([]);
  // El endpoint de ocupantes no trae teléfono ni correo: se cruzan con la lista de copropietarios.
  const [contactos, setContactos] = useState<Map<string, Copropietario>>(new Map());
  const [bolDialogoEditar, setBolDialogoEditar] = useState(false);
  const [strClaseEdicion, setStrClaseEdicion] = useState<ClaseInmueble>("DEPARTAMENTO");
  const [strTipoEdicion, setStrTipoEdicion] = useState("");
  const [strErrorEdicion, setStrErrorEdicion] = useState("");
  const [bolGuardandoEdicion, setBolGuardandoEdicion] = useState(false);
  const [bolCambiandoEstado, setBolCambiandoEstado] = useState(false);
  const [strExito, setStrExito] = useState("");

  const bolPuedeCambiarEstado = puedeEjecutar(rol, "inmuebles", "eliminar");
  const bolPuedeEditar = puedeEjecutar(rol, "inmuebles", "editar");
  const bolPuedeDarBaja = puedeEjecutar(rol, "residentes", "editar");

  async function cargarInmueble() {
    if (!strId) return;
    try {
      setBolLoading(true);
      setStrErrorCarga("");
      const [objInmueble, arrHistorial, arrTipos, arrCopropietarios] = await Promise.all([
        obtenerInmueble(strId),
        listarOcupantes(strId),
        listarTiposInmueble(),
        listarCopropietarios(),
      ]);
      setInmueble(objInmueble);
      setHistorial(arrHistorial);
      setTiposInmueble(arrTipos);
      setContactos(new Map(arrCopropietarios.map((copropietario) => [copropietario.id, copropietario])));
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

    setBolCambiandoEstado(true);
    try {
      await actualizarInmueble(inmueble.id, { activo: !inmueble.activo });
      await cargarInmueble();
    } catch (error: unknown) {
      setStrMensajePermiso(obtenerMensajeError(error, "Ocurrió un error al cambiar el estado del inmueble."));
    } finally {
      setBolCambiandoEstado(false);
    }
  }

  function abrirDialogoEditar() {
    if (!inmueble) return;
    setStrClaseEdicion(inmueble.clase);
    setStrTipoEdicion(inmueble.tipoInmuebleId ?? "");
    setStrErrorEdicion("");
    setBolDialogoEditar(true);
  }

  async function handleGuardarEdicion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inmueble) return;

    const objValidacion = validarAccion(rol, "inmuebles", "editar");
    if (!objValidacion.permitido) {
      setStrErrorEdicion(objValidacion.mensaje);
      return;
    }

    const objFormulario = new FormData(event.currentTarget);
    const strCodigo = String(objFormulario.get("codigoEdicion") ?? "").trim();
    const strPiso = String(objFormulario.get("pisoEdicion") ?? "").trim();
    const strAreaM2 = String(objFormulario.get("areaEdicion") ?? "").trim();
    const bolDepto = strClaseEdicion === "DEPARTAMENTO";

    if (!strCodigo || !strPiso) {
      setStrErrorEdicion(!strCodigo ? "El código es obligatorio." : "La ubicación (piso) es obligatoria.");
      return;
    }
    if (bolDepto && !strTipoEdicion) {
      setStrErrorEdicion("Selecciona el tipo de departamento (A, B, C...).");
      return;
    }

    setBolGuardandoEdicion(true);
    setStrErrorEdicion("");

    try {
      await actualizarInmueble(inmueble.id, {
        codigo: strCodigo,
        clase: strClaseEdicion,
        tipoInmuebleId: bolDepto ? strTipoEdicion : undefined,
        piso: strPiso || undefined,
        areaM2: strAreaM2 ? Number(strAreaM2) : undefined,
      });
      setBolDialogoEditar(false);
      setStrExito("Cambios guardados.");
      await cargarInmueble();
    } catch (error: unknown) {
      setStrErrorEdicion(obtenerMensajeError(error, "Ocurrió un error al guardar los cambios."));
    } finally {
      setBolGuardandoEdicion(false);
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
      setStrExito(
        `Asociación retirada: ${ocupanteParaBaja.copropietario.nombre} ${ocupanteParaBaja.copropietario.apellido} ya no está vigente en ${inmueble.codigo}. Queda registrada en el historial.`
      );
      setOcupanteParaBaja(null);
      await cargarInmueble();
    } catch (error: unknown) {
      setStrErrorBaja(obtenerMensajeError(error, "Ocurrió un error al dar de baja al ocupante."));
    } finally {
      setBolGuardandoBaja(false);
    }
  }

  const ocupantesVigentes = historial.filter(esOcupanteActivo);

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

      <div className="mb-4 mt-1 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
            {inmueble.codigo}
          </h1>
          <BadgeTipoInmueble inmueble={inmueble} />
        </div>
        <span
          className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
            inmueble.activo ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"
          }`}
        >
          {inmueble.activo ? "Activo" : "Inactivo"}
        </span>
      </div>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}
      {strExito && (
        <div className="mb-4 rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">
          {strExito}
        </div>
      )}

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
        <>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className={CLASE_DT}>Código</dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.codigo}</dd>
            </div>
            <div>
              <dt className={CLASE_DT}>Clase</dt>
              <dd className="mt-1 text-[14px] text-foreground">{ETIQUETA_CLASE[inmueble.clase]}</dd>
            </div>
            <div>
              <dt className={CLASE_DT}>Clasificación</dt>
              <dd className="mt-1 text-[14px] text-foreground">
                {esDepartamento(inmueble) ? etiquetaClasificacion(inmueble.tipoInmueble.nombre) : "No aplica"}
              </dd>
            </div>
            <div>
              <dt className={CLASE_DT}>Expensa fija mensual</dt>
              <dd className="mt-1 text-[14px] tabular-nums text-foreground">
                {esDepartamento(inmueble) ? formatearBs(inmueble.tipoInmueble.montoBase) : "No paga"}
              </dd>
            </div>
            <div>
              <dt className={CLASE_DT}>Peso en el reparto de agua</dt>
              <dd className="mt-1 text-[14px] text-foreground">
                {esDepartamento(inmueble) ? Number(inmueble.tipoInmueble.pesoAgua) : "No aplica"}
              </dd>
            </div>
            <div>
              <dt className={CLASE_DT}>Ubicación (piso)</dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.piso || "—"}</dd>
            </div>
            <div>
              <dt className={CLASE_DT}>Área m²</dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.areaM2 || "—"}</dd>
            </div>
            <div>
              <dt className={CLASE_DT}>Ocupación</dt>
              <dd className="mt-1 text-[14px] text-foreground">
                {inmueble.asignado ? "Con propietario/inquilino" : "Sin asignar"}
              </dd>
            </div>
          </dl>

          {(() => {
            const { paga, motivo } = motivoExpensa(inmueble);
            return (
              <div
                className={`mt-5 rounded-lg border px-3 py-2 text-[13px] ${
                  paga
                    ? "border-success/20 bg-success-subtle text-success"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <span className="font-medium">{paga ? "Genera expensa." : "No genera expensa."}</span> {motivo}
              </div>
            );
          })()}

          <div className="mt-5 flex flex-wrap gap-3">
            {bolPuedeEditar && (
              <button
                type="button"
                onClick={abrirDialogoEditar}
                className="flex h-9 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Editar datos
              </button>
            )}

            {bolPuedeCambiarEstado && (
              <button
                type="button"
                onClick={handleAlternarEstado}
                disabled={bolCambiandoEstado}
                className="flex h-9 items-center justify-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-70"
              >
                {bolCambiandoEstado && <Spinner />}
                {inmueble.activo ? "Desactivar inmueble" : "Activar inmueble"}
              </button>
            )}

            <Link
              href={`/admin/morosidad?q=${encodeURIComponent(inmueble.codigo)}`}
              className="flex h-9 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              Ver expensas de este inmueble
            </Link>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="font-subtitle text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">
              Personas asociadas ({ocupantesVigentes.length})
            </h2>
            {bolPuedeDarBaja && inmueble.activo && (
              <Link
                href={`/admin/residentes?inmuebleId=${inmueble.id}`}
                className="font-caption whitespace-nowrap text-[12px] font-medium text-primary hover:text-primary/80"
              >
                + Asignar persona
              </Link>
            )}
          </div>
          {ocupantesVigentes.length === 0 ? (
            <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">
              Este inmueble no tiene personas asociadas actualmente.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {["Nombre completo", "Teléfono", "Correo", "Rol", "Desde", ""].map((strTitulo) => (
                    <th key={strTitulo} className={`${CLASE_DT} px-5 py-2.5 text-left`}>
                      {strTitulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ocupantesVigentes.map((registro) => {
                  const contacto = contactos.get(registro.copropietarioId);
                  return (
                    <tr key={registro.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 text-[13px] text-foreground">
                        {registro.copropietario.nombre} {registro.copropietario.apellido}
                        <span className="font-caption block text-[11px] text-muted-foreground">
                          CI {registro.copropietario.ci}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[13px] tabular-nums text-muted-foreground">
                        {contacto?.telefono || "—"}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-muted-foreground">{contacto?.email || "—"}</td>
                      <td className="px-5 py-3">
                        <BadgeRol bolEsPropietario={registro.esPropietario} />
                      </td>
                      <td className="px-5 py-3 text-[13px] text-muted-foreground">
                        {formatearFecha(registro.fechaInicio)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {bolPuedeDarBaja && (
                          <button
                            type="button"
                            onClick={() => abrirDialogoBaja(registro)}
                            className="font-caption text-[12px] font-medium text-destructive hover:text-destructive/80"
                          >
                            Retirar asociación
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        </>
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
                      <BadgeRol bolEsPropietario={registro.esPropietario} />
                      {bolActivo ? (
                        <span className="font-caption inline-flex rounded-full bg-accent-secondary/10 px-2 py-0.5 text-[11px] font-medium text-accent-secondary">
                          Vigente
                        </span>
                      ) : (
                        <span className="font-caption inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Finalizada
                        </span>
                      )}
                    </div>

                    <p className="font-caption mt-1 text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                      Inicio: {formatearFecha(registro.fechaInicio)} · Fin:{" "}
                      {bolActivo ? "vigente" : formatearFecha(registro.fechaFin as string)}
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
                        Retirar asociación
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      <Dialog open={bolDialogoEditar} onOpenChange={setBolDialogoEditar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              Editar {inmueble.codigo}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              Cambiar el tipo solo afecta a las expensas que se generen después.
            </DialogDescription>
          </DialogHeader>

          {bolDialogoEditar && (
            <form onSubmit={handleGuardarEdicion} autoComplete="off" className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="codigoEdicion" className="text-[12px] font-medium text-foreground">
                    Código
                  </label>
                  <input id="codigoEdicion" name="codigoEdicion" defaultValue={inmueble.codigo} className={CLASE_CAMPO} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="claseEdicion" className="text-[12px] font-medium text-foreground">
                    Clase
                  </label>
                  <select
                    id="claseEdicion"
                    value={strClaseEdicion}
                    onChange={(event) => setStrClaseEdicion(event.target.value as ClaseInmueble)}
                    className={CLASE_CAMPO}
                  >
                    {CLASES_INMUEBLE.map((clase) => (
                      <option key={clase} value={clase}>
                        {ETIQUETA_CLASE[clase]}
                      </option>
                    ))}
                  </select>
                </div>
                {strClaseEdicion === "DEPARTAMENTO" && (
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label htmlFor="tipoEdicion" className="text-[12px] font-medium text-foreground">
                      Tipo de departamento
                    </label>
                    <select
                      id="tipoEdicion"
                      value={strTipoEdicion}
                      onChange={(event) => setStrTipoEdicion(event.target.value)}
                      className={CLASE_CAMPO}
                    >
                      <option value="" disabled>
                        Selecciona A, B, C...
                      </option>
                      {tiposInmueble.map((tipo) => (
                        <option key={tipo.id} value={tipo.id}>
                          {etiquetaClasificacion(tipo.nombre)} — {formatearBs(tipo.montoBase)}/mes
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label htmlFor="pisoEdicion" className="text-[12px] font-medium text-foreground">
                    Ubicación (piso)
                  </label>
                  <input id="pisoEdicion" name="pisoEdicion" defaultValue={inmueble.piso ?? ""} className={CLASE_CAMPO} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="areaEdicion" className="text-[12px] font-medium text-foreground">
                    Área m² <span className="text-muted-foreground">(opcional)</span>
                  </label>
                  <input
                    id="areaEdicion"
                    name="areaEdicion"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={inmueble.areaM2 ? Number(inmueble.areaM2) : ""}
                    className={CLASE_CAMPO}
                  />
                </div>
              </div>

              {strClaseEdicion !== "DEPARTAMENTO" && (
                <p className="font-caption text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  Bauleras y parqueos no tienen tipo y no pagan expensa.
                </p>
              )}

              {strErrorEdicion && (
                <p className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strErrorEdicion}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBolDialogoEditar(false)}
                  disabled={bolGuardandoEdicion}
                >
                  Cancelar
                </Button>
                <Button type="submit" cargando={bolGuardandoEdicion}>
                  {bolGuardandoEdicion ? "Guardando..." : "Guardar cambios"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={ocupanteParaBaja !== null} onOpenChange={(bolOpen) => !bolOpen && cerrarDialogoBaja()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title text-[18px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              Retirar asociación
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.45] text-muted-foreground">
              {ocupanteParaBaja &&
                `¿Confirmas retirar a ${ocupanteParaBaja.copropietario.nombre} ${ocupanteParaBaja.copropietario.apellido} (${etiquetaRol(ocupanteParaBaja.esPropietario).toLowerCase()}) de ${inmueble.codigo}? No se elimina a la persona ni al inmueble: la asociación queda como finalizada en el historial.`}
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
            <Button variant="destructive" onClick={handleConfirmarBaja} cargando={bolGuardandoBaja}>
              {bolGuardandoBaja ? "Retirando..." : "Retirar asociación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
