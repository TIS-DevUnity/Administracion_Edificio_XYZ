const crypto = require("crypto");
const prisma = require("../../../config/prisma");
const { supabase, STORAGE_BUCKET } = require("../../../config/supabase");
const { registrarAuditoria } = require("../auditoria/auditoria.service");

const CATEGORIAS_VALIDAS = [
  "ACTA",
  "REGLAMENTO",
  "CONTRATO",
  "FACTURA",
  "FOTOGRAFIA",
  "COTIZACION",
  "OTRO",
];

const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  categoria: true,
  mimeType: true,
  tamanioBytes: true,
  entidad: true,
  entidadId: true,
  subidoPorId: true,
  createdAt: true,
};

function construirStoragePath(categoria, nombreOriginal) {
  const sufijo = crypto.randomUUID();
  const nombreLimpio = nombreOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${categoria.toLowerCase()}/${sufijo}-${nombreLimpio}`;
}

async function listar({ categoria, entidad, entidadId }) {
  return prisma.documento.findMany({
    where: {
      ...(categoria ? { categoria } : {}),
      ...(entidad ? { entidad } : {}),
      ...(entidadId ? { entidadId } : {}),
    },
    select: CAMPOS_PUBLICOS,
    orderBy: { createdAt: "desc" },
  });
}

async function obtenerPorId(id) {
  const documento = await prisma.documento.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  if (!documento) {
    throw Object.assign(new Error("Documento no encontrado"), { status: 404 });
  }
  return documento;
}

async function obtenerUrlDescarga(id) {
  const documento = await prisma.documento.findUnique({ where: { id } });
  if (!documento) {
    throw Object.assign(new Error("Documento no encontrado"), { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(documento.storagePath, 60 * 5); // 5 minutos

  if (error) {
    throw Object.assign(new Error(`No se pudo generar el enlace de descarga: ${error.message}`), {
      status: 502,
    });
  }

  return { documento: await obtenerPorId(id), url: data.signedUrl };
}

async function crear({ archivo, categoria, entidad, entidadId, actorId, ip }) {
  if (!archivo) {
    throw Object.assign(new Error("El archivo es requerido"), { status: 400 });
  }
  if (!categoria || !CATEGORIAS_VALIDAS.includes(categoria)) {
    throw Object.assign(
      new Error(`categoria invalida. Valores permitidos: ${CATEGORIAS_VALIDAS.join(", ")}`),
      { status: 400 }
    );
  }

  const storagePath = construirStoragePath(categoria, archivo.originalname);

  const { error: errorSubida } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, archivo.buffer, {
      contentType: archivo.mimetype,
      upsert: false,
    });

  if (errorSubida) {
    throw Object.assign(new Error(`No se pudo subir el archivo: ${errorSubida.message}`), {
      status: 502,
    });
  }

  let documento;
  try {
    documento = await prisma.documento.create({
      data: {
        nombre: archivo.originalname,
        categoria,
        mimeType: archivo.mimetype,
        tamanioBytes: archivo.size,
        storagePath,
        entidad: entidad || null,
        entidadId: entidadId || null,
        subidoPorId: actorId,
      },
      select: CAMPOS_PUBLICOS,
    });
  } catch (err) {
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw err;
  }

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "CREATE",
    entidad: "Documento",
    entidadId: documento.id,
    detalle: { nombre: documento.nombre, categoria, entidad, entidadId },
    ip,
  });

  return documento;
}

async function actualizar(id, { nombre, categoria, archivo, actorId, ip }) {
  const documento = await prisma.documento.findUnique({ where: { id } });
  if (!documento) {
    throw Object.assign(new Error("Documento no encontrado"), { status: 404 });
  }

  if (nombre === undefined && categoria === undefined && !archivo) {
    throw Object.assign(new Error("Debe enviar al menos un campo a modificar (nombre, categoria o archivo)"), {
      status: 400,
    });
  }

  if (categoria !== undefined && !CATEGORIAS_VALIDAS.includes(categoria)) {
    throw Object.assign(
      new Error(`categoria invalida. Valores permitidos: ${CATEGORIAS_VALIDAS.join(", ")}`),
      { status: 400 }
    );
  }

  const data = {};
  const cambios = {};

  if (nombre !== undefined && nombre !== documento.nombre) {
    data.nombre = nombre;
    cambios.nombre = { antes: documento.nombre, despues: nombre };
  }
  if (categoria !== undefined && categoria !== documento.categoria) {
    data.categoria = categoria;
    cambios.categoria = { antes: documento.categoria, despues: categoria };
  }

  let storagePathAnterior = null;
  if (archivo) {
    const nuevoStoragePath = construirStoragePath(categoria || documento.categoria, archivo.originalname);

    const { error: errorSubida } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(nuevoStoragePath, archivo.buffer, {
        contentType: archivo.mimetype,
        upsert: false,
      });

    if (errorSubida) {
      throw Object.assign(new Error(`No se pudo subir el archivo: ${errorSubida.message}`), {
        status: 502,
      });
    }

    data.storagePath = nuevoStoragePath;
    data.mimeType = archivo.mimetype;
    data.tamanioBytes = archivo.size;
    storagePathAnterior = documento.storagePath;
    cambios.archivo = { antes: documento.storagePath, despues: nuevoStoragePath };
  }

  let documentoActualizado;
  try {
    documentoActualizado = await prisma.documento.update({
      where: { id },
      data,
      select: CAMPOS_PUBLICOS,
    });
  } catch (err) {
    if (data.storagePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([data.storagePath]);
    }
    throw err;
  }

  if (storagePathAnterior) {
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePathAnterior]);
  }

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "UPDATE",
    entidad: "Documento",
    entidadId: id,
    detalle: cambios,
    ip,
  });

  return documentoActualizado;
}

async function eliminar(id, { actorId, ip }) {
  const documento = await prisma.documento.findUnique({ where: { id } });
  if (!documento) {
    throw Object.assign(new Error("Documento no encontrado"), { status: 404 });
  }

  await supabase.storage.from(STORAGE_BUCKET).remove([documento.storagePath]);
  await prisma.documento.delete({ where: { id } });

  await registrarAuditoria({
    usuarioId: actorId,
    accion: "DELETE",
    entidad: "Documento",
    entidadId: id,
    detalle: { nombre: documento.nombre, categoria: documento.categoria },
    ip,
  });
}

module.exports = { listar, obtenerPorId, obtenerUrlDescarga, crear, actualizar, eliminar, CATEGORIAS_VALIDAS };
