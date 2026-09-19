"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { api } from "@/lib/api";
import { BotonMostrarPassword } from "./BotonMostrarPassword";
import { IconoCandado, IconoCorreo, IconoSpinner } from "./icons";

interface Usuario {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
}

interface LoginResponse {
  token: string;
  usuario: Usuario;
}

interface FormularioLoginProps {
  strEmailInicial: string;
  strMensajeExito: string;
  onIrARegistro: () => void;
}

export function FormularioLogin({ strEmailInicial, strMensajeExito, onIrARegistro }: FormularioLoginProps) {
  const router = useRouter();

  const [strEmail, setStrEmail] = useState(strEmailInicial);
  const [strPassword, setStrPassword] = useState("");
  const [strError, setStrError] = useState("");
  const [bolLoading, setBolLoading] = useState(false);
  const [bolShowPassword, setBolShowPassword] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setStrError("");
    setBolLoading(true);

    try {
      const response = await api.post<LoginResponse>("/auth/login", {
        email: strEmail,
        password: strPassword,
      });

      const { token, usuario } = response.data;

      localStorage.setItem("token", token);
      localStorage.setItem("usuario", JSON.stringify(usuario));

      router.push("/admin");
    } catch (error: unknown) {
      console.error("Error al iniciar sesión:", error);

      if (axios.isAxiosError(error)) {
        const intStatus = error.response?.status;

        if (intStatus === 401) {
          setStrError("Correo o contraseña incorrectos.");
        } else if (intStatus === 403) {
          setStrError("Tu usuario no tiene acceso al sistema.");
        } else if (intStatus === 500) {
          setStrError(
            "Error del servidor. Puede ser un problema de conexión con la base de datos — avisa al equipo de backend."
          );
        } else {
          setStrError("No se pudo conectar con el servidor. Verifica que el backend esté funcionando.");
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
      <div className="mb-5 text-center lg:text-left">
        <h1 className="font-title text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          Bienvenido de nuevo
        </h1>
        <p className="font-subtitle mt-1 text-[14px] font-semibold leading-[1.3] tracking-[-0.005em] text-muted-foreground">
          Ingresa tus credenciales para acceder al panel
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/4">
        <form className="flex flex-col gap-3.5" onSubmit={handleLogin}>
          {strMensajeExito && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-300 rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-[13px] text-success">
              {strMensajeExito}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground">
              Correo electrónico
            </label>

            <div className="relative">
              <IconoCorreo />

              <input
                id="email"
                type="email"
                placeholder="Ingresa tu correo electrónico"
                value={strEmail}
                onChange={(event) => setStrEmail(event.target.value)}
                required
                className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-[13px] font-medium leading-[1.3] tracking-[-0.005em] text-foreground"
              >
                Contraseña
              </label>

              <Link
                href="/recuperar-password"
                className="font-caption text-[12px] leading-[1.3] tracking-[0.01em] text-primary hover:text-primary/80"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <div className="relative">
              <IconoCandado />

              <input
                id="password"
                type={bolShowPassword ? "text" : "password"}
                placeholder="Ingresa tu contraseña"
                value={strPassword}
                onChange={(event) => setStrPassword(event.target.value)}
                required
                className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />

              <BotonMostrarPassword
                bolVisible={bolShowPassword}
                onClick={() => setBolShowPassword((bolValor) => !bolValor)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] leading-[1.4] text-foreground">
            <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary" />
            Recordarme en este dispositivo
          </label>

          {strError && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-300 rounded-lg border border-destructive/20 bg-danger-subtle px-3 py-2 text-[13px] text-destructive">
              {strError}
            </div>
          )}

          <button
            type="submit"
            disabled={bolLoading}
            className="mt-1 flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-[background-color,box-shadow,transform] hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {bolLoading && <IconoSpinner />}
            {bolLoading ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>
      </div>

      <p className="font-caption mt-4 text-center text-[12px] leading-[1.3] tracking-[0.01em] text-muted-foreground">
        ¿No tienes una cuenta?{" "}
        <button type="button" onClick={onIrARegistro} className="font-medium text-primary hover:text-primary/80">
          Crear cuenta
        </button>
      </p>
    </>
  );
}
