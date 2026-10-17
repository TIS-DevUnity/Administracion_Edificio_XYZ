"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MovimientoForm } from "./components/MovimientoForm";
import { MovimientosListado } from "./components/MovimientosListado";
import { BalanceMovimientos } from "./components/BalanceMovimientos";
import { QueryProvider } from "./QueryProvider";
import { useSesionActual } from "@/lib/session";
import { normalizarRol } from "@/lib/permissions";

function Contenido() {
  const { usuario } = useSesionActual();
  const administrador = usuario && normalizarRol(usuario.rol) === "ADMINISTRADOR";
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Volver a Finanzas
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-3"><Wallet className="size-5 text-primary" /></div>
          <div>
            <h1 className="font-title text-[24px] font-bold">Gastos e ingresos extraordinarios</h1>
            <p className="text-[13px] text-muted-foreground">HU6 · Movimientos financieros del edificio</p>
          </div>
        </div>
        {administrador && (
          <Button
            type="button"
            variant={mostrarFormulario ? "outline" : "default"}
            onClick={() => setMostrarFormulario(prev => !prev)}
            aria-expanded={mostrarFormulario}
            aria-controls="hu6-formulario"
          >
            {mostrarFormulario ? <X className="size-4" /> : <Plus className="size-4" />}
            {mostrarFormulario ? "Cerrar formulario" : "Nuevo movimiento"}
          </Button>
        )}
      </header>

      {administrador ? (
        <>
          {mostrarFormulario && (
            <section id="hu6-formulario" aria-label="Registrar un movimiento" className="max-w-2xl">
              <MovimientoForm />
            </section>
          )}
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
