/**
 * Normaliza un valor para compararlo: fechas a ISO, Decimal/numeros a texto,
 * booleanos tal cual, null/undefined a null.
 */
function normalizar(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean") return valor;
  if (typeof valor.toISOString === "function") return valor.toISOString();
  return String(valor);
}

/**
 * Devuelve { campo: { antes, despues } } solo con los campos que cambiaron.
 * `antes` y `despues` son los registros completos (antes y despues del cambio).
 */
function diferencias(antes, despues, campos) {
  const cambios = {};
  for (const campo of campos) {
    if (normalizar(antes[campo]) !== normalizar(despues[campo])) {
      cambios[campo] = { antes: normalizar(antes[campo]), despues: normalizar(despues[campo]) };
    }
  }
  return cambios;
}

module.exports = { diferencias };
