"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Plus, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CrearMovimientoRespuesta } from "@/types/movimientos";
import { MovimientoForm } from "./components/MovimientoForm";
import { MovimientosListado } from "./components/MovimientosListado";
import { BalanceMovimientos } from "./components/BalanceMovimientos";
import { QueryProvider } from "./QueryProvider";
import {
  CLASE_AVISO_ADVERTENCIA,
  CLASE_AVISO_EXITO,
  CLASE_DESCRIPCION_DIALOGO,
  CLASE_TITULO_DIALOGO,
  CLASE_TITULO_SECCION,
} from "./utils/ui";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";

function Contenido() {
  const { usuario } = useSesionActual();
  const administrador = usuario && normalizarRol(usuario.rol) === "ADMINISTRADOR";
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; sinComprobante: boolean } | null>(null);

  function alGuardarMovimiento(respuesta: CrearMovimientoRespuesta, sinComprobante: boolean) {
    const archivoPendiente = sinComprobante && !respuesta.movimiento.tieneComprobante;
    setMostrarFormulario(false);
    setGuardando(false);
    setAviso({
      texto: archivoPendiente
        ? "Movimiento registrado correctamente, pero sin comprobante. Puedes adjuntarlo desde su detalle."
        : respuesta.duplicado
          ? "Este movimiento ya estaba registrado. No se generó un duplicado."
          : "Movimiento registrado correctamente.",
      sinComprobante: archivoPendiente,
    });
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Volver a Finanzas
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-3"><Wallet className="size-5 text-primary" /></div>
          <div>
            {/* El H1 de la vista ya lo pone el layout ("Finanzas"): aquí va un subtítulo. */}
            <h2 className={CLASE_TITULO_SECCION}>Gastos e ingresos extraordinarios</h2>
            <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">Movimientos financieros del edificio</p>
          </div>
        </div>
        {administrador && (
          <Button type="button" onClick={() => { setAviso(null); setMostrarFormulario(true); }}>
            <Plus className="size-4" /> Nuevo movimiento
          </Button>
        )}
      </header>

      {administrador ? (
        <>
          {aviso && (
            <div role="status" className={`flex items-start justify-between gap-3 ${aviso.sinComprobante ? CLASE_AVISO_ADVERTENCIA : CLASE_AVISO_EXITO}`}>
              <div className="flex items-start gap-2">
                <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${aviso.sinComprobante ? "text-accent-secondary" : "text-success"}`} />
                <p>{aviso.texto}</p>
              </div>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Cerrar mensaje" onClick={() => setAviso(null)}>
                <X className="size-4" />
              </Button>
            </div>
          )}
          <Dialog open={mostrarFormulario} onOpenChange={abierto => {
            if (!abierto && guardando) return;
            setMostrarFormulario(abierto);
          }}>
            <DialogContent
              className="max-h-[90dvh] w-full overflow-y-auto sm:max-w-2xl"
              showCloseButton={!guardando}
              onEscapeKeyDown={evento => { if (guardando) evento.preventDefault(); }}
              onInteractOutside={evento => { if (guardando) evento.preventDefault(); }}
            >
              <DialogHeader>
                <DialogTitle className={CLASE_TITULO_DIALOGO}>Registrar movimiento financiero</DialogTitle>
                <DialogDescription className={CLASE_DESCRIPCION_DIALOGO}>
                  Registra un gasto o ingreso extraordinario del edificio.
                </DialogDescription>
              </DialogHeader>
              {mostrarFormulario && (
                <MovimientoForm
                  enModal
                  onCancelar={() => setMostrarFormulario(false)}
                  onGuardandoCambio={setGuardando}
                  onGuardado={alGuardarMovimiento}
                />
              )}
            </DialogContent>
          </Dialog>
          <BalanceMovimientos />
          <MovimientosListado />
        </>
      ) : (
        <p className="rounded-lg border border-border p-4 text-[13px] text-muted-foreground">
          Solo el rol Administrador puede acceder a este módulo de registro de movimientos.
        </p>
      )}
    </main>
  );
}

export default function Page() {
  return <QueryProvider><Contenido /></QueryProvider>;
}
