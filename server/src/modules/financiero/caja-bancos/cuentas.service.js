const prisma = require('../../../config/prisma')
const { registrarAuditoria } = require('../../operativo-seguridad/auditoria/auditoria.service')
const { errorHttp } = require('../expensas/saldo.util')
const {
  ETIQUETA_TIPO,
  vacio,
  exigirCampos,
  normalizarTipo,
  normalizarNombre,
  normalizarBanco,
  normalizarNumeroCuenta,
  parsearSaldoInicial,
  dinero,
  esMarcador
} = require('./cuentas.util')

const OPCIONES_TX = { timeout: 15000 }
const ESTADOS_SIN_RESOLVER = ['PENDIENTE', 'CON_DIFERENCIA']
const INCLUIR = { _count: { select: { movimientos: true } } }

// ---------------------------------------------------------------------------
// Presentacion y auditoria
// ---------------------------------------------------------------------------

/** Forma publica de una cuenta. `saldoActual` no se expone: esta en desuso (los saldos se calculan). */
function presentar(cuenta) {
  return {
    id: cuenta.id,
    nombre: cuenta.nombre,
    tipo: cuenta.tipo,
    tipoEtiqueta: ETIQUETA_TIPO[cuenta.tipo],
    banco: cuenta.banco,
    numeroCuenta: cuenta.numeroCuenta,
    esPorDefecto: cuenta.esPorDefecto,
    activa: cuenta.activa,
    saldoInicial: dinero(cuenta.saldoInicial),
    tieneMovimientos: (cuenta._count?.movimientos ?? 0) > 0,
    // true mientras conserve los datos de marcador de la migracion: falta completarlos.
    datosPendientes: esMarcador(cuenta),
    createdAt: cuenta.createdAt,
    updatedAt: cuenta.updatedAt
  }
}

function valorAuditable(campo, valor) {
  return campo === 'saldoInicial' ? dinero(valor) : valor
}

function detalleCreacion(cuenta) {
  return {
    nombre: cuenta.nombre,
    tipo: cuenta.tipo,
    banco: cuenta.banco,
    numeroCuenta: cuenta.numeroCuenta,
    saldoInicial: dinero(cuenta.saldoInicial),
    esPorDefecto: cuenta.esPorDefecto
  }
}

// ---------------------------------------------------------------------------
// Bloqueos y unicidad
// ---------------------------------------------------------------------------

/**
 * Serializa toda escritura sobre cuentas. El lock de aplicacion cubre lo que no tiene fila que
 * bloquear (dos altas simultaneas con el mismo nombre); el de filas cubre "una sola cuenta por
 * defecto por tipo". NO KEY UPDATE evita frenar un cobro que solo referencia la cuenta.
 */
async function bloquearCuentas(tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('caja-bancos:cuentas'))`
  await tx.$queryRaw`SELECT "id" FROM "cuentas_bancarias" ORDER BY "id" FOR NO KEY UPDATE`
}

/** El nombre y el numero de cuenta no se repiten (sin importar mayusculas). `excluirId` es la propia cuenta. */
async function verificarUnicos(tx, { nombre, numeroCuenta, excluirId }) {
  const otra = excluirId ? { id: { not: excluirId } } : {}
  if (nombre) {
    const igual = await tx.cuentaBancaria.findFirst({
      where: { nombre: { equals: nombre, mode: 'insensitive' }, ...otra }
    })
    if (igual) throw errorHttp(`Ya existe una cuenta llamada "${igual.nombre}"`, 409)
  }
  if (numeroCuenta) {
    const igual = await tx.cuentaBancaria.findFirst({
      where: { numeroCuenta: { equals: numeroCuenta, mode: 'insensitive' }, ...otra }
    })
    if (igual) throw errorHttp(`Ya existe una cuenta con el numero ${igual.numeroCuenta}`, 409)
  }
}

/** Un P2002 llega si dos altas con el mismo numero de cuenta se cruzaron: gana la primera. */
function traducirDuplicado(err) {
  if (err.code === 'P2002') return errorHttp('Ya existe una cuenta con ese numero de cuenta', 409)
  return err
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

async function listar({ tipo, incluirInactivas } = {}) {
  const tipoNormalizado = vacio(tipo) ? null : normalizarTipo(tipo)
  const cuentas = await prisma.cuentaBancaria.findMany({
    where: {
      ...(tipoNormalizado ? { tipo: tipoNormalizado } : {}),
      ...(incluirInactivas === 'true' ? {} : { activa: true })
    },
    include: INCLUIR,
    orderBy: [{ tipo: 'asc' }, { esPorDefecto: 'desc' }, { nombre: 'asc' }]
  })
  return cuentas.map(presentar)
}

async function buscar(id) {
  const cuenta = await prisma.cuentaBancaria.findUnique({ where: { id }, include: INCLUIR })
  if (!cuenta) throw errorHttp('Cuenta no encontrada', 404)
  return cuenta
}

async function obtener(id) {
  return presentar(await buscar(id))
}

// ---------------------------------------------------------------------------
// Altas y cambios
// ---------------------------------------------------------------------------

/**
 * Crea una cuenta de caja o de banco. La primera de cada tipo queda como cuenta por defecto; con
 * `esPorDefecto: true` la nueva reemplaza a la actual. El tipo no se podra cambiar despues.
 */
async function crear({ datos, usuarioId, ip }) {
  exigirCampos(datos, ['nombre', 'tipo'])
  const tipo = normalizarTipo(datos.tipo)
  const nombre = normalizarNombre(datos.nombre)

  let banco = null
  let numeroCuenta = null
  if (tipo === 'BANCO') {
    exigirCampos(datos, ['banco', 'numeroCuenta'])
    banco = normalizarBanco(datos.banco)
    numeroCuenta = normalizarNumeroCuenta(datos.numeroCuenta)
  } else if (!vacio(datos.banco) || !vacio(datos.numeroCuenta)) {
    throw errorHttp('Una caja no lleva banco ni numeroCuenta', 400)
  }

  const saldoInicial = vacio(datos.saldoInicial) ? parsearSaldoInicial(0) : parsearSaldoInicial(datos.saldoInicial)
  if (datos.esPorDefecto !== undefined && typeof datos.esPorDefecto !== 'boolean') {
    throw errorHttp('esPorDefecto debe ser true o false', 400)
  }

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await bloquearCuentas(tx)
      await verificarUnicos(tx, { nombre, numeroCuenta })

      const actual = await tx.cuentaBancaria.findFirst({ where: { tipo, esPorDefecto: true } })
      const seraPorDefecto = datos.esPorDefecto === true || !actual
      if (seraPorDefecto && actual) {
        await tx.cuentaBancaria.update({ where: { id: actual.id }, data: { esPorDefecto: false } })
      }

      const creada = await tx.cuentaBancaria.create({
        data: { nombre, tipo, banco, numeroCuenta, saldoInicial, esPorDefecto: seraPorDefecto },
        include: INCLUIR
      })
      return { creada, desplazada: seraPorDefecto ? actual : null }
    }, OPCIONES_TX)
  } catch (err) {
    throw traducirDuplicado(err)
  }

  await registrarAuditoria({
    usuarioId,
    accion: 'CREATE',
    entidad: 'CuentaBancaria',
    entidadId: resultado.creada.id,
    detalle: detalleCreacion(resultado.creada),
    ip
  })
  if (resultado.desplazada) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'CuentaBancaria',
      entidadId: resultado.desplazada.id,
      detalle: { esPorDefecto: { antes: true, despues: false } },
      ip
    })
  }

  return presentar(resultado.creada)
}

/**
 * Edita nombre, banco, numeroCuenta, saldoInicial o activa. Solo cambian los campos enviados.
 * El tipo no se edita (se desactiva la cuenta y se crea otra) y la cuenta por defecto se cambia
 * con `designarPorDefecto`.
 */
async function actualizar(id, { datos, usuarioId, ip }) {
  if (datos.tipo !== undefined) {
    throw errorHttp('El tipo de cuenta no se puede cambiar: desactive la cuenta y cree otra', 400)
  }
  if (datos.esPorDefecto !== undefined) {
    throw errorHttp(`Para cambiar la cuenta por defecto use POST /api/financiero/caja-bancos/cuentas/${id}/por-defecto`, 400)
  }
  const campos = ['nombre', 'banco', 'numeroCuenta', 'saldoInicial', 'activa']
  if (!campos.some((campo) => datos[campo] !== undefined)) {
    throw errorHttp(`Envie al menos uno de: ${campos.join(', ')}`, 400)
  }
  if (datos.activa !== undefined && typeof datos.activa !== 'boolean') {
    throw errorHttp('activa debe ser true o false', 400)
  }
  const vacios = ['nombre', 'saldoInicial'].filter((campo) => datos[campo] !== undefined && vacio(datos[campo]))
  if (vacios.length) {
    throw errorHttp(`Los campos obligatorios no pueden quedar vacios: ${vacios.join(', ')}`, 400, {
      codigo: 'CAMPOS_OBLIGATORIOS',
      detalle: { campos: vacios }
    })
  }

  // Lo que no depende de la cuenta se valida antes de abrir la transaccion.
  const nombre = datos.nombre !== undefined ? normalizarNombre(datos.nombre) : undefined
  const saldoInicial = datos.saldoInicial !== undefined ? parsearSaldoInicial(datos.saldoInicial) : undefined

  let resultado
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await bloquearCuentas(tx)
      const antes = await tx.cuentaBancaria.findUnique({ where: { id }, include: INCLUIR })
      if (!antes) throw errorHttp('Cuenta no encontrada', 404)

      const data = {}

      if (nombre !== undefined && nombre !== antes.nombre) {
        await verificarUnicos(tx, { nombre, excluirId: id })
        data.nombre = nombre
      }

      // Banco y numero de cuenta dependen del tipo: la caja no los lleva y el banco no puede dejarlos vacios.
      for (const campo of ['banco', 'numeroCuenta']) {
        if (datos[campo] === undefined) continue
        if (antes.tipo === 'CAJA') {
          if (!vacio(datos[campo])) throw errorHttp('Una caja no lleva banco ni numeroCuenta', 400)
          continue
        }
        if (vacio(datos[campo])) {
          throw errorHttp(`${campo} no puede quedar vacio en una cuenta bancaria`, 400, {
            codigo: 'CAMPOS_OBLIGATORIOS',
            detalle: { campos: [campo] }
          })
        }
        const valor = campo === 'banco' ? normalizarBanco(datos.banco) : normalizarNumeroCuenta(datos.numeroCuenta)
        if (valor !== antes[campo]) {
          if (campo === 'numeroCuenta') await verificarUnicos(tx, { numeroCuenta: valor, excluirId: id })
          data[campo] = valor
        }
      }

      if (datos.activa !== undefined && datos.activa !== antes.activa) {
        if (datos.activa === false) {
          if (antes.esPorDefecto) {
            throw errorHttp(
              'No se puede desactivar la cuenta por defecto: designe primero otra cuenta por defecto',
              409,
              { codigo: 'CUENTA_POR_DEFECTO_NO_DESACTIVABLE' }
            )
          }
          const pendientes = await tx.movimientoCaja.count({
            where: { cuentaId: id, estado: { in: ESTADOS_SIN_RESOLVER } }
          })
          if (pendientes > 0) {
            throw errorHttp(
              `La cuenta tiene ${pendientes} movimiento(s) pendientes o con diferencia: concilielos antes de desactivarla`,
              409,
              { codigo: 'CUENTA_CON_PENDIENTES', detalle: { pendientes } }
            )
          }
        }
        data.activa = datos.activa
      }

      if (saldoInicial !== undefined && !saldoInicial.equals(antes.saldoInicial)) {
        const cierres = await tx.cierreCajaCuenta.count({ where: { cuentaId: id } })
        if (cierres > 0) {
          throw errorHttp('El saldo inicial ya no se puede cambiar: la cuenta tiene periodos cerrados', 409, {
            codigo: 'SALDO_INICIAL_BLOQUEADO'
          })
        }
        data.saldoInicial = saldoInicial
      }

      if (Object.keys(data).length === 0) return { antes, despues: antes, cambios: {} }

      const despues = await tx.cuentaBancaria.update({ where: { id }, data, include: INCLUIR })
      const cambios = {}
      for (const campo of Object.keys(data)) {
        cambios[campo] = { antes: valorAuditable(campo, antes[campo]), despues: valorAuditable(campo, despues[campo]) }
      }
      return { antes, despues, cambios }
    }, OPCIONES_TX)
  } catch (err) {
    throw traducirDuplicado(err)
  }

  if (Object.keys(resultado.cambios).length > 0) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'CuentaBancaria',
      entidadId: id,
      detalle: resultado.cambios,
      ip
    })
  }
  return presentar(resultado.despues)
}

/**
 * Designa la cuenta por defecto de su tipo: la que usan los cobros y movimientos cuando no se indica
 * cuenta. En una sola transaccion se quita la marca a la anterior y se pone a esta.
 */
async function designarPorDefecto(id, { usuarioId, ip }) {
  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearCuentas(tx)
    const cuenta = await tx.cuentaBancaria.findUnique({ where: { id }, include: INCLUIR })
    if (!cuenta) throw errorHttp('Cuenta no encontrada', 404)
    if (!cuenta.activa) {
      throw errorHttp('Una cuenta desactivada no puede ser la cuenta por defecto: activela primero', 409, {
        codigo: 'CUENTA_INACTIVA'
      })
    }
    if (cuenta.esPorDefecto) return { cuenta, anteriores: [], sinCambios: true }

    const anteriores = await tx.cuentaBancaria.findMany({
      where: { tipo: cuenta.tipo, esPorDefecto: true, id: { not: id } }
    })
    if (anteriores.length > 0) {
      await tx.cuentaBancaria.updateMany({
        where: { id: { in: anteriores.map((a) => a.id) } },
        data: { esPorDefecto: false }
      })
    }
    const actualizada = await tx.cuentaBancaria.update({ where: { id }, data: { esPorDefecto: true }, include: INCLUIR })
    return { cuenta: actualizada, anteriores, sinCambios: false }
  }, OPCIONES_TX)

  if (!resultado.sinCambios) {
    await registrarAuditoria({
      usuarioId,
      accion: 'UPDATE',
      entidad: 'CuentaBancaria',
      entidadId: id,
      detalle: { esPorDefecto: { antes: false, despues: true } },
      ip
    })
    for (const anterior of resultado.anteriores) {
      await registrarAuditoria({
        usuarioId,
        accion: 'UPDATE',
        entidad: 'CuentaBancaria',
        entidadId: anterior.id,
        detalle: { esPorDefecto: { antes: true, despues: false } },
        ip
      })
    }
  }

  return {
    cuenta: presentar(resultado.cuenta),
    anterior: resultado.anteriores[0] ? presentar(resultado.anteriores[0]) : null,
    sinCambios: resultado.sinCambios
  }
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  designarPorDefecto
}
