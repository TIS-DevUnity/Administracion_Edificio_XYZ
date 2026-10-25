"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { cuentaResidenteService } from "@/services/cuentaResidente.service";
import type { CuentaResidenteDTO } from "@/types/cuentaResidente";
import type { SituacionCuenta } from "@/types/cuentaInmueble";

const CLASE_ETIQUETA_CAMPO = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CLASE_AYUDA = "font-caption text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground";

const ETIQUETA_CLASE = { DEPARTAMENTO: "Departamento", BAULERA: "Baulera", PARQUEO: "Parqueo" } as const;

const ETIQUETA_SITUACION: Record<SituacionCuenta, string> = {
  DEBE: "Debe",
  AL_DIA: "Al día",
  A_FAVOR: "Saldo a favor",
};
const CLASE_SITUACION: Record<SituacionCuenta, string> = {
  DEBE: "bg-danger-subtle text-destructive",
  AL_DIA: "bg-success-subtle text-success",
  A_FAVOR: "bg-accent-secondary/10 text-accent-secondary",
};

function bs(valor: string | number) {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(Number(valor));
}

/**
 * Situación económica de una persona (HU3 CA-14): lo que se le cobra cada mes por concepto
 * (departamento, bauleras y parqueos por separado), su deuda, saldo a favor y deuda en planes de pago.
 */
export function CuentaResidente({ strCopropietarioId }: { strCopropietarioId: string }) {
  const [cuenta, setCuenta] = useState<CuentaResidenteDTO | null>(null);
  const [strError, setStrError] = useState("");

  useEffect(() => {
    let bolCancelado = false;
    cuentaResidenteService
      .obtener(strCopropietarioId)
      .then((datos) => !bolCancelado && setCuenta(datos))
      .catch((error: unknown) => {
        if (bolCancelado) return;
        const strMensaje = axios.isAxiosError(error)
          ? (error.response?.data as { error?: string } | undefined)?.error
          : undefined;
        setStrError(strMensaje ?? "No se pudo cargar la cuenta de esta persona.");
      });
    return () => {
      bolCancelado = true;
    };
  }, [strCopropietarioId]);

  if (strError) return <p className="text-[13px] text-destructive">{strError}</p>;
  if (!cuenta) return <p className="text-[13px] text-muted-foreground">Cargando cuenta...</p>;

  const { resumen, cargoMensual, departamentos, avisos } = cuenta;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={CLASE_ETIQUETA_CAMPO}>Cuenta y obligaciones</p>
        <span className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASE_SITUACION[resumen.situacion]}`}>
          {ETIQUETA_SITUACION[resumen.situacion]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { etiqueta: "Deuda pendiente", valor: resumen.deudaPendiente, clase: Number(resumen.deudaPendiente) > 0 ? "text-destructive" : "text-foreground" },
          { etiqueta: "Saldo a favor", valor: resumen.saldoFavor, clase: Number(resumen.saldoFavor) > 0 ? "text-success" : "text-foreground" },
          { etiqueta: "Saldo neto", valor: resumen.saldoNeto, clase: "text-foreground" },
        ].map((item) => (
          <div key={item.etiqueta} className="rounded-lg border border-border p-2.5">
            <p className={CLASE_AYUDA}>{item.etiqueta}</p>
            <p className={`mt-0.5 text-[14px] font-semibold tabular-nums ${item.clase}`}>{bs(item.valor)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className={`${CLASE_ETIQUETA_CAMPO} mb-2`}>Cargo mensual por concepto</p>
        {cargoMensual.conceptos.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No tiene cargos mensuales a su nombre.</p>
        ) : (
          <div className="flex flex-col gap-1.5 text-[13px] tabular-nums">
            {cargoMensual.conceptos.map((concepto) => (
              <div key={`${concepto.clase}-${concepto.inmuebleId}`} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {ETIQUETA_CLASE[concepto.clase]} {concepto.codigo}
                  {concepto.clase === "DEPARTAMENTO" ? " (tarifa fija)" : ""}
                </span>
                <span className="text-foreground">{bs(concepto.monto)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t border-border pt-1.5">
              <span className="font-medium text-foreground">Total mensual (sin agua)</span>
              <span className="font-medium text-foreground">{bs(cargoMensual.total)}</span>
            </div>
            {cargoMensual.extrasEnDepartamento && cargoMensual.conceptos.some((c) => c.clase !== "DEPARTAMENTO") && (
              <p className={CLASE_AYUDA}>Las bauleras y parqueos se cobran en la expensa de {cargoMensual.extrasEnDepartamento}.</p>
            )}
          </div>
        )}
      </div>

      {departamentos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className={CLASE_ETIQUETA_CAMPO}>Departamentos a su cargo</p>
          {departamentos.map((depto) => (
            <div key={depto.inmuebleId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border px-3 py-2.5">
              <span className="text-[13px] font-medium text-foreground">
                {depto.codigo}
                {depto.tipo && <span className="font-normal text-muted-foreground"> · Tipo {depto.tipo}</span>}
              </span>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {depto.expensasPendientes} expensa{depto.expensasPendientes === 1 ? "" : "s"} pendiente{depto.expensasPendientes === 1 ? "" : "s"} · Debe{" "}
                <span className={Number(depto.deudaPendiente) > 0 ? "text-destructive" : "text-foreground"}>{bs(depto.deudaPendiente)}</span>
                {Number(depto.deudaEnPlanDePagos) > 0 && <> (en plan de pagos {bs(depto.deudaEnPlanDePagos)})</>}
                {Number(depto.saldoFavor) > 0 && <> · A favor <span className="text-success">{bs(depto.saldoFavor)}</span></>}
              </span>
              <Link href={`/admin/inmuebles/${depto.inmuebleId}`} className="font-caption text-[12px] font-medium text-primary hover:text-primary/80">
                Ver ficha y estado de cuenta
              </Link>
            </div>
          ))}
        </div>
      )}

      {avisos.map((aviso) => (
        <p key={aviso} className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 px-3 py-2 text-[12px] text-foreground">
          {aviso}.
        </p>
      ))}
    </div>
  );
}
