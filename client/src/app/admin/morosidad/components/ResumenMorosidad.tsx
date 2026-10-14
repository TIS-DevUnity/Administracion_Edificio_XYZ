"use client";

import { useMemo } from "react";
import type { ExpensaDTO } from "@/types/finance";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, resumenSaldo } from "../utils/morosidad";

const LABEL = "font-caption text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground";
const CIFRA = "font-title mt-2 text-[24px] font-bold leading-[1.2] tracking-[-0.015em] tabular-nums";

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

  const tarjetas = [
    { etiqueta: "Expensas vencidas", valor: String(totales.vencidas), clase: "text-accent-secondary" },
    { etiqueta: "Capital pendiente", valor: formatCurrency(totales.capital), clase: "text-foreground" },
    { etiqueta: "Mora pendiente", valor: formatCurrency(totales.mora), clase: "text-destructive" },
    { etiqueta: "Deuda pendiente", valor: formatCurrency(totales.capital + totales.mora), clase: "text-foreground" },
  ];

  return (
    <section aria-label="Resumen de la página visible" className="mb-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((tarjeta) => (
          <Card key={tarjeta.etiqueta} className="shadow-sm">
            <CardContent className="p-5">
              <p className={LABEL}>{tarjeta.etiqueta}</p>
              <p className={`${CIFRA} ${tarjeta.clase}`}>{tarjeta.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="font-caption mt-2 text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
        Calculado sobre las {expensas.length} expensas de la página actual (no incluye otras páginas).
      </p>
    </section>
  );
}
