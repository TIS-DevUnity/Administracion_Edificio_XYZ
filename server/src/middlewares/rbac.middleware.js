const CODIGO_SIN_PERMISO = "SIN_PERMISO";

/**
 * Restringe el acceso a los roles indicados. Debe usarse siempre despues de `autenticar`.
 * El 403 lleva `codigo: "SIN_PERMISO"` (estable, para que el cliente lo maneje) ademas del mensaje `error`.
 * Uso: router.post("/", autenticar, autorizar("ADMINISTRADOR"), controller.crear)
 */
function autorizar(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: "No autenticado" });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tiene permisos para esta accion", codigo: CODIGO_SIN_PERMISO });
    }
    next();
  };
}

module.exports = { autorizar, CODIGO_SIN_PERMISO };
