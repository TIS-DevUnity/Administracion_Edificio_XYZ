const { Prisma } = require("@prisma/client");
const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const { diferencias } = require("../../../utils/diferencias");

const Decimal = Prisma.Decimal;

// Solo baulera y parqueo tienen tarifa por clase: el departamento cobra la de su tipo (A, B, C...).
const CLASES_CON_TARIFA = ["PARQUEO", "BAULERA"];
const MONTO_MAXIMO = new Decimal("99999999.99"); // limite de DECIMAL(10,2)

function errorValidacion(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 });
}

/**
 * Convierte un monto recibido a Decimal: 0 o mas, hasta 2 decimales. `campo` es solo para el
 * mensaje de error. 0 es valido (la clase o el inmueble no se cobra).
 */
function validarMonto(valor, campo = "monto") {
  if (valor === undefined || valor === null || valor === "" || typeof valor === "boolean") {
    throw errorValidacion(`${campo} es requerido`);
  }
  let monto;
  try {
    monto = new Decimal(valor);
  } catch {
    throw errorValidacion(`${campo} debe ser un numero`);
  }
  if (!monto.isFinite()) throw errorValidacion(`${campo} debe ser un numero`);
  if (monto.lt(0)) throw errorValidacion(`${campo} no puede ser negativo`);
  if (monto.decimalPlaces() > 2) throw errorValidacion(`${campo} admite como maximo 2 decimales`);
  if (monto.gt(MONTO_MAXIMO)) throw errorValidacion(`${campo} supera el maximo permitido`);
  return monto;
}

function validarClase(clase) {
  const normalizada = typeof clase === "string" ? clase.trim().toUpperCase() : "";
  if (!CLASES_CON_TARIFA.includes(normalizada)) {
    throw errorValidacion(`clase invalida. Valores permitidos: ${CLASES_CON_TARIFA.join(", ")}`);
  }
  return normalizada;
}

/** Tarifas vigentes por clase: { PARQUEO: Decimal, BAULERA: Decimal }. Sin definir = 0. */
async function obtenerMapa(db = prisma) {
  const filas = await db.tarifaClase.findMany();
  const mapa = Object.fromEntries(CLASES_CON_TARIFA.map((clase) => [clase, new Decimal(0)]));
  for (const fila of filas) {
    if (tieneTarifa(fila.clase)) mapa[fila.clase] = new Decimal(fila.monto);
  }
  return mapa;
}

function tieneTarifa(clase) {
  return CLASES_CON_TARIFA.includes(clase);
}

/**
 * Monto mensual que paga un inmueble que no es departamento: su monto propio si lo tiene
 * (0 = exento), si no la tarifa de su clase. Un departamento devuelve 0: su cuota es la del tipo.
 */
function montoEfectivo(inmueble, tarifas) {
  if (!tieneTarifa(inmueble.clase)) return new Decimal(0);
  if (inmueble.cuotaMensual !== null && inmueble.cuotaMensual !== undefined) {
    return new Decimal(inmueble.cuotaMensual);
  }
  return tarifas[inmueble.clase] ?? new Decimal(0);
}

async function listar() {
  const filas = await prisma.tarifaClase.findMany();
  const porClase = new Map(filas.map((fila) => [fila.clase, fila]));

  return CLASES_CON_TARIFA.map((clase) => {
    const fila = porClase.get(clase);
    return {
      clase,
      monto: new Decimal(fila ? fila.monto : 0).toFixed(2),
      definida: Boolean(fila),
      updatedAt: fila ? fila.updatedAt : null,
    };
  });
}

/**
 * Define la tarifa mensual de una clase. Solo afecta a las expensas que se generen despues:
 * las ya generadas conservan sus cargos.
 */
async function actualizar(claseRecibida, { monto }, { actorId, ip }) {
  const clase = validarClase(claseRecibida);
  const nuevoMonto = validarMonto(monto);

  const antes = await prisma.tarifaClase.findUnique({ where: { clase } });
  const tarifa = await prisma.tarifaClase.upsert({
    where: { clase },
    create: { clase, monto: nuevoMonto },
    update: { monto: nuevoMonto },
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: antes ? "UPDATE" : "CREATE",
    entidad: "TarifaClase",
    entidadId: tarifa.id,
    detalle: antes
      ? { clase, ...diferencias(antes, tarifa, ["monto"]) }
      : { clase, monto: { antes: null, despues: nuevoMonto.toFixed(2) } },
    ip,
  });

  return {
    clase,
    monto: new Decimal(tarifa.monto).toFixed(2),
    definida: true,
    updatedAt: tarifa.updatedAt,
  };
}

module.exports = {
  CLASES_CON_TARIFA,
  validarMonto,
  obtenerMapa,
  montoEfectivo,
  listar,
  actualizar,
};
