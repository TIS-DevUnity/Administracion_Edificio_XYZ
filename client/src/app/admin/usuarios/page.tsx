"use client";

import { FormEvent, useEffect, useState } from "react";
import axios from "axios";
import { api } from "@/lib/api";
import { AlertaPermiso } from "@/components/AlertaPermiso";
import { useSesionActual } from "@/lib/session";
import {
  MENSAJE_PERMISO_INSUFICIENTE,
  ROLES_DISPONIBLES,
  normalizarRol,
  puedeEjecutar,
  validarAccion,
} from "@/lib/permissions";

interface UsuarioApi {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  activo: boolean;
}

const claseInput =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

interface CamposUsuarioProps {
  registro?: UsuarioApi;
}

function CamposUsuario({ registro }: CamposUsuarioProps) {
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="text-[12px] font-medium text-foreground">
          Nombre
        </label>

        <input
          name="nombre"
          defaultValue={registro?.nombre}
          autoComplete="off"
          required
          className={claseInput}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="text-[12px] font-medium text-foreground">
          Apellido
        </label>

        <input
          name="apellido"
          defaultValue={registro?.apellido}
          autoComplete="off"
          required
          className={claseInput}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="text-[12px] font-medium text-foreground">
          Correo
        </label>

        <input
          name="email"
          type="email"
          defaultValue={registro?.email}
          autoComplete="off"
          required
          className={claseInput}
        />
      </div>
    </>
  );
}

function CampoRol({ strDefault }: { strDefault?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:w-40">
      <label className="text-[12px] font-medium text-foreground">
        Rol
      </label>

      <select
        name="rol"
        defaultValue={strDefault ?? "CONSULTA"}
        required
        className={claseInput}
      >
        {ROLES_DISPONIBLES.map((strRol) => (
          <option key={strRol} value={strRol}>
            {strRol}
          </option>
        ))}
      </select>
    </div>
  );
}


export default function UsuariosPage() {
  const { usuario } = useSesionActual();
  const rol = normalizarRol(usuario?.rol ?? "CONSULTA");

  const [usuarios, setUsuarios] = useState<UsuarioApi[]>([]);
  const [bolCargando, setBolCargando] = useState(true);
  const [strError, setStrError] = useState("");
  const [strMensajePermiso, setStrMensajePermiso] = useState("");
  const [bolMostrarFormularioNuevo, setBolMostrarFormularioNuevo] =
    useState(false);
  const [strIdEnEdicion, setStrIdEnEdicion] = useState<string | null>(null);

  const bolPuedeCrear = puedeEjecutar(rol, "usuarios", "crear");
  const bolPuedeEditar = puedeEjecutar(rol, "usuarios", "editar");
  const bolPuedeCambiarEstado = puedeEjecutar(
    rol,
    "usuarios",
    "eliminar"
  );
  const bolHayAcciones = bolPuedeEditar || bolPuedeCambiarEstado;

  useEffect(() => {
    let bolCancelado = false;

    async function cargarUsuarios() {
      setBolCargando(true);
      setStrError("");

      try {
        const response = await api.get<{ usuarios: UsuarioApi[] }>(
          "/usuarios");

        if (!bolCancelado) {
          setUsuarios(response.data.usuarios);
        }
      } catch (error: unknown) {
        console.error("Error al cargar usuarios:", error);
        if (!bolCancelado) {
          setStrError("No se pudo cargar la lista de usuarios. Verifica que el backend esté funcionando.");
        }
      } finally {
        if (!bolCancelado) {
          setBolCargando(false);
        }
      }
    }

    cargarUsuarios();

    return () => {
      bolCancelado = true;
    };
  }, []);

  function manejarErrorApi(error: unknown, strAccionFallida: string) {
    console.error(strAccionFallida, error);

    if (axios.isAxiosError(error)) {
      if (error.response?.status === 403) {
        setStrMensajePermiso(MENSAJE_PERMISO_INSUFICIENTE);
        return;
      }
      if (error.response?.status === 409) {
        setStrError("Ya existe un usuario registrado con ese correo.");
        return;
      }
    }

    setStrError("Ocurrió un error al comunicarse con el servidor.");
  }

  async function crearUsuario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStrError("");

    const objValidacion = validarAccion(rol, "usuarios", "crear");
    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }

    const objFormulario = new FormData(event.currentTarget);

    const strPassword = String(objFormulario.get("password") ?? "");
    const errores: string[] = [];

    if (strPassword.length < 10) {
      errores.push("mínimo 10 caracteres");
    }

    if (!/[A-Z]/.test(strPassword)) {
      errores.push("al menos una mayúscula");
    }

    if (!/[a-z]/.test(strPassword)) {
      errores.push("al menos una minúscula");
    }

    if (!/[0-9]/.test(strPassword)) {
      errores.push("al menos un número");
    }

    if (!/[^A-Za-z0-9]/.test(strPassword)) {
      errores.push("al menos un carácter especial");
    }

    if (errores.length > 0) {
      setStrError(
        `La contraseña no cumple: ${errores.join(", ")}`
      );
      return;
    }

    try {
      const response = await api.post<{ usuario: UsuarioApi }>(
        "/usuarios",
        {
          nombre: objFormulario.get("nombre"),
          apellido: objFormulario.get("apellido"),
          email: objFormulario.get("email"),
          password: objFormulario.get("password"),
          rol: objFormulario.get("rol"),
        }
      );

      setUsuarios((registrosPrevios) => [
        response.data.usuario,
        ...registrosPrevios,
      ]);

      setBolMostrarFormularioNuevo(false);
      setStrMensajePermiso("");
    } catch (error: unknown) {
      manejarErrorApi(error, "Error al crear usuario:");
    }
  }

  async function guardarEdicion(
    strId: string,
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setStrError("");

    const objValidacion = validarAccion(
      rol,
      "usuarios",
      "editar"
    );

    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }

    const objFormulario = new FormData(event.currentTarget);

    try {
      const response = await api.put<{ usuario: UsuarioApi }>(
        `/usuarios/${strId}`,
        {
          nombre: objFormulario.get("nombre"),
          apellido: objFormulario.get("apellido"),
          email: objFormulario.get("email"),
          rol: objFormulario.get("rol"),
        }
      );

      setUsuarios((registrosPrevios) =>
        registrosPrevios.map((registro) =>
          registro.id === strId
            ? response.data.usuario
            : registro
        )
      );
      setStrIdEnEdicion(null);
      setStrMensajePermiso("");
    } catch (error: unknown) {
      manejarErrorApi(error, "Error al editar usuario:");
    }
  }

  async function cambiarEstado(objUsuarioFila: UsuarioApi) {
    setStrError("");

    const objValidacion = validarAccion(
      rol,
      "usuarios",
      "eliminar"
    );

    if (!objValidacion.permitido) {
      setStrMensajePermiso(objValidacion.mensaje);
      return;
    }

    try {
      const response = await api.patch<{ usuario: UsuarioApi }>(
        `/usuarios/${objUsuarioFila.id}/estado`,
        {
          activo: !objUsuarioFila.activo,
        }
      );

      setUsuarios((registrosPrevios) =>
        registrosPrevios.map((registro) =>
          registro.id === objUsuarioFila.id
            ? response.data.usuario
            : registro
        )
      );
      setStrMensajePermiso("");
    } catch (error: unknown) {
      manejarErrorApi(
        error,
        "Error al cambiar el estado del usuario:"
      );
    }
  }

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <p className="mb-5 text-[13px] leading-[1.45] text-muted-foreground sm:mb-6">
        Usuarios con acceso al sistema y su rol asignado.
      </p>

      {/* Mensaje de permisos */}
      {strMensajePermiso && (
        <AlertaPermiso mensaje={strMensajePermiso} />
      )}

      {/* Error */}
      {strError && (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-danger-subtle px-3.5 py-2.5 text-[13px] text-destructive">
          {strError}
        </div>
      )}

      {/* ============================================================
          NUEVO USUARIO
          ============================================================ */}
      {bolPuedeCrear && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() =>
              setBolMostrarFormularioNuevo(
                (bolValor) => !bolValor
              )
            }
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98] sm:w-auto"
          >
            {bolMostrarFormularioNuevo
              ? "Cancelar"
              : "+ Nuevo usuario"}
          </button>

          {bolMostrarFormularioNuevo && (
            <form
              onSubmit={crearUsuario}
              autoComplete="off"
              className="animate-in fade-in slide-in-from-top-1 mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 duration-300 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
            >
              <CamposUsuario />

              <div className="flex min-w-0 flex-col gap-1">
                <label className="text-[12px] font-medium text-foreground">
                  Contraseña
                </label>

                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className={claseInput}
                />
              </div>

              <CampoRol />

              <button
                type="submit"
                className="h-9 w-full rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:col-span-2 lg:w-auto"
              >
                Guardar
              </button>
            </form>
          )}
        </div>
      )}

      {/* ============================================================
          TABLA DESKTOP / TABLET
          ============================================================ */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Nombre
              </th>

              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Correo
              </th>

              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Rol
              </th>

              <th className="font-caption px-5 py-2.5 text-left text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                Estado
              </th>

              {bolHayAcciones && (
                <th className="font-caption px-5 py-2.5 text-right text-[11px] font-medium uppercase leading-[1.3] tracking-[0.01em] text-muted-foreground">
                  Acciones
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {bolCargando && (
              <tr>
                <td
                  colSpan={bolHayAcciones ? 5 : 4}
                  className="px-5 py-8 text-center text-[13px] text-muted-foreground"
                >
                  Cargando usuarios...
                </td>
              </tr>
            )}

            {!bolCargando &&
              usuarios.map((registro) =>
                strIdEnEdicion === registro.id ? (
                  <tr
                    key={registro.id}
                    className="border-b border-border last:border-0"
                  >
                    <td
                      colSpan={bolHayAcciones ? 5 : 4}
                      className="px-5 py-3"
                    >
                      <form
                        onSubmit={(event) =>
                          guardarEdicion(registro.id, event)
                        }
                        autoComplete="off"
                        className="flex flex-wrap items-end gap-3"
                      >
                        <CamposUsuario
                          registro={registro}
                        />

                        <CampoRol strDefault={registro.rol} />

                        <button
                          type="submit"
                          className="h-9 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          Guardar
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setStrIdEnEdicion(null)
                          }
                          className="h-9 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          Cancelar
                        </button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={registro.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-5 py-3 text-[13px] leading-[1.45] text-foreground">
                      {registro.nombre} {registro.apellido}
                    </td>

                    <td className="px-5 py-3 text-[13px] leading-[1.45] text-muted-foreground">
                      {registro.email}
                    </td>

                    <td className="px-5 py-3 text-[13px] leading-[1.45] text-foreground">
                      {registro.rol}
                    </td>

                    <td className="px-5 py-3">
                      <span
                        className={`font-caption inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium leading-[1.3] ${
                          registro.activo
                            ? "bg-success-subtle text-success"
                            : "bg-danger-subtle text-destructive"
                        }`}
                      >
                        {registro.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>

                    {bolHayAcciones && (
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {bolPuedeEditar && (
                            <button
                              type="button"
                              onClick={() =>
                                setStrIdEnEdicion(registro.id)
                              }
                              className="font-caption text-[12px] font-medium text-primary hover:text-primary/80"
                            >
                              Editar
                            </button>
                          )}

                          {bolPuedeCambiarEstado && (
                            <button
                              type="button"
                              onClick={() =>
                                cambiarEstado(registro)
                              }
                              className="font-caption text-[12px] font-medium text-destructive hover:text-destructive/80"
                            >
                              {registro.activo
                                ? "Desactivar"
                                : "Activar"}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              )}

            {!bolCargando &&
              usuarios.length === 0 &&
              !strError && (
                <tr>
                  <td
                    colSpan={bolHayAcciones ? 5 : 4}
                    className="px-5 py-8 text-center text-[13px] text-muted-foreground"
                  >
                    No hay usuarios registrados.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>

      {/* ============================================================
          TARJETAS MÓVILES
          ============================================================ */}
      <div className="flex flex-col gap-3 md:hidden">
        {bolCargando && (
          <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-[13px] text-muted-foreground">
            Cargando usuarios...
          </div>
        )}

        {!bolCargando &&
          usuarios.map((registro) => {
            const bolEditando = strIdEnEdicion === registro.id;

            return (
              <div
                key={registro.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                {bolEditando ? (
                  /* ==================================================
                     EDICIÓN MÓVIL
                     ================================================== */
                  <form
                    onSubmit={(event) =>
                      guardarEdicion(registro.id, event)
                    }
                    autoComplete="off"
                    className="flex flex-col gap-3"
                  >
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">
                        Editar usuario
                      </p>

                      <p className="mt-1 text-[12px] text-muted-foreground">
                        Actualiza los datos del usuario.
                      </p>
                    </div>

                    <CamposUsuario registro={registro} />

                    <CampoRol strDefault={registro.rol} />

                    <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                      <button
                        type="submit"
                        className="h-9 w-full rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Guardar
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setStrIdEnEdicion(null)
                        }
                        className="h-9 w-full rounded-lg border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  /* ==================================================
                     INFORMACIÓN DEL USUARIO
                     ================================================== */
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-[14px] font-semibold text-foreground">
                          {registro.nombre} {registro.apellido}
                        </h2>

                        <p className="mt-1 break-all text-[12px] text-muted-foreground">
                          {registro.email}
                        </p>
                      </div>

                      <span
                        className={`font-caption shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-[1.3] ${
                          registro.activo
                            ? "bg-success-subtle text-success"
                            : "bg-danger-subtle text-destructive"
                        }`}
                      >
                        {registro.activo
                          ? "Activo"
                          : "Inactivo"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">
                          Rol
                        </p>

                        <p className="mt-1 truncate text-[13px] font-medium text-foreground">
                          {registro.rol}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">
                          Estado
                        </p>

                        <p className="mt-1 text-[13px] font-medium text-foreground">
                          {registro.activo
                            ? "Cuenta activa"
                            : "Cuenta inactiva"}
                        </p>
                      </div>
                    </div>

                    {bolHayAcciones && (
                      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
                        {bolPuedeEditar && (
                          <button
                            type="button"
                            onClick={() =>
                              setStrIdEnEdicion(registro.id)
                            }
                            className="h-9 w-full rounded-lg border border-border px-3 text-[12px] font-medium text-primary transition-colors hover:bg-muted sm:w-auto"
                          >
                            Editar
                          </button>
                        )}

                        {bolPuedeCambiarEstado && (
                          <button
                            type="button"
                            onClick={() =>
                              cambiarEstado(registro)
                            }
                            className="h-9 w-full rounded-lg border border-border px-3 text-[12px] font-medium text-destructive transition-colors hover:bg-muted sm:w-auto"
                          >
                            {registro.activo
                              ? "Desactivar"
                              : "Activar"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

        {!bolCargando &&
          usuarios.length === 0 &&
          !strError && (
            <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-[13px] text-muted-foreground">
              No hay usuarios registrados.
            </div>
          )}
      </div>
    </div>
  );
}