const prisma = require("../../../config/prisma");
const { registrarAuditoria } = require("../auditoria/auditoria.service");
const { diferencias } = require("../../../utils/diferencias");
const { filtroOcupanteVigente } = require("./asignacion.util");

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
    activo: true,
    tipoInmuebleId: true,
    tipoInmueble: {
      select: { id: true, nombre: true, montoBase: true, pesoAgua: true },
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
 */
function presentar(inmueble) {
  const { _count, ...resto } = inmueble;
  return {
    ...resto,
    asignado: (_count?.ocupaciones ?? 0) > 0,
    tipoInmueble: resto.tipoInmueble ?? {
      id: null,
      nombre: ETIQUETA_CLASE[resto.clase] ?? resto.clase,
      montoBase: "0",
      pesoAgua: "0",
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

async function listar() {
  const inmuebles = await prisma.inmueble.findMany({
    select: camposPublicos(),
    orderBy: { codigo: "asc" },
  });
  return inmuebles.map(presentar);
}

async function obtenerPorId(id) {
  const inmueble = await prisma.inmueble.findUnique({
    where: { id },
    select: camposPublicos(),
  });
  if (!inmueble) {
    throw Object.assign(new Error("Inmueble no encontrado"), { status: 404 });
  }
  return presentar(inmueble);
}

async function crear({ codigo, clase = "DEPARTAMENTO", tipoInmuebleId, piso, areaM2, actorId, ip }) {
  validarClase(clase);

  const existente = await prisma.inmueble.findUnique({ where: { codigo } });
  if (existente) {
    throw Object.assign(new Error("Ya existe un inmueble con ese codigo"), { status: 409 });
  }

  // Solo el departamento tiene tipo (A, B, C...). Baulera y parqueo no.
  if (clase === "DEPARTAMENTO") {
    if (!tipoInmuebleId) {
      throw errorValidacion("tipoInmuebleId es requerido para un departamento");
    }
    await obtenerTipoInmueble(tipoInmuebleId);
  } else if (tipoInmuebleId) {
    throw errorValidacion("Baulera y parqueo no tienen tipo: no envie tipoInmuebleId");
  }

  const inmueble = await prisma.inmueble.create({
    data: {
      codigo,
      clase,
      tipoInmuebleId: clase === "DEPARTAMENTO" ? tipoInmuebleId : null,
      piso,
      areaM2,
    },
    select: camposPublicos(),
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "Inmueble",
    entidadId: inmueble.id,
    detalle: { codigo, clase, tipoInmuebleId: inmueble.tipoInmuebleId, piso, areaM2 },
    ip,
  });

  return presentar(inmueble);
}

async function actualizar(id, { codigo, clase, tipoInmuebleId, piso, areaM2, activo }, { actorId, ip }) {
  const antes = await obtenerPorId(id);

  if (codigo) {
    const conflicto = await prisma.inmueble.findUnique({ where: { codigo } });
    if (conflicto && conflicto.id !== id) {
      throw Object.assign(new Error("Ya existe un inmueble con ese codigo"), { status: 409 });
    }
  }

  const claseFinal = clase ?? antes.clase;
  validarClase(claseFinal);

  // El tipo resultante debe ser coherente con la clase: departamento con tipo, resto sin tipo.
  let tipoFinal = null;
  if (claseFinal === "DEPARTAMENTO") {
    tipoFinal = tipoInmuebleId || antes.tipoInmuebleId;
    if (!tipoFinal) {
      throw errorValidacion("Un departamento necesita tipo: envie tipoInmuebleId");
    }
    if (tipoFinal !== antes.tipoInmuebleId) {
      await obtenerTipoInmueble(tipoFinal);
    }
  } else if (tipoInmuebleId) {
    throw errorValidacion("Baulera y parqueo no tienen tipo: no envie tipoInmuebleId");
  }

  const inmueble = await prisma.inmueble.update({
    where: { id },
    data: { codigo, clase: claseFinal, tipoInmuebleId: tipoFinal, piso, areaM2, activo },
    select: camposPublicos(),
  });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "Inmueble",
    entidadId: inmueble.id,
    detalle: diferencias(antes, inmueble, ["codigo", "clase", "tipoInmuebleId", "piso", "areaM2", "activo"]),
    ip,
  });

  return presentar(inmueble);
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
