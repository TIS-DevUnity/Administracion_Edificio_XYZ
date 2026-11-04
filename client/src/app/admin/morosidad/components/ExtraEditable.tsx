"use client";

import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExpensaDTO } from "@/types/finance";
import { formatCurrency, obtenerMensajeError } from "../utils/morosidad";

const CLASE_SECUNDARIA = "font-caption text-[11px] leading-[1.3] tracking-[0.01em] text-muted-foreground";
const MAX_CONCEPTO = 100;

/**
 * Cobro extra opcional de una expensa (pintura, reparaciones...). Mismas reglas que PATCH /expensas/:id/extra:
 * no con mora ni plan de pagos, y con un monto mayor que cero el concepto es obligatorio. Con 0 se quita.
 */
export function ExtraEditable({
  exp, bolPuedeGestionar, onGuardarExtra, compacto = false,
}: {
  exp: ExpensaDTO;
  bolPuedeGestionar: boolean;
  onGuardarExtra: (exp: ExpensaDTO, monto: number, concepto: string) => Promise<void>;
  compacto?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [importe, setImporte] = useState("");
  const [concepto, setConcepto] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const intExtra = Number(exp.montoExtra ?? 0);
  const tieneExtra = intExtra > 0;
  const tieneMora = (exp.moras?.length ?? 0) > 0;
  const habilitada = bolPuedeGestionar && !tieneMora && !exp.planPagoId;

  function comenzarEdicion() {
    if (!habilitada) return;
    setImporte(tieneExtra ? String(intExtra) : "");
    setConcepto(exp.extraConcepto ?? "");
    setError("");
    setEditando(true);
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guardando || !habilitada) return;

    // Acepta 12.50 y 12,50, manteniendo 2 decimales como máximo.
    const normalizado = importe.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizado)) {
      setError("Ingresa un importe válido en Bs (máximo 2 decimales).");
      return;
    }
    const monto = Number(normalizado);
    const strConcepto = concepto.trim().replace(/\s+/g, " ");
    if (monto > 0 && !strConcepto) {
      setError("Indica el concepto del extra.");
      return;
    }
    if (monto === 0 && !tieneExtra) {
      setError("Ingresa un importe mayor que cero.");
      return;
    }
    if (monto === intExtra && strConcepto === (exp.extraConcepto ?? "")) {
      setError("Ese importe y concepto ya están registrados.");
      return;
    }

    setError("");
    setGuardando(true);
    try {
      await onGuardarExtra(exp, monto, strConcepto);
      setEditando(false);
    } catch (err) {
      setError(obtenerMensajeError(err, err instanceof Error ? err.message : "No se pudo guardar el extra."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 ${compacto ? "items-start" : "items-end"}`}>
      {!editando ? (
        <>
          <span className={`text-[13px] tabular-nums ${tieneExtra ? "text-foreground" : "text-muted-foreground"}`}>
            {tieneExtra ? formatCurrency(intExtra) : "—"}
          </span>
          {tieneExtra && <span className={`${CLASE_SECUNDARIA} max-w-[150px] break-words`}>{exp.extraConcepto}</span>}
          {habilitada && (
            <Button type="button" variant="outline" size="xs" onClick={comenzarEdicion}
              aria-label={`${tieneExtra ? "Editar" : "Agregar"} extra de ${exp.inmueble.codigo}`}>
              {tieneExtra ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {tieneExtra ? "Editar" : "Agregar"}
            </Button>
          )}
        </>
      ) : (
        <form onSubmit={guardar} noValidate className={`flex flex-col gap-1.5 ${compacto ? "w-full" : "w-[170px]"}`}>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Bs</span>
            <Input
              aria-label={`Importe del extra de ${exp.inmueble.codigo} en bolivianos`}
              autoFocus
              inputMode="decimal"
              placeholder="0.00"
              value={importe}
              onChange={(e) => { setImporte(e.target.value); setError(""); }}
              disabled={guardando}
              className="h-8 min-w-0 text-right tabular-nums"
            />
          </div>
          <Input
            aria-label={`Concepto del extra de ${exp.inmueble.codigo}`}
            maxLength={MAX_CONCEPTO}
            placeholder="Ej. Pintura Edificio"
            value={concepto}
            onChange={(e) => { setConcepto(e.target.value); setError(""); }}
            disabled={guardando}
            className="h-8 min-w-0"
          />
          <p className={`${CLASE_SECUNDARIA} text-left`}>
            {exp.estado === "PAGADA"
              ? "Está pagada: el extra quedará como deuda, salvo que el saldo a favor lo cubra."
              : tieneExtra ? "Con 0 se quita el extra." : "Se suma al total de esta expensa."}
          </p>
          <div className="flex gap-1">
            <Button type="submit" size="xs" cargando={guardando} disabled={!importe.trim()}>
              <Check className="h-3 w-3" /> Guardar
            </Button>
            <Button type="button" variant="outline" size="xs" disabled={guardando}
              onClick={() => { setEditando(false); setError(""); }}>
              <X className="h-3 w-3" /> Cancelar
            </Button>
          </div>
          {error && <p role="alert" className="text-left text-xs leading-snug text-destructive">{error}</p>}
        </form>
      )}
    </div>
  );
}
