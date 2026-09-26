const multer = require("multer");

const MIME_PERMITIDOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_TAMANIO_BYTES = 15 * 1024 * 1024; // 15MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TAMANIO_BYTES },
  fileFilter(req, file, cb) {
    if (!MIME_PERMITIDOS.includes(file.mimetype)) {
      return cb(Object.assign(new Error("Tipo de archivo no permitido"), { status: 400 }));
    }
    cb(null, true);
  },
});

module.exports = { upload };
