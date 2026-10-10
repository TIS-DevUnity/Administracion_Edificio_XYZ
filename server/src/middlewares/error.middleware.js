function manejarErrores(err, req, res, next) {
  console.error(err);
  const esErrorMulter = err.name === "MulterError";
  const status = err.status || (esErrorMulter ? 400 : 500);
  const cuerpo = { error: err.message || "Error interno del servidor" };
  // Los errores de negocio pueden traer un codigo y datos para que el cliente los muestre.
  if (err.codigo) cuerpo.codigo = err.codigo;
  if (err.detalle) cuerpo.detalle = err.detalle;
  res.status(status).json(cuerpo);
}

module.exports = { manejarErrores };
