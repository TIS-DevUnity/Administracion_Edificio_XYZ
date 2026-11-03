const rateLimit = require("express-rate-limit");

const MAX_FALLOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

/**
 * Limita los intentos de login fallidos por IP: tras 5 fallos en 15 minutos responde 429.
 * Los logins correctos no cuentan. El contador vive en memoria, asi que se reinicia con el servidor.
 */
const limitarLogin = rateLimit({
  windowMs: VENTANA_MS,
  max: MAX_FALLOS,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const faltanMs = req.rateLimit?.resetTime ? req.rateLimit.resetTime.getTime() - Date.now() : VENTANA_MS;
    const minutos = Math.max(1, Math.ceil(faltanMs / 60000));
    const unidad = minutos === 1 ? "minuto" : "minutos";
    res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} ${unidad}` });
  },
});

module.exports = { limitarLogin, MAX_FALLOS, VENTANA_MS };
