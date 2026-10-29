/**
 * Configuracion de mora que rige para una expensa: la que guardo al generarse. Las expensas
 * anteriores a ese campo usan la que regia en su fecha de creacion (o, en ultimo caso, la mas
 * reciente). `db` es prisma o una transaccion.
 */
async function configuracionDeLaExpensa(db, expensa) {
  if (expensa.configuracionMoraId) {
    const guardada = await db.configuracionMora.findUnique({ where: { id: expensa.configuracionMoraId } })
    if (guardada) return guardada
  }
  const delMomento = await db.configuracionMora.findFirst({
    where: { vigenteDesde: { lte: expensa.createdAt } },
    orderBy: { vigenteDesde: 'desc' }
  })
  if (delMomento) return delMomento
  return db.configuracionMora.findFirst({ orderBy: { vigenteDesde: 'desc' } })
}

module.exports = { configuracionDeLaExpensa }
