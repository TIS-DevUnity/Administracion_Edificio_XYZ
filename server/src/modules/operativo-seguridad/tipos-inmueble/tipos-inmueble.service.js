const { Prisma } = require("@prisma/client");
const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const { diferencias } = require("../../../utils/diferencias");

const Decimal = Prisma.Decimal;

const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  montoBase: true,
  pesoAgua: true,
  createdAt: true,
  updatedAt: true,
};

const MAX_NOMBRE = 50;
const MONTO_MAXIMO = new Decimal("99999999.99"); // limite de DECIMAL(10,2)
const PESO_MAXIMO = new Decimal("999.999"); // limite de DECIMAL(6,3)

function errorValidacion(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 });
}

function parsearNumero(valor, campo) {
  if (valor === undefined || valor === null || valor === "" || typeof valor === "boolean") {
    throw errorValidacion(`${campo} es requerido`);
  }
  try {
    const numero = new Decimal(valor);
    if (!numero.isFinite()) throw new Error();
    return numero;
  } catch {
    throw errorValidacion(`${campo} debe ser un numero`);
  }
}

function validarNombre(nombre) {
  if (typeof nombre !== "string" || !nombre.trim()) {
    throw errorValidacion("nombre es requerido");
  }
  const limpio = nombre.trim();
  if (limpio.length > MAX_NOMBRE) {
    throw errorValidacion(`nombre no puede superar ${MAX_NOMBRE} caracteres`);
  }
  return limpio;
}

/** Expensa fija mensual del tipo: 0 o mas, hasta 2 decimales. */
function validarMontoBase(valor) {
  const monto = parsearNumero(valor, "montoBase");
  if (monto.lt(0)) throw errorValidacion("montoBase no puede ser negativo");
  if (monto.decimalPlaces() > 2) throw errorValidacion("montoBase admite como maximo 2 decimales");
  if (monto.gt(MONTO_MAXIMO)) throw errorValidacion("montoBase supera el maximo permitido");
  return monto;
}

/** Peso del tipo en el reparto del agua: mayor que 0, hasta 3 decimales. */
function validarPesoAgua(valor) {
  const peso = parsearNumero(valor, "pesoAgua");
  if (peso.lte(0)) throw errorValidacion("pesoAgua debe ser mayor que 0");
  if (peso.decimalPlaces() > 3) throw errorValidacion("pesoAgua admite como maximo 3 decimales");
  if (peso.gt(PESO_MAXIMO)) throw errorValidacion("pesoAgua supera el maximo permitido");
  return peso;
}

async function listar() {
  return prisma.tipoInmueble.findMany({
    select: CAMPOS_PUBLICOS,
    orderBy: { nombre: "asc" },
  });
}

async function obtenerPorId(id) {
  const tipoInmueble = await prisma.tipoInmueble.findUnique({
    where: { id },
    select: CAMPOS_PUBLICOS,
  });
  if (!tipoInmueble) {
    throw Object.assign(new Error("Tipo de inmueble no encontrado"), { status: 404 });
  }
  return tipoInmueble;
}

async function crear({ nombre, montoBase, pesoAgua, actorId, ip }) {
  const nombreLimpio = validarNombre(nombre);
  const monto = validarMontoBase(montoBase);
  const peso = pesoAgua === undefined || pesoAgua === null || pesoAgua === "" ? new Decimal(1) : validarPesoAgua(pesoAgua);

  const existente = await prisma.tipoInmueble.findUnique({ where: { nombre: nombreLimpio } });
  if (existente) {
    throw Object.assign(new Error("Ya existe un tipo con ese nombre"), { status: 409 });
  }

  const tipoInmueble = await prisma.tipoInmueble.create({
    data: { nombre: nombreLimpio, montoBase: monto, pesoAgua: peso },
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "TipoInmueble",
    entidadId: tipoInmueble.id,
    detalle: { nombre: nombreLimpio, montoBase: monto.toFixed(2), pesoAgua: peso.toString() },
    ip,
  });

  return tipoInmueble;
}

/**
 * Cambia el nombre, la expensa fija o el peso de agua de un tipo. Solo afecta a las expensas
 * que se generen despues: las ya generadas guardan su propio monto y peso.
 */
async function actualizar(id, { nombre, montoBase, pesoAgua }, { actorId, ip }) {
  const antes = await obtenerPorId(id);

  const data = {};
  if (nombre !== undefined) data.nombre = validarNombre(nombre);
  if (montoBase !== undefined) data.montoBase = validarMontoBase(montoBase);
  if (pesoAgua !== undefined) data.pesoAgua = validarPesoAgua(pesoAgua);

  if (Object.keys(data).length === 0) {
    throw errorValidacion("Envie al menos uno de: nombre, montoBase, pesoAgua");
  }

  if (data.nombre && data.nombre !== antes.nombre) {
    const conflicto = await prisma.tipoInmueble.findUnique({ where: { nombre: data.nombre } });
    if (conflicto && conflicto.id !== id) {
      throw Object.assign(new Error("Ya existe un tipo con ese nombre"), { status: 409 });
    }
  }

  const tipoInmueble = await prisma.tipoInmueble.update({
    where: { id },
    data,
    select: CAMPOS_PUBLICOS,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "TipoInmueble",
    entidadId: tipoInmueble.id,
    detalle: diferencias(antes, tipoInmueble, ["nombre", "montoBase", "pesoAgua"]),
    ip,
  });

  return tipoInmueble;
}

module.exports = { listar, obtenerPorId, crear, actualizar };
