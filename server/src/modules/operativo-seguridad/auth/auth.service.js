const prisma = require("../../../config/prisma");
const { comparePassword } = require("../../../utils/hash");
const { signToken } = require("../../../utils/jwt");
const { registrarAuditoria } = require("../auditoria/auditoria.service");

async function login({ email, password, ip }) {
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario || !usuario.activo) {
    throw Object.assign(new Error("Credenciales invalidas"), { status: 401 });
  }

  const passwordValida = await comparePassword(password, usuario.passwordHash);
  if (!passwordValida) {
    await registrarAuditoria({
      usuarioId: usuario.id,
      rol: usuario.rol,
      accion: "LOGIN_FALLIDO",
      entidad: "Usuario",
      entidadId: usuario.id,
      ip,
    });
    throw Object.assign(new Error("Credenciales invalidas"), { status: 401 });
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoLogin: new Date() },
  });

  await registrarAuditoria({
    usuarioId: usuario.id,
    rol: usuario.rol,
    accion: "LOGIN",
    entidad: "Usuario",
    entidadId: usuario.id,
    ip,
  });

  const token = signToken({ id: usuario.id, email: usuario.email, rol: usuario.rol });

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rol: usuario.rol,
    },
  };
}

module.exports = { login };
