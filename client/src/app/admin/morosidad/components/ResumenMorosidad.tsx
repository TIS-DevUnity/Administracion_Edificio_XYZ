"use client";

import { useMemo } from "react";
import type { ExpensaDTO } from "@/types/finance";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, resumenSaldo } from "../utils/morosidad";

const LABEL = "font-caption text-[11px] font-medium uppercase text-muted-foreground";

export function ResumenMorosidad({ expensas }: { expensas: ExpensaDTO[] }) {
  // Totales únicamente de los registros de la página: NO simulan un resumen global.
  const totales = useMemo(() => {
    let vencidas = 0, capital = 0, mora = 0;
    for (const expensa of expensas) {
      if (expensa.estado === "VENCIDA") vencidas++;
      const saldo = resumenSaldo(expensa);
      capital += saldo.capitalPendiente;
      mora += saldo.moraPendiente;
    }
    return { vencidas, capital, mora };
  }, [expensas]);

  return (
    <section aria-label="Resumen de la página visible" className="mb-6">
      <p className="mb-2 text-xs text-muted-foreground">
        Resumen de las {expensas.length} expensas cargadas en esta página (no incluye otras páginas).
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-5"><p className={LABEL}>Expensas vencidas (esta página)</p>
          <h3 className="mt-2 text-2xl font-bold">{totales.vencidas}</h3></CardContent></Card>
        <Card><CardContent className="p-5"><p className={LABEL}>Capital pendiente (esta página)</p>
          <h3 className="mt-2 text-2xl font-bold text-primary">{formatCurrency(totales.capital)}</h3></CardContent></Card>
        <Card><CardContent className="p-5"><p className={LABEL}>Mora pendiente (esta página)</p>
          <h3 className="mt-2 text-2xl font-bold text-destructive">{formatCurrency(totales.mora)}</h3></CardContent></Card>
        <Card><CardContent className="p-5"><p className={LABEL}>Deuda pendiente (esta página)</p>
          <h3 className="mt-2 text-2xl font-bold">{formatCurrency(totales.capital + totales.mora)}</h3></CardContent></Card>
      </div>
    </section>
  );
}
