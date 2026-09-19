"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import { normalizarRol, puedeEjecutar, validarAccion } from "@/lib/permissions";
import {
  RolOcupante,
  alternarActivoInmueble,
  esOcupanteActivo,
  formatearFecha,
  ordenarHistorial,
  useAsignaciones,
  useInmuebles,
} from "@/lib/inmueblesStore";

type Tab = "datos" | "historial";

const ETIQUETA_ROL: Record<RolOcupante, string> = {
  PROPIETARIO: "Propietario",
  INQUILINO: "Inquilino",
};

export default function FichaInmueblePage() {
  const params = useParams<{ id: string }>();
  const strId = Array.isArray(params.id) ? params.id[0] : params.id;

  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");

  const inmuebles = useInmuebles();
  const asignaciones = useAsignaciones();
  const [strTab, setStrTab] = useState<Tab>("datos");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");

  const inmueble = inmuebles.find((item) => item.id === strId);

  if (!inmueble) {
    return (
      <div className="px-6 py-6">
        <p className="text-[13px] text-muted-foreground">
          Este inmueble no existe o fue eliminado.{" "}
          <Link href="/admin/inmuebles" className="text-primary hover:text-primary/80">
            Volver a Inmuebles
          </Link>
        </p>
      </div>
    );
  }

  const bolPuedeCambiarEstado = puedeEjecutar(rol, "inmuebles", "eliminar");
  const strInmuebleId = inmueble.id;

  const historial = ordenarHistorial(asignaciones.filter((asignacion) => asignacion.inmuebleId === strId));

  function handleAlternarEstado() {
    const objValidacion = validarAccion(rol, "inmuebles", "eliminar");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }
    setStrMensajePermiso("");
    alternarActivoInmueble(strInmuebleId);
  }

  return (
    <div className="px-6 py-6">
      <Link
        href="/admin/inmuebles"
        className="font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground hover:text-foreground"
      >
        ← Inmuebles
      </Link>

      <div className="mb-4 mt-1 flex items-center justify-between">
        <h1 className="font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          Depto. {inmueble.numeroDepartamento} · Piso {inmueble.piso}
        </h1>
        <span
          className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
            inmueble.activo ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"
          }`}
        >
          {inmueble.activo ? "Activo" : "Inactivo"}
        </span>
      </div>

      {strMensajePermiso && <AlertaPermiso mensaje={strMensajePermiso} />}

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
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Departamento
              </dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.numeroDepartamento}</dd>
            </div>
            <div>
              <dt className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Piso
              </dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.piso}</dd>
            </div>
            <div>
              <dt className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Parqueo
              </dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.numeroParqueo || "—"}</dd>
            </div>
            <div>
              <dt className="font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Baulera
              </dt>
              <dd className="mt-1 text-[14px] text-foreground">{inmueble.numeroBaulera || "—"}</dd>
            </div>
          </dl>

          {bolPuedeCambiarEstado && (
            <button
              type="button"
              onClick={handleAlternarEstado}
              className="mt-5 flex h-9 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              {inmueble.activo ? "Desactivar inmueble" : "Activar inmueble"}
            </button>
          )}
        </div>
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
                      <p className="text-[14px] font-medium text-foreground">{registro.nombreCompleto}</p>
                      <span
                        className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          registro.rol === "PROPIETARIO"
                            ? "bg-success-subtle text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {ETIQUETA_ROL[registro.rol]}
                      </span>
                      {bolActivo && (
                        <span className="font-caption inline-flex rounded-full bg-accent-secondary/10 px-2 py-0.5 text-[11px] font-medium text-accent-secondary">
                          Actual
                        </span>
                      )}
                    </div>

                    <p className="font-caption mt-1 text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
                      {formatearFecha(registro.fechaInicio)} — {bolActivo ? "Actual" : formatearFecha(registro.fechaFin as string)}
                    </p>

                    <p className="mt-1 text-[12px] leading-[1.4] text-muted-foreground">
                      {registro.telefono} · {registro.correo}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
