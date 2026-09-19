"use client";

import { ChangeEvent, FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import { RolOcupante, esOcupanteActivo, registrarAsignacion, useAsignaciones, useInmuebles } from "@/lib/inmueblesStore";

function claseCampo(bolError: boolean) {
  return `h-9 w-full rounded-lg border bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:ring-4 ${
    bolError
      ? "border-destructive focus:border-destructive focus:ring-destructive/15"
      : "border-input focus:border-primary focus:ring-primary/15"
  }`;
}

const ETIQUETA_ROL: Record<RolOcupante, string> = {
  PROPIETARIO: "Propietario",
  INQUILINO: "Inquilino",
};

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
  const inmuebles = useInmuebles();
  const asignaciones = useAsignaciones();

  const bolPuedeAsignar = puedeEjecutar(rol, "residentes", "crear");

  const searchParams = useSearchParams();
  const strInmuebleIdInicial = searchParams.get("inmuebleId") ?? "";

  const [strInmuebleId, setStrInmuebleId] = useState(strInmuebleIdInicial);
  const [strTelefono, setStrTelefono] = useState("");
  const [camposError, setCamposError] = useState<Set<string>>(new Set());
  const [strError, setStrError] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [strExito, setStrExito] = useState("");

  const inmueblesActivos = inmuebles.filter((inmueble) => inmueble.activo);
  const inmuebleSeleccionado = inmuebles.find((inmueble) => inmueble.id === strInmuebleId) ?? null;
  const residentesDelInmueble = asignaciones.filter(
    (asignacion) => asignacion.inmuebleId === strInmuebleId && esOcupanteActivo(asignacion)
  );

  function limpiarError(strCampo: string) {
    setCamposError((prev) => {
      const next = new Set(prev);
      next.delete(strCampo);
      return next;
    });
  }

  function handleTelefonoChange(event: ChangeEvent<HTMLInputElement>) {
    setStrTelefono(event.target.value.replace(/[^0-9]/g, ""));
    limpiarError("telefono");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStrExito("");

    const objValidacionPermiso = validarAccion(rol, "residentes", "crear");
    if (!objValidacionPermiso.permitido) {
      setStrMensajePermiso(objValidacionPermiso.mensaje);
      return;
    }
    setStrMensajePermiso("");

    const objFormulario = new FormData(event.currentTarget);
    const strNombreCompleto = String(objFormulario.get("nombreCompleto") ?? "");
    const strCorreo = String(objFormulario.get("correo") ?? "");
    const strRol = String(objFormulario.get("rol") ?? "");

    const resultado = registrarAsignacion({
      inmuebleId: strInmuebleId,
      nombreCompleto: strNombreCompleto,
      telefono: strTelefono,
      correo: strCorreo,
      rol: strRol as RolOcupante,
    });

    if (!resultado.ok) {
      setCamposError(resultado.campo ? new Set([resultado.campo]) : new Set());
      setStrError(resultado.mensaje);
      return;
    }

    setCamposError(new Set());
    setStrError("");
    setStrExito("Persona asignada correctamente.");
    setStrTelefono("");
    event.currentTarget.reset();
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
                Depto. {inmueble.numeroDepartamento} · Piso {inmueble.piso}
              </option>
            ))}
          </select>
          {inmuebles.length === 0 && (
            <p className="font-caption mt-1 text-[11px] leading-[1.3] text-muted-foreground">
              Todavía no hay inmuebles registrados — ve a &quot;Inmuebles&quot; para crear uno primero.
            </p>
          )}
        </div>

        {inmuebleSeleccionado && (
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">Departamento:</span> {inmuebleSeleccionado.numeroDepartamento}
            </span>
            <span>
              <span className="font-medium text-foreground">Piso:</span> {inmuebleSeleccionado.piso}
            </span>
            <span>
              <span className="font-medium text-foreground">Parqueo:</span> {inmuebleSeleccionado.numeroParqueo || "—"}
            </span>
            <span>
              <span className="font-medium text-foreground">Baulera:</span> {inmuebleSeleccionado.numeroBaulera || "—"}
            </span>
          </div>
        )}

        {bolPuedeAsignar && (
          <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="nombreCompleto" className="text-[12px] font-medium text-foreground">
                  Nombre completo
                </label>
                <input
                  id="nombreCompleto"
                  name="nombreCompleto"
                  autoComplete="off"
                  onChange={() => limpiarError("nombreCompleto")}
                  className={claseCampo(camposError.has("nombreCompleto"))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="telefono" className="text-[12px] font-medium text-foreground">
                  Teléfono
                </label>
                <input
                  id="telefono"
                  name="telefono"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Solo números"
                  value={strTelefono}
                  onChange={handleTelefonoChange}
                  className={claseCampo(camposError.has("telefono"))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="correo" className="text-[12px] font-medium text-foreground">
                  Correo electrónico
                </label>
                <input
                  id="correo"
                  name="correo"
                  type="email"
                  autoComplete="off"
                  placeholder="nombre@correo.com"
                  onChange={() => limpiarError("correo")}
                  className={claseCampo(camposError.has("correo"))}
                />
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
            Residentes actuales {inmuebleSeleccionado ? `— Depto. ${inmuebleSeleccionado.numeroDepartamento}` : ""}
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
            {residentesDelInmueble.map((asignacion) => (
              <tr key={asignacion.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                <td className="px-5 py-3 text-[13px] text-foreground">{asignacion.nombreCompleto}</td>
                <td className="px-5 py-3 text-[13px] text-muted-foreground tabular-nums">{asignacion.telefono}</td>
                <td className="px-5 py-3 text-[13px] text-muted-foreground">{asignacion.correo}</td>
                <td className="px-5 py-3">
                  <span
                    className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      asignacion.rol === "PROPIETARIO" ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ETIQUETA_ROL[asignacion.rol]}
                  </span>
                </td>
              </tr>
            ))}
            {residentesDelInmueble.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  {strInmuebleId ? "Este inmueble todavía no tiene residentes asignados." : "Selecciona un inmueble para ver sus residentes."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
