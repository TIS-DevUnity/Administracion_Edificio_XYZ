function manejarErrores(err, req, res, next) {
  console.error(err);
  const esErrorMulter = err.name === "MulterError";
  const status = err.status || (esErrorMulter ? 400 : 500);
  res.status(status).json({ error: err.message || "Error interno del servidor" });
}

module.exports = { manejarErrores };
