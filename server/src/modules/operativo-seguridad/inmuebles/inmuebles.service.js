const { Prisma } = require("@prisma/client");
const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const { diferencias } = require("../../../utils/diferencias");
const { filtroOcupanteVigente } = require("./asignacion.util");
const { obtenerMapa, montoEfectivo, validarMonto } = require("../tarifas-inmueble/tarifas-inmueble.service");

const Decimal = Prisma.Decimal;

const CLASES_VALIDAS = ["DEPARTAMENTO", "BAULERA", "PARQUEO"];
const ETIQUETA_CLASE = { DEPARTAMENTO: "Departamento", BAULERA: "Baulera", PARQUEO: "Parqueo" };

// Se arma en cada consulta porque el filtro de "asignado" depende de la fecha de hoy.
function camposPublicos() {
  return {
    id: true,
    codigo: true,
    clase: true,
    piso: true,
    areaM2: true,
    descripcion: true,
    parqueoId: true,
    bauleraId: true,
    parqueo: { select: { id: true, codigo: true, activo: true } },
    baulera: { select: { id: true, codigo: true, activo: true } },
    esParqueoDe: { select: { id: true, codigo: true } },
    esBauleraDe: { select: { id: true, codigo: true } },
    activo: true,
    cuotaMensual: true,
    tipoInmuebleId: true,
    tipoInmueble: {
      select: { id: true, nombre: true, montoBase: true },
    },
    _count: { select: { ocupaciones: { where: filtroOcupanteVigente() } } },
    createdAt: true,
    updatedAt: true,
  };
}

/**
 * Forma publica de un inmueble. Agrega `asignado` (tiene un ocupante vigente) y, para
 * baulera y parqueo, que no tienen tipo, entrega un `tipoInmueble` de compatibilidad con la
 * clase como nombre y monto 0: quien ya consume la API espera siempre ese objeto. La marca
 * real es `clase` (y `tipoInmuebleId` en null).
 *
 * Tambien agrega `cargoMensual`: lo que el inmueble suma cada mes a la cuenta de quien lo
 * ocupa. En un departamento es la expensa fija de su tipo; en baulera y parqueo es su
 * En baulera y parqueo siempre es cero (son informativos).
 * `tarifas` es el mapa de obtenerMapa().
 */
function presentar(inmueble, tarifas) {
  const { _count, esParqueoDe, esBauleraDe, ...resto } = inmueble;
  const esDepartamento = resto.clase === "DEPARTAMENTO";
  const departamentoAsociado = esParqueoDe ?? esBauleraDe ?? null;
  const cargoMensual = esDepartamento
    ? new Decimal(resto.tipoInmueble?.montoBase ?? 0)
    : montoEfectivo(resto, tarifas);

  return {
    ...resto,
    cuotaMensual: resto.cuotaMensual === null ? null : new Decimal(resto.cuotaMensual).toFixed(2),
    cargoMensual: cargoMensual.toFixed(2),
    asignado: esDepartamento ? (_count?.ocupaciones ?? 0) > 0 : Boolean(departamentoAsociado),
    departamentoAsociado,
    tipoInmueble: resto.tipoInmueble ?? {
      id: null,
      nombre: ETIQUETA_CLASE[resto.clase] ?? resto.clase,
      montoBase: "0",
    },
  };
}

const CAMPOS_OCUPANTE = {
  id: true,
  inmuebleId: true,
  copropietarioId: true,
  esPropietario: true,
  fechaInicio: true,
  fechaFin: true,
  copropietario: {
    select: { id: true, nombre: true, apellido: true, ci: true },
  },
};

async function obtenerTipoInmueble(tipoInmuebleId) {
  const tipoInmueble = await prisma.tipoInmueble.findUnique({ where: { id: tipoInmuebleId } });
  if (!tipoInmueble) {
    throw Object.assign(new Error("Tipo de inmueble no encontrado"), { status: 404 });
  }
  return tipoInmueble;
}

function errorValidacion(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 });
}

function validarClase(clase) {
  if (!CLASES_VALIDAS.includes(clase)) {
    throw errorValidacion(`clase invalida. Valores permitidos: ${CLASES_VALIDAS.join(", ")}`);
  }
}

// `ids` (opcional) limita la lista a esos inmuebles.
async function listar({ ids } = {}) {
  const [inmuebles, tarifas] = await Promise.all([
    prisma.inmueble.findMany({
      where: ids ? { id: { in: ids } } : undefined,
      select: camposPublicos(),
      orderBy: { codigo: "asc" },
    }),
    obtenerMapa(),
  ]);
  return inmuebles.map((inmueble) => presentar(inmueble, tarifas));
}

async function obtenerPorId(id) {
  const [inmueble, tarifas] = await Promise.all([
    prisma.inmueble.findUnique({
      where: { id },
      select: camposPublicos(),
    }),
    obtenerMapa(),
  ]);
  if (!inmueble) {
    throw Object.assign(new Error("Inmueble no encontrado"), { status: 404 });
  }
  return presentar(inmueble, tarifas);
}

/** En la DEMO, un accesorio nunca puede tener cuota adicional. */
function parsearCuotaMensual(cuotaMensual, clase) {
  if (cuotaMensual === undefined) return undefined;
  if (cuotaMensual === null || cuotaMensual === "") return null;
  if (clase === "DEPARTAMENTO") {
    throw errorValidacion("La cuota fija de un departamento depende de su tipo");
  }
  const cuota = validarMonto(cuotaMensual, "cuotaMensual");
  if (cuota.gt(0)) {
    throw errorValidacion("Parqueos y bauleras son informativos: no tienen cuota mensual en DEMO");
  }
  return cuota;
}

/** Normaliza el texto y limita su extension para evitar carga accidental de datos personales. */
function validarDescripcion(descripcion, clase) {
  if (descripcion === undefined) return undefined;
  if (clase !== "DEPARTAMENTO") {
    if (descripcion !== null && String(descripcion).trim()) {
      throw errorValidacion("La descripcion solo se admite para departamentos");
    }
    return null;
  }
  if (descripcion === null || descripcion === "") return null;
  if (typeof descripcion !== "string" || descripcion.trim().length > 1000) {
    throw errorValidacion("La descripcion debe ser texto de hasta 1000 caracteres");
  }
  return descripcion.trim() || null;
}

async function validarAccesorio(id, clase, departamentoId) {
  if (id === undefined) return undefined;
  if (id === null || id === "") return null;
  if (typeof id !== "string") throw errorValidacion(`El id del ${clase.toLowerCase()} es invalido`);
  const accesorio = await prisma.inmueble.findUnique({
    where: { id },
    select: {
      id: true, clase: true, activo: true,
      esParqueoDe: { select: { id: true } },
      esBauleraDe: { select: { id: true } },
    },
  });
  if (!accesorio) {
    throw Object.assign(new Error(`${clase} no encontrado`), { status: 404 });
  }
  if (accesorio.clase !== clase) {
    throw errorValidacion(`El inmueble seleccionado no es ${clase.toLowerCase()}`);
  }
  if (!accesorio.activo) {
    throw Object.assign(new Error(`${clase} inactivo: no puede asignarse`), { status: 409 });
  }
  const asignado = clase === "PARQUEO" ? accesorio.esParqueoDe : accesorio.esBauleraDe;
  if (asignado && asignado.id !== departamentoId) {
    throw Object.assign(new Error(`${clase} ya esta asignado a otro departamento`), { status: 409 });
  }
  return id;
}

function errorUnicidadAccesorio(error) {
  if (error?.code === "P2002") {
    return Object.assign(new Error("Codigo o accesorio ya utilizado por otro inmueble"), { status: 409 });
  }
  return error;
}

async function crear({ codigo, clase = "DEPARTAMENTO", tipoInmuebleId, piso, areaM2, cuotaMensual, descripcion, parqueoId, bauleraId, actorId, ip }) {
  validarClase(clase);

  const existente = await prisma.inmueble.findUnique({ where: { codigo } });
  if (existente) {
    throw Object.assign(new Error("Ya existe un inmueble con ese codigo"), { status: 409 });
  }

  if (clase === "DEPARTAMENTO") {
    if (!tipoInmuebleId) throw errorValidacion("tipoInmuebleId es requerido para un departamento");
    await obtenerTipoInmueble(tipoInmuebleId);
    if (!parqueoId || !bauleraId) {
      throw errorValidacion("Cada departamento debe tener un parqueo y una baulera asignados");
    }
  } else {
    if (tipoInmuebleId) throw errorValidacion("Baulera y parqueo no tienen tipo: no envie tipoInmuebleId");
    if (parqueoId || bauleraId) throw errorValidacion("Solo un departamento puede tener parqueo y baulera");
  }

  const cuota = parsearCuotaMensual(cuotaMensual, clase);
  const texto = validarDescripcion(descripcion, clase);
  const parqueo = clase === "DEPARTAMENTO" ? await validarAccesorio(parqueoId, "PARQUEO", null) : null;
  const baulera = clase === "DEPARTAMENTO" ? await validarAccesorio(bauleraId, "BAULERA", null) : null;

  let inmueble;
  try {
    inmueble = await prisma.inmueble.create({
      data: {
        codigo, clase, tipoInmuebleId: clase === "DEPARTAMENTO" ? tipoInmuebleId : null,
        piso, areaM2, cuotaMensual: cuota ?? null,
        descripcion: texto ?? null, parqueoId: parqueo ?? null, bauleraId: baulera ?? null,
      },
      select: camposPublicos(),
    });
  } catch (error) {
    throw errorUnicidadAccesorio(error);
  }

  await registrarAuditoria({
    usuarioId: actorId, accion: "CREATE", entidad: "Inmueble", entidadId: inmueble.id,
    detalle: { codigo, clase, tipoInmuebleId: inmueble.tipoInmuebleId, piso, areaM2,
      cuotaMensual: cuota ? cuota.toFixed(2) : null, descripcion: texto ?? null,
      parqueoId: parqueo ?? null, bauleraId: baulera ?? null }, ip,
  });

  return presentar(inmueble, await obtenerMapa());
}

async function actualizar(
  id,
  { codigo, clase, tipoInmuebleId, piso, areaM2, activo, cuotaMensual, descripcion, parqueoId, bauleraId },
  { actorId, ip }
) {
  const antes = await obtenerPorId(id);

  if (codigo) {
    const conflicto = await prisma.inmueble.findUnique({ where: { codigo } });
    if (conflicto && conflicto.id !== id) {
      throw Object.assign(new Error("Ya existe un inmueble con ese codigo"), { status: 409 });
    }
  }

  const claseFinal = clase ?? antes.clase;
  validarClase(claseFinal);

  if (claseFinal !== antes.clase) {
    if (antes.parqueoId || antes.bauleraId || antes.departamentoAsociado) {
      throw Object.assign(new Error("Desasigne los accesorios antes de cambiar la clase del inmueble"), { status: 409 });
    }
    const ocupantes = await prisma.ocupanteInmueble.count({ where: { inmuebleId: id, fechaFin: null } });
    if (ocupantes > 0) {
      throw Object.assign(new Error("Retire las personas vigentes antes de cambiar la clase"), { status: 409 });
    }
  }

  let tipoFinal = null;
  if (claseFinal === "DEPARTAMENTO") {
    tipoFinal = tipoInmuebleId || antes.tipoInmuebleId;
    if (!tipoFinal) throw errorValidacion("Un departamento necesita tipo: envie tipoInmuebleId");
    if (tipoFinal !== antes.tipoInmuebleId) await obtenerTipoInmueble(tipoFinal);
    const parqueoFinal = parqueoId === undefined ? antes.parqueoId : parqueoId;
    const bauleraFinal = bauleraId === undefined ? antes.bauleraId : bauleraId;
    if (!parqueoFinal || !bauleraFinal) {
      throw errorValidacion("Cada departamento debe tener un parqueo y una baulera asignados");
    }
  } else if (tipoInmuebleId) {
    throw errorValidacion("Baulera y parqueo no tienen tipo: no envie tipoInmuebleId");
  }

  if (claseFinal !== "DEPARTAMENTO" && (parqueoId || bauleraId)) {
    throw errorValidacion("Solo un departamento puede tener parqueo y baulera");
  }

  const cuota = parsearCuotaMensual(cuotaMensual, claseFinal);
  const cuotaFinal = claseFinal === "DEPARTAMENTO" ? null : cuota;
  const texto = validarDescripcion(descripcion, claseFinal);
  const parqueo = claseFinal === "DEPARTAMENTO"
    ? await validarAccesorio(parqueoId, "PARQUEO", id) : null;
  const baulera = claseFinal === "DEPARTAMENTO"
    ? await validarAccesorio(bauleraId, "BAULERA", id) : null;

  let inmueble;
  try {
    inmueble = await prisma.inmueble.update({
      where: { id },
      data: {
        codigo, clase: claseFinal, tipoInmuebleId: tipoFinal,
        piso, areaM2, activo, cuotaMensual: cuotaFinal,
        descripcion: claseFinal === "DEPARTAMENTO" ? texto : null,
        parqueoId: parqueo, bauleraId: baulera,
      },
      select: camposPublicos(),
    });
  } catch (error) {
    throw errorUnicidadAccesorio(error);
  }

  const despues = presentar(inmueble, await obtenerMapa());
  await registrarAuditoria({
    usuarioId: actorId, accion: "UPDATE", entidad: "Inmueble", entidadId: id,
    detalle: diferencias(antes, despues, [
      "codigo", "clase", "tipoInmuebleId", "piso", "areaM2", "activo", "cuotaMensual",
      "descripcion", "parqueoId", "bauleraId",
    ]), ip,
  });
  return despues;
}

async function listarOcupantes(inmuebleId) {
  await obtenerPorId(inmuebleId);

  return prisma.ocupanteInmueble.findMany({
    where: { inmuebleId },
    select: CAMPOS_OCUPANTE,
    orderBy: { fechaInicio: "desc" },
  });
}

async function asignarOcupante(inmuebleId, { copropietarioId, esPropietario, fechaInicio }, { actorId, ip }) {
  const inmueble = await obtenerPorId(inmuebleId);
  if (inmueble.clase !== "DEPARTAMENTO") {
    throw errorValidacion("Propietarios e inquilinos solo se asignan a departamentos. Asocie el accesorio desde su departamento.");
  }
  if (!inmueble.activo) {
    throw Object.assign(
      new Error(`El inmueble ${inmueble.codigo} esta inactivo: no se le puede asignar una persona`),
      { status: 409, codigo: "INMUEBLE_INACTIVO" }
    );
  }

  const copropietario = await prisma.copropietario.findUnique({ where: { id: copropietarioId } });
  if (!copropietario) {
    throw Object.assign(new Error("Copropietario no encontrado"), { status: 404 });
  }

  const tipoEsPropietario = esPropietario ?? true;
  const fechaInicioNueva = fechaInicio ? new Date(fechaInicio) : new Date();
  const fechaCambio = new Date();

  const { nuevo, cerroOcupanteAnteriorId } = await prisma.$transaction(async (tx) => {
    // La misma persona no puede asociarse dos veces al mismo inmueble con la misma relacion.
    const yaAsociada = await tx.ocupanteInmueble.findFirst({
      where: { inmuebleId, copropietarioId, esPropietario: tipoEsPropietario, fechaFin: null },
    });
    if (yaAsociada) {
      throw Object.assign(
        new Error(
          `${copropietario.nombre} ${copropietario.apellido} ya se encuentra asociado al inmueble como ${
            tipoEsPropietario ? "propietario" : "inquilino"
          }`
        ),
        { status: 409, codigo: "ASOCIACION_DUPLICADA" }
      );
    }

    // Solo puede haber un ocupante activo del mismo tipo (propietario o inquilino)
    // a la vez por inmueble; un propietario y un inquilino si pueden estar activos
    // al mismo tiempo (el dueño que alquila su unidad).
    const activoAnterior = await tx.ocupanteInmueble.findFirst({
      where: { inmuebleId, esPropietario: tipoEsPropietario, fechaFin: null },
    });

    if (activoAnterior) {
      if (fechaCambio < activoAnterior.fechaInicio) {
        throw Object.assign(
          new Error("La fecha de finalizacion no puede ser anterior a la fecha de inicio del ocupante anterior"),
          { status: 400 }
        );
      }
      await tx.ocupanteInmueble.update({
        where: { id: activoAnterior.id },
        data: { fechaFin: fechaCambio },
      });
    }

    const creado = await tx.ocupanteInmueble.create({
      data: {
        inmuebleId,
        copropietarioId,
        esPropietario: tipoEsPropietario,
        fechaInicio: fechaInicioNueva,
      },
      select: CAMPOS_OCUPANTE,
    });

    return { nuevo: creado, cerroOcupanteAnteriorId: activoAnterior?.id ?? null };
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "OcupanteInmueble",
    entidadId: nuevo.id,
    detalle: { inmuebleId, copropietarioId, esPropietario: tipoEsPropietario, cerroOcupanteAnteriorId },
    ip,
  });

  return nuevo;
}

async function darDeBajaOcupante(inmuebleId, ocupanteId, { fechaFin: fechaFinInput, actorId, ip }) {
  const ocupante = await prisma.ocupanteInmueble.findUnique({ where: { id: ocupanteId } });
  if (!ocupante || ocupante.inmuebleId !== inmuebleId) {
    throw Object.assign(new Error("Ocupante no encontrado para este inmueble"), { status: 404 });
  }
  if (ocupante.fechaFin) {
    throw Object.assign(new Error("El ocupante ya fue dado de baja"), { status: 409 });
  }

  let fechaFin = new Date();
  if (fechaFinInput) {
    fechaFin = new Date(fechaFinInput);
    if (Number.isNaN(fechaFin.getTime())) {
      throw Object.assign(new Error("fechaFin invalida"), { status: 400 });
    }
  }

  if (fechaFin < ocupante.fechaInicio) {
    throw Object.assign(
      new Error("La fecha de finalizacion no puede ser anterior a la fecha de inicio"),
      { status: 400 }
    );
  }

  const actualizado = await prisma.ocupanteInmueble.update({
    where: { id: ocupanteId },
    data: { fechaFin },
    select: CAMPOS_OCUPANTE,
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "OcupanteInmueble",
    entidadId: actualizado.id,
    detalle: diferencias(ocupante, actualizado, ["fechaFin"]),
    ip,
  });

  return actualizado;
}

module.exports = {
  listar,
  obtenerPorId,
  crear,
  actualizar,
  listarOcupantes,
  asignarOcupante,
  darDeBajaOcupante,
};
