-- HU6 (gastos e ingresos extraordinarios), HU5/HU3 (reenvio de pagos), HU3 CA11 (planes de pago en
-- cuotas), CA15 (notificaciones de la campanita) y CA16 (registro de correos).
--
-- Movimientos existentes: sus categorias de texto pasan a ser filas de `categorias_movimiento`, la
-- descripcion pasa a ser el concepto (obligatorio; si estaba vacia se usa la categoria) y la fecha
-- queda como dia de calendario (hora de Bolivia).

-- CreateEnum
CREATE TYPE "EstadoPlanPago" AS ENUM ('ACTIVO', 'COMPLETADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('PROXIMO_VENCIMIENTO', 'PROXIMA_MORA', 'OBLIGACION_VENCIDA', 'MORA_APLICADA', 'DEUDA_CON_MORA', 'PAGO_REGISTRADO');

-- CreateEnum
CREATE TYPE "TipoCorreo" AS ENUM ('EXPENSA_GENERADA', 'MORA_APLICADA');

-- CreateEnum
CREATE TYPE "EstadoEnvioCorreo" AS ENUM ('ENVIADO', 'FALLIDO', 'OMITIDO');

-- ---------------------------------------------------------------------------
-- HU6: categorias y movimientos financieros
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "categorias_movimiento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categorias_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_movimiento_tipo_nombre_key" ON "categorias_movimiento"("tipo", "nombre");

-- Categorias iniciales (el administrador puede agregar mas)
INSERT INTO "categorias_movimiento" ("id", "nombre", "tipo", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Mantenimiento y reparaciones', 'EGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Servicios basicos', 'EGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Limpieza', 'EGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Seguridad', 'EGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Compras y materiales', 'EGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Honorarios profesionales', 'EGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Otros gastos', 'EGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Alquiler de areas comunes', 'INGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Multas y sanciones', 'INGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Aportes extraordinarios', 'INGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Intereses bancarios', 'INGRESO', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Otros ingresos', 'INGRESO', CURRENT_TIMESTAMP);

-- AlterTable: columnas nuevas
ALTER TABLE "movimientos_financieros"
  ADD COLUMN "categoriaId" TEXT,
  ADD COLUMN "comprobantePath" TEXT,
  ADD COLUMN "comprobanteMime" TEXT,
  ADD COLUMN "comprobanteNombre" TEXT,
  ADD COLUMN "claveSolicitud" TEXT,
  ADD COLUMN "huella" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "movimientos_financieros" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Las categorias de texto que ya existian pasan a ser categorias propias de su tipo
INSERT INTO "categorias_movimiento" ("id", "nombre", "tipo", "updatedAt")
SELECT gen_random_uuid()::text, "categoria", "tipo", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tipo", "categoria" FROM "movimientos_financieros") AS existentes
ON CONFLICT ("tipo", "nombre") DO NOTHING;

UPDATE "movimientos_financieros" AS m
SET "categoriaId" = c."id"
FROM "categorias_movimiento" AS c
WHERE c."tipo" = m."tipo" AND c."nombre" = m."categoria";

-- El concepto es obligatorio: la descripcion vieja, o la categoria si no tenia descripcion
UPDATE "movimientos_financieros"
SET "descripcion" = "categoria"
WHERE "descripcion" IS NULL OR btrim("descripcion") = '';

ALTER TABLE "movimientos_financieros" RENAME COLUMN "descripcion" TO "concepto";
ALTER TABLE "movimientos_financieros" ALTER COLUMN "concepto" SET NOT NULL;
ALTER TABLE "movimientos_financieros" ALTER COLUMN "categoriaId" SET NOT NULL;
ALTER TABLE "movimientos_financieros" DROP COLUMN "categoria";

-- La fecha del movimiento es un dia de calendario (hora de Bolivia)
ALTER TABLE "movimientos_financieros" ALTER COLUMN "fecha" DROP DEFAULT;
ALTER TABLE "movimientos_financieros"
  ALTER COLUMN "fecha" TYPE DATE USING ("fecha" AT TIME ZONE 'America/La_Paz')::date;

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_financieros_comprobantePath_key" ON "movimientos_financieros"("comprobantePath");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_financieros_claveSolicitud_key" ON "movimientos_financieros"("claveSolicitud");

-- CreateIndex
CREATE INDEX "movimientos_financieros_categoriaId_idx" ON "movimientos_financieros"("categoriaId");

-- CreateIndex
CREATE INDEX "movimientos_financieros_huella_createdAt_idx" ON "movimientos_financieros"("huella", "createdAt");

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_movimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El monto de un movimiento siempre es mayor que cero (NOT VALID: no revisa filas viejas)
ALTER TABLE "movimientos_financieros"
  ADD CONSTRAINT "movimientos_financieros_monto_positivo" CHECK ("monto" > 0) NOT VALID;

-- ---------------------------------------------------------------------------
-- Reenvio de pagos: clave de solicitud en el recibo
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "recibos" ADD COLUMN "claveSolicitud" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "recibos_claveSolicitud_key" ON "recibos"("claveSolicitud");

-- ---------------------------------------------------------------------------
-- HU3 CA11: planes de pago en cuotas
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "planes_pago" (
    "id" TEXT NOT NULL,
    "inmuebleId" TEXT NOT NULL,
    "montoTotal" DECIMAL(10,2) NOT NULL,
    "cantidadCuotas" INTEGER NOT NULL,
    "observacion" TEXT,
    "estado" "EstadoPlanPago" NOT NULL DEFAULT 'ACTIVO',
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "planes_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuotas_plan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "montoPagado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fechaVencimiento" DATE NOT NULL,
    "estado" "EstadoCuota" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cuotas_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_cuota" (
    "id" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "reciboId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_cuota_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "expensas" ADD COLUMN "planPagoId" TEXT;

-- CreateIndex
CREATE INDEX "planes_pago_inmuebleId_idx" ON "planes_pago"("inmuebleId");

-- CreateIndex
CREATE INDEX "planes_pago_estado_idx" ON "planes_pago"("estado");

-- CreateIndex
CREATE INDEX "cuotas_plan_estado_fechaVencimiento_idx" ON "cuotas_plan"("estado", "fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "cuotas_plan_planId_numero_key" ON "cuotas_plan"("planId", "numero");

-- CreateIndex
CREATE INDEX "pagos_cuota_cuotaId_idx" ON "pagos_cuota"("cuotaId");

-- CreateIndex
CREATE INDEX "pagos_cuota_reciboId_idx" ON "pagos_cuota"("reciboId");

-- CreateIndex
CREATE INDEX "expensas_planPagoId_idx" ON "expensas"("planPagoId");

-- AddForeignKey
ALTER TABLE "expensas" ADD CONSTRAINT "expensas_planPagoId_fkey" FOREIGN KEY ("planPagoId") REFERENCES "planes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_pago" ADD CONSTRAINT "planes_pago_inmuebleId_fkey" FOREIGN KEY ("inmuebleId") REFERENCES "inmuebles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_pago" ADD CONSTRAINT "planes_pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuotas_plan" ADD CONSTRAINT "cuotas_plan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "planes_pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuota" ADD CONSTRAINT "pagos_cuota_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "cuotas_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuota" ADD CONSTRAINT "pagos_cuota_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "recibos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planes_pago"
  ADD CONSTRAINT "planes_pago_monto_positivo" CHECK ("montoTotal" > 0);

ALTER TABLE "cuotas_plan"
  ADD CONSTRAINT "cuotas_plan_montos_validos" CHECK ("monto" > 0 AND "montoPagado" >= 0 AND "montoPagado" <= "monto");

-- ---------------------------------------------------------------------------
-- HU3 CA15 y CA16: notificaciones de la campanita y registro de correos
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "copropietarioId" TEXT NOT NULL,
    "expensaId" TEXT,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "monto" DECIMAL(10,2),
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leidaEn" TIMESTAMPTZ(3),
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "clave" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_correo" (
    "id" TEXT NOT NULL,
    "expensaId" TEXT,
    "tipo" "TipoCorreo" NOT NULL,
    "destinatario" TEXT,
    "asunto" TEXT NOT NULL,
    "estado" "EstadoEnvioCorreo" NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envios_correo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_copropietarioId_leida_createdAt_idx" ON "notificaciones"("copropietarioId", "leida", "createdAt");

-- CreateIndex
CREATE INDEX "notificaciones_expensaId_idx" ON "notificaciones"("expensaId");

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_copropietarioId_clave_key" ON "notificaciones"("copropietarioId", "clave");

-- CreateIndex
CREATE INDEX "envios_correo_expensaId_idx" ON "envios_correo"("expensaId");

-- CreateIndex
CREATE INDEX "envios_correo_estado_createdAt_idx" ON "envios_correo"("estado", "createdAt");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_copropietarioId_fkey" FOREIGN KEY ("copropietarioId") REFERENCES "copropietarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "expensas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_correo" ADD CONSTRAINT "envios_correo_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "expensas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
