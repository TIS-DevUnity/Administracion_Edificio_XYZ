"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";

export default function RecuperarPasswordPage() {
  const [strEmail, setStrEmail] = useState("");
  const [bolEnviado, setBolEnviado] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBolEnviado(true);
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
              Recuperar contraseña
            </h1>
            <p className="font-subtitle mt-1 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-muted-foreground">
              {bolEnviado ? "Revisa tu correo" : "Te enviaremos un enlace para restablecerla"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8">
          {bolEnviado ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M4 6h16v12H4V6z" />
                </svg>
              </div>
              <p className="text-[13px] leading-[1.45] text-foreground">
                Si <span className="font-medium">{strEmail}</span> está registrado, te enviamos un
                enlace para restablecer tu contraseña. Revisa también tu carpeta de spam.
              </p>
              <Link
                href="/login"
                className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="email"
                  className="text-[13px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground"
                >
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="Ingresa tu correo electrónico"
                  value={strEmail}
                  onChange={(event) => setStrEmail(event.target.value)}
                  required
                  className="h-11 rounded-lg border border-input bg-background px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </div>

              <button
                type="submit"
                className="flex h-11 items-center justify-center rounded-lg bg-primary text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enviar enlace
              </button>

              <Link
                href="/login"
                className="font-caption text-center text-[12px] leading-[1.3] tracking-[0.01em] text-primary hover:text-primary/80"
              >
                ← Volver a iniciar sesión
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
