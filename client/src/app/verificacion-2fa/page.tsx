"use client";

import { ClipboardEvent, KeyboardEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";

const INT_CODIGO_LENGTH = 6;

export default function Verificacion2faPage() {
  const router = useRouter();
  const [arrDigitos, setArrDigitos] = useState<string[]>(Array(INT_CODIGO_LENGTH).fill(""));
  const refInputs = useRef<Array<HTMLInputElement | null>>([]);

  function handleChange(intIndex: number, strValue: string) {
    const strDigito = strValue.replace(/\D/g, "").slice(-1);
    const arrNuevo = [...arrDigitos];
    arrNuevo[intIndex] = strDigito;
    setArrDigitos(arrNuevo);

    if (strDigito && intIndex < INT_CODIGO_LENGTH - 1) {
      refInputs.current[intIndex + 1]?.focus();
    }
  }

  function handleKeyDown(intIndex: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !arrDigitos[intIndex] && intIndex > 0) {
      refInputs.current[intIndex - 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const strPasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, INT_CODIGO_LENGTH);
    if (!strPasted) return;

    const arrNuevo = Array(INT_CODIGO_LENGTH).fill("");
    strPasted.split("").forEach((strChar, intIndex) => {
      arrNuevo[intIndex] = strChar;
    });
    setArrDigitos(arrNuevo);
    refInputs.current[Math.min(strPasted.length, INT_CODIGO_LENGTH) - 1]?.focus();
  }

  function handleSubmit() {
    router.push("/seleccionar-perfil");
  }

  const bolCompleto = arrDigitos.every((strDigito) => strDigito !== "");

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary">
            <LogoMark className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-title text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
              Verificación en dos pasos
            </h1>
            <p className="font-subtitle mt-1 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-muted-foreground">
              Ingresa el código de 6 dígitos
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8">
          <p className="mb-6 text-center text-[13px] leading-[1.45] text-muted-foreground">
            Enviamos un código a tu correo registrado. Puede tardar unos minutos en llegar.
          </p>

          <div className="mb-6 flex justify-center gap-2">
            {arrDigitos.map((strDigito, intIndex) => (
              <input
                key={intIndex}
                ref={(elInput) => {
                  refInputs.current[intIndex] = elInput;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={strDigito}
                onChange={(event) => handleChange(intIndex, event.target.value)}
                onKeyDown={(event) => handleKeyDown(intIndex, event)}
                onPaste={handlePaste}
                className="h-12 w-11 rounded-lg border border-input bg-background text-center text-[18px] font-medium text-foreground outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            ))}
          </div>

          <button
            type="button"
            disabled={!bolCompleto}
            onClick={handleSubmit}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Verificar
          </button>

          <button
            type="button"
            className="font-caption mt-4 w-full text-center text-[12px] leading-[1.3] tracking-[0.01em] text-primary hover:text-primary/80"
          >
            ¿No recibiste el código? Reenviar
          </button>
        </div>

        <Link
          href="/login"
          className="font-caption mt-6 block text-center text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground hover:text-foreground"
        >
          ← Volver a iniciar sesión
        </Link>
      </div>
    </div>
  );
}
