/**
 * Interruptor de los asientos de caja y bancos (HU7). Con la variable apagada, los cobros y los
 * movimientos extraordinarios se comportan exactamente como antes de HU7: no crean asientos ni
 * validan periodos. Permite desplegar el codigo antes de aplicar la migracion y el backfill.
 *
 * Es el UNICO lugar donde se lee CAJA_BANCOS_ASIENTOS: el resto del codigo llama a asientosActivos().
 * Cambiar el .env requiere reiniciar el servidor.
 */
function asientosActivos() {
  return String(process.env.CAJA_BANCOS_ASIENTOS ?? '').trim().toLowerCase() === 'true'
}

module.exports = { asientosActivos }
