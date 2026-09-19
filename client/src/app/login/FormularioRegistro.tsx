"use client";

import { FormEvent, useState } from "react";
import axios from "axios";
import { api } from "@/lib/api";
import { ROLES_DISPONIBLES } from "@/lib/permissions";
import { validarPassword } from "@/lib/passwordRules";
import { BotonMostrarPassword } from "./BotonMostrarPassword";
import { ReglasPassword } from "./ReglasPassword";
import { IconoSpinner } from "./icons";

interface FormularioRegistroProps {
  onCuentaCreada: (strEmail: string) => void;
  onIrALogin: () => void;
}

export function FormularioRegistro({ onCuentaCreada, onIrALogin }: FormularioRegistroProps) {
  const [strPassword, setStrPassword] = useState("");
  const [strConfirmarPassword, setStrConfirmarPassword] = useState("");
  const [bolShowPassword, setBolShowPassword] = useState(false);
  const [bolShowConfirmarPassword, setBolShowConfirmarPassword] = useState(false);
  const [strError, setStrError] = useState("");
  const [bolLoading, setBolLoading] = useState(false);

  const bolPasswordValida = validarPassword(strPassword);

  async function handleRegistro(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setStrError("");

    const objFormulario = new FormData(event.currentTarget);
    const strNombre = String(objFormulario.get("nombre") ?? "");
    const strApellido = String(objFormulario.get("apellido") ?? "");
    const strEmail = String(objFormulario.get("email") ?? "");
    const strRol = String(objFormulario.get("rol") ?? "CONSULTA");

    if (!bolPasswordValida) {
      setStrError("La contraseña no cumple con los requisitos de seguridad.");
      return;
    }

    if (strPassword !== strConfirmarPassword) {
      setStrError("Las contraseñas no coinciden.");
      return;
    }

    setBolLoading(true);

    try {
      await api.post("/usuarios", {
        nombre: strNombre,
        apellido: strApellido,
        email: strEmail,
        password: strPassword,
        rol: strRol,
      });

      onCuentaCreada(strEmail);
    } catch (error: unknown) {
      console.error("Error al crear la cuenta:", error);

      if (axios.isAxiosError(error)) {
        const intStatus = error.response?.status;

        if (intStatus === 401) {
          setStrError("Debes iniciar sesión como administrador para crear cuentas nuevas.");
        } else if (intStatus === 403) {
          setStrError("Tu usuario no tiene permisos de administrador para crear cuentas.");
        } else if (intStatus === 409) {
          setStrError("Ya existe una cuenta registrada con ese correo.");
        } else {
          setStrError("Ocurrió un error al crear la cuenta. Intenta nuevamente.");
        }
      } else {
        setStrError("Ocurrió un error inesperado. Intenta nuevamente.");
      }
    } finally {
      setBolLoading(false);
    }
  }

  return (
    <>
      <div className="mb-4 text-center lg:text-left">
        <h1 className="font-title text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          Crea una cuenta
        </h1>
        <p className="font-subtitle mt-1 text-[13px] font-semibold leading-[1.3] tracking-[-0.005em] text-muted-foreground">
          Unete con un nuevo usuario del sistema
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-black/4">
        <form className="flex flex-col gap-3" onSubmit={handleRegistro} autoComplete="off">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="nombre" className="text-[12px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground">
                Nombre
              </label>
              <input
                id="nombre"
                name="nombre"
                autoComplete="off"
                required
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="apellido" className="text-[12px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground">
                Apellido
              </label>
              <input
                id="apellido"
                name="apellido"
                autoComplete="off"
                required
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="email-registro" className="text-[12px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground">
              Correo electrónico
            </label>
            <input
              id="email-registro"
              name="email"
              type="email"
              autoComplete="off"
              placeholder="Ingresa el correo electrónico del usuario"
              required
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label
                htmlFor="password-registro"
                className="text-[12px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password-registro"
                  name="password"
                  type={bolShowPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={strPassword}
                  onChange={(event) => setStrPassword(event.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 pr-9 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <BotonMostrarPassword
                  bolVisible={bolShowPassword}
                  onClick={() => setBolShowPassword((bolValor) => !bolValor)}
                />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label
                htmlFor="confirmar-password"
                className="text-[12px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground"
              >
                Confirmar contraseña
              </label>
              <div className="relative">
                <input
                  id="confirmar-password"
                  name="confirmarPassword"
                  type={bolShowConfirmarPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repite la contraseña"
                  value={strConfirmarPassword}
                  onChange={(event) => setStrConfirmarPassword(event.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 pr-9 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <BotonMostrarPassword
                  bolVisible={bolShowConfirmarPassword}
                  onClick={() => setBolShowConfirmarPassword((bolValor) => !bolValor)}
                />
              </div>
            </div>
          </div>

          <ReglasPassword strPassword={strPassword} />

          <div className="flex flex-col gap-1">
            <label htmlFor="rol-registro" className="text-[12px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground">
              Rol
            </label>
            <select
              id="rol-registro"
              name="rol"
              required
              defaultValue="CONSULTA"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              {ROLES_DISPONIBLES.map((strRol) => (
                <option key={strRol} value={strRol}>
                  {strRol}
                </option>
              ))}
            </select>
          </div>

          {strError && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-300 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
              {strError}
            </div>
          )}

          <button
            type="submit"
            disabled={bolLoading || !bolPasswordValida}
            className="mt-1 flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-[background-color,box-shadow,transform] hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {bolLoading && <IconoSpinner />}
            {bolLoading ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>
      </div>

      <p className="font-caption mt-4 text-center text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
        ¿Ya tienes una cuenta?{" "}
        <button type="button" onClick={onIrALogin} className="font-medium text-primary hover:text-primary/80">
          Iniciar sesión
        </button>
      </p>
    </>
  );
}
