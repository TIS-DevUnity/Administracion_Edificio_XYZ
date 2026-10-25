import axios from "axios";
export const dinero = (n: number | string | null | undefined) =>
  n == null ? "Sin registrar" : new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(Number(n));
export const fechaLegible = (f?: string | null) => f ? String(f).slice(0, 10).split("-").reverse().join("/") : "—";
export const mesActual = () => {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
};
export const mesRelativo = (periodo: string, cantidad: number) => {
  const [a, m] = periodo.split("-").map(Number);
  const d = new Date(a, m - 1 + cantidad, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const mensajeError = (err: unknown) => {
  if (axios.isAxiosError(err)) {
    const datos = err.response?.data as { message?: string; mensaje?: string; codigo?: string } | undefined;
    return datos?.message ?? datos?.mensaje ?? (err.response ? `Solicitud rechazada (${err.response.status})` : "No se pudo conectar con el servidor");
  }
  return err instanceof Error ? err.message : "Ocurrió un error inesperado";
};
export const montoValido = (v: string, permitirNegativos = true) =>
  /^-?\d+(?:[.,]\d{1,2})?$/.test(v.trim()) && Number.isFinite(Number(v.replace(",", "."))) && (permitirNegativos || Number(v.replace(",", ".")) > 0);
