export interface ReglaPassword {
  id: string;
  label: string;
  cumple: (strValor: string) => boolean;
}

export const REGLAS_PASSWORD: ReglaPassword[] = [
  { id: "longitud", label: "Al menos 10 caracteres", cumple: (strValor) => strValor.length >= 10 },
  { id: "mayuscula", label: "Al menos una letra mayúscula", cumple: (strValor) => /[A-Z]/.test(strValor) },
  { id: "minuscula", label: "Al menos una letra minúscula", cumple: (strValor) => /[a-z]/.test(strValor) },
  { id: "numero", label: "Al menos un número", cumple: (strValor) => /[0-9]/.test(strValor) },
  {
    id: "especial",
    label: "Al menos un carácter especial (@, #, $, %, !...)",
    cumple: (strValor) => /[^A-Za-z0-9\s]/.test(strValor),
  },
];

export function validarPassword(strValor: string): boolean {
  return REGLAS_PASSWORD.every((regla) => regla.cumple(strValor));
}
