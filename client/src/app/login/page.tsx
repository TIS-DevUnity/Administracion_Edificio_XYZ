"use client";

import { useState } from "react";
import { LogoMark } from "@/components/LogoMark";
import { PanelMarca } from "./PanelMarca";
import { FormularioLogin } from "./FormularioLogin";
import { FormularioRegistro } from "./FormularioRegistro";

type Vista = "login" | "registro";

export default function LoginPage() {
  const [strVista, setStrVista] = useState<Vista>("login");
  const [strEmailPrellenado, setStrEmailPrellenado] = useState("");
  const [strMensajeExito, setStrMensajeExito] = useState("");

  function handleCuentaCreada(strEmail: string) {
    setStrEmailPrellenado(strEmail);
    setStrMensajeExito("Cuenta creada correctamente. Ya puedes iniciar sesión.");
    setStrVista("login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <PanelMarca />

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-6">
        <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-4 flex flex-col items-center gap-3 text-center lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/30">
              <LogoMark className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>

          {strVista === "login" ? (
            <FormularioLogin
              strEmailInicial={strEmailPrellenado}
              strMensajeExito={strMensajeExito}
              onIrARegistro={() => {
                setStrMensajeExito("");
                setStrVista("registro");
              }}
            />
          ) : (
            <FormularioRegistro onCuentaCreada={handleCuentaCreada} onIrALogin={() => setStrVista("login")} />
          )}
        </div>
      </div>
    </div>
  );
}
