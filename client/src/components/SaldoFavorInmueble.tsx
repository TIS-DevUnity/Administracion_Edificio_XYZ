"use client";

import { useEffect, useState } from "react";
import { PiggyBank } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cuentaInmuebleService } from "@/services/cuentaInmueble.service";
import { SaldoInmuebleDTO } from "@/types/cuentaInmueble";

function bs(valor: string | number) {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(Number(valor));
}

/** Saldo a favor y situación actual de la cuenta de un inmueble (GET /financiero/inmuebles/:id/saldo). */
export function SaldoFavorInmueble({
  strInmuebleId,
  strCodigo,
  onVerEstadoCuenta,
}: {
  strInmuebleId: string;
  strCodigo: string;
  onVerEstadoCuenta?: () => void;
}) {
  const [saldo, setSaldo] = useState<SaldoInmuebleDTO | null>(null);
  const [bolError, setBolError] = useState(false);

  useEffect(() => {
    let bolCancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaldo(null);
    setBolError(false);
    cuentaInmuebleService
      .obtenerSaldo(strInmuebleId)
      .then((resultado) => !bolCancelado && setSaldo(resultado))
      .catch(() => !bolCancelado && setBolError(true));
    return () => {
      bolCancelado = true;
    };
  }, [strInmuebleId]);

  if (bolError) {
    return (
      <p className="rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground">
        No se pudo consultar el saldo a favor de {strCodigo}.
      </p>
    );
  }

  if (!saldo) return <Skeleton className="h-20 w-full" />;

  const intSaldoFavor = Number(saldo.saldoFavor);
  const intDeuda = Number(saldo.deudaPendiente);
  const bolTieneSaldo = intSaldoFavor > 0;

  return (
    <div
      className={`rounded-lg border p-3 ${
        bolTieneSaldo ? "border-accent-secondary/30 bg-accent-secondary/10" : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <PiggyBank className={`mt-0.5 h-4 w-4 shrink-0 ${bolTieneSaldo ? "text-accent-secondary" : "text-muted-foreground"}`} />
          <div>
            <p className="font-caption text-[11px] font-medium uppercase tracking-[0.01em] text-muted-foreground">
              Saldo a favor de {strCodigo}
            </p>
            <p
              className={`font-title text-[20px] font-bold leading-[1.2] tabular-nums ${
                bolTieneSaldo ? "text-accent-secondary" : "text-foreground"
              }`}
            >
              {bs(intSaldoFavor)}
            </p>
          </div>
        </div>
        {onVerEstadoCuenta && (
          <button
            type="button"
            onClick={onVerEstadoCuenta}
            className="font-caption shrink-0 whitespace-nowrap text-[12px] font-medium text-primary hover:text-primary/80"
          >
            Ver movimientos →
          </button>
        )}
      </div>
      <p className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">
        {bolTieneSaldo
          ? "Viene de pagos anticipados o pagos de más. Se descuenta automáticamente de la próxima expensa que se genere."
          : "Este inmueble no tiene saldo a favor. Se genera cuando se paga de más o por adelantado."}{" "}
        {intDeuda > 0 ? (
          <span className="text-destructive">Deuda pendiente total del inmueble: {bs(intDeuda)}.</span>
        ) : (
          <span className="text-success">El inmueble no tiene deudas pendientes.</span>
        )}
      </p>
    </div>
  );
}
