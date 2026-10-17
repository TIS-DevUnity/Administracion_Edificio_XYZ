/** Reglas de validación visual de HU6 (el backend también valida el contenido real). */
export const LIMITE_COMPROBANTE = 5 * 1024 * 1024;
const TIPOS = new Set(["image/jpeg", "image/png", "application/pdf"]);
const EXTENSION = /\.(jpe?g|png|pdf)$/i;

export function validarComprobante(archivo: File): string | null {
  if (archivo.size === 0) return "El comprobante está vacío. Selecciona un archivo válido.";
  if (archivo.size > LIMITE_COMPROBANTE) return "El comprobante supera el tamaño máximo permitido de 5 MB.";
  if (!EXTENSION.test(archivo.name) || (archivo.type && !TIPOS.has(archivo.type))) {
    return "Formato no permitido. Usa JPG, PNG o PDF.";
  }
  return null;
}
