"use client";


import { FormEvent, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";

export default function RestablecerPasswordPage() {
  const [strPassword, setStrPassword] = useState("");
  const [strConfirm, setStrConfirm] = useState("");
  const [strError, setStrError] = useState("");
  const [bolListo, setBolListo] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStrError("");

    if (strPassword.length < 8) {
      setStrError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (strPassword !== strConfirm) {
      setStrError("Las contraseñas no coinciden.");
      return;
    }

    setBolListo(true);
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary">
            <LogoMark className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-title text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              {bolListo ? "Contraseña actualizada" : "Crea una nueva contraseña"}
            </h1>
            <p className="font-subtitle mt-1 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-muted-foreground">
              {bolListo ? "Ya puedes iniciar sesión" : "Debe tener al menos 8 caracteres"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8">
          {bolListo ? (
            <Link
              href="/login"
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Iniciar sesión
            </Link>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="password"
                  className="text-[13px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground"
                >
                  Nueva contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={strPassword}
                  onChange={(event) => setStrPassword(event.target.value)}
                  required
                  className="h-11 rounded-lg border border-input bg-background px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="confirm"
                  className="text-[13px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground"
                >
                  Confirmar contraseña
                </label>
                <input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  value={strConfirm}
                  onChange={(event) => setStrConfirm(event.target.value)}
                  required
                  className="h-11 rounded-lg border border-input bg-background px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </div>

              {strError && (
                <div className="rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
                  {strError}
                </div>
              )}

              <button
                type="submit"
                className="flex h-11 items-center justify-center rounded-lg bg-primary text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Guardar nueva contraseña
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
