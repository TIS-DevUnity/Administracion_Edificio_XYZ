-- HU7 (control de caja y bancos / conciliacion). Aditiva; ademas crea las cuentas por defecto
-- (Caja principal y Banco principal), que crearRecibo necesita.

-- Aborta si movimientos_caja ya tiene filas: la migracion asume que la tabla esta vacia (hoy sin
-- uso) y agrega columnas NOT NULL sin valor por defecto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "movimientos_caja") THEN
    RAISE EXCEPTION 'movimientos_caja tiene filas: revisar antes de migrar';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('CAJA', 'BANCO');

-- CreateEnum
CREATE TYPE "EstadoConciliacion" AS ENUM ('PENDIENTE', 'CONCILIADO', 'CON_DIFERENCIA');

-- CreateEnum
CREATE TYPE "OrigenMovimientoCaja" AS ENUM ('RECIBO', 'MOVIMIENTO_FINANCIERO', 'TRASPASO');

-- CreateEnum
CREATE TYPE "OperacionConciliacion" AS ENUM ('CONCILIAR', 'REVISAR_DIFERENCIA', 'SALDO_REAL', 'CIERRE');

-- CreateEnum
CREATE TYPE "ResultadoConciliacion" AS ENUM ('EXITOSO', 'CON_DIFERENCIA', 'RECHAZADO');

-- AlterTable: cuentas_bancarias
-- Las cuentas que ya existieran quedan como BANCO y no por defecto.
ALTER TABLE "cuentas_bancarias"
  ADD COLUMN "tipo" "TipoCuenta" NOT NULL DEFAULT 'BANCO',
  ADD COLUMN "esPorDefecto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "activa" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "saldoInicial" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ALTER COLUMN "banco" DROP NOT NULL,
  ALTER COLUMN "numeroCuenta" DROP NOT NULL;

-- Que haya una sola cuenta por defecto por tipo NO se fuerza aqui (sin indice parcial): lo asegura
-- la aplicacion dentro de una transaccion.

-- AlterTable: movimientos_caja
ALTER TABLE "movimientos_caja"
  ADD COLUMN "periodo" TEXT NOT NULL,
  ADD COLUMN "origen" "OrigenMovimientoCaja" NOT NULL,
  ADD COLUMN "reciboId" TEXT,
  ADD COLUMN "movimientoFinancieroId" TEXT,
  ADD COLUMN "traspasoId" TEXT,
  ADD COLUMN "referencia" TEXT,
  ADD COLUMN "estado" "EstadoConciliacion" NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "montoBanco" DECIMAL(12,2),
  ADD COLUMN "fechaBanco" DATE,
  ADD COLUMN "tipoBanco" "TipoMovimiento",
  ADD COLUMN "referenciaBanco" TEXT,
  ADD COLUMN "diferencia" DECIMAL(12,2),
  ADD COLUMN "observacion" TEXT,
  ADD COLUMN "conciliadoPorId" TEXT,
  ADD COLUMN "conciliadoEn" TIMESTAMPTZ(3),
  ADD COLUMN "registradoPorId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "movimientos_caja" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Reglas que Prisma no expresa. Mismo precedente que movimientos_financieros_monto_positivo.
ALTER TABLE "movimientos_caja"
  ADD CONSTRAINT "movimientos_caja_monto_positivo" CHECK ("monto" > 0),
  -- Un asiento tiene exactamente un origen y su clave coincide con el origen declarado.
  ADD CONSTRAINT "movimientos_caja_origen_coherente" CHECK (
    ("origen" = 'RECIBO'
       AND "reciboId" IS NOT NULL AND "movimientoFinancieroId" IS NULL AND "traspasoId" IS NULL)
    OR ("origen" = 'MOVIMIENTO_FINANCIERO'
       AND "movimientoFinancieroId" IS NOT NULL AND "reciboId" IS NULL AND "traspasoId" IS NULL)
    OR ("origen" = 'TRASPASO'
       AND "traspasoId" IS NOT NULL AND "reciboId" IS NULL AND "movimientoFinancieroId" IS NULL)
  ),
  -- Una diferencia no se guarda sin explicacion.
  ADD CONSTRAINT "movimientos_caja_diferencia_observada" CHECK (
    "estado" <> 'CON_DIFERENCIA' OR length(btrim(coalesce("observacion", ''))) > 0
  ),
  -- Un asiento conciliado tiene fecha de conciliacion. (No se exige conciliadoPorId: la FK es
  -- ON DELETE SET NULL y el CHECK bloquearia borrar a un usuario.)
  ADD CONSTRAINT "movimientos_caja_conciliado_con_fecha" CHECK (
    "estado" <> 'CONCILIADO' OR "conciliadoEn" IS NOT NULL
  );

-- CreateTable
CREATE TABLE "saldos_reales_periodo" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "saldoReal" DECIMAL(12,2) NOT NULL,
    "observacion" TEXT,
    "diferenciaRevisada" BOOLEAN NOT NULL DEFAULT false,
    "revisadaPorId" TEXT,
    "revisadaEn" TIMESTAMPTZ(3),
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saldos_reales_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_caja" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "observacion" TEXT,
    "cerradoPorId" TEXT,
    "cerradoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierres_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_caja_cuenta" (
    "id" TEXT NOT NULL,
    "cierreId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "saldoRegistrado" DECIMAL(12,2) NOT NULL,
    "saldoConciliado" DECIMAL(12,2) NOT NULL,
    "saldoReal" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "observacion" TEXT,
    "diferenciaConfirmada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cierres_caja_cuenta_pkey" PRIMARY KEY ("id"),
    -- Un cierre con diferencia exige observacion y confirmacion explicita del Administrador.
    CONSTRAINT "cierres_caja_cuenta_diferencia_confirmada" CHECK (
      "diferencia" = 0
      OR ("diferenciaConfirmada" AND length(btrim(coalesce("observacion", ''))) > 0)
    )
);

-- CreateTable
CREATE TABLE "conciliacion_eventos" (
    "id" TEXT NOT NULL,
    "movimientoCajaId" TEXT,
    "cuentaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "operacion" "OperacionConciliacion" NOT NULL,
    "resultado" "ResultadoConciliacion" NOT NULL,
    "estadoAnterior" "EstadoConciliacion",
    "estadoNuevo" "EstadoConciliacion",
    "usuarioId" TEXT,
    "detalle" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conciliacion_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_caja_reciboId_key" ON "movimientos_caja"("reciboId");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_caja_movimientoFinancieroId_key" ON "movimientos_caja"("movimientoFinancieroId");

-- CreateIndex
CREATE INDEX "movimientos_caja_periodo_estado_idx" ON "movimientos_caja"("periodo", "estado");

-- CreateIndex
CREATE INDEX "movimientos_caja_cuentaId_periodo_idx" ON "movimientos_caja"("cuentaId", "periodo");

-- CreateIndex
CREATE INDEX "movimientos_caja_traspasoId_idx" ON "movimientos_caja"("traspasoId");

-- CreateIndex
CREATE UNIQUE INDEX "saldos_reales_periodo_cuentaId_periodo_key" ON "saldos_reales_periodo"("cuentaId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_caja_periodo_key" ON "cierres_caja"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_caja_cuenta_cierreId_cuentaId_key" ON "cierres_caja_cuenta"("cierreId", "cuentaId");

-- CreateIndex
CREATE INDEX "cierres_caja_cuenta_cuentaId_idx" ON "cierres_caja_cuenta"("cuentaId");

-- CreateIndex
CREATE INDEX "conciliacion_eventos_movimientoCajaId_createdAt_idx" ON "conciliacion_eventos"("movimientoCajaId", "createdAt");

-- CreateIndex
CREATE INDEX "conciliacion_eventos_cuentaId_periodo_createdAt_idx" ON "conciliacion_eventos"("cuentaId", "periodo", "createdAt");

-- CreateIndex
CREATE INDEX "conciliacion_eventos_operacion_createdAt_idx" ON "conciliacion_eventos"("operacion", "createdAt");

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "recibos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_movimientoFinancieroId_fkey" FOREIGN KEY ("movimientoFinancieroId") REFERENCES "movimientos_financieros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_conciliadoPorId_fkey" FOREIGN KEY ("conciliadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_reales_periodo" ADD CONSTRAINT "saldos_reales_periodo_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_reales_periodo" ADD CONSTRAINT "saldos_reales_periodo_revisadaPorId_fkey" FOREIGN KEY ("revisadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_reales_periodo" ADD CONSTRAINT "saldos_reales_periodo_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_caja_cuenta" ADD CONSTRAINT "cierres_caja_cuenta_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "cierres_caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_caja_cuenta" ADD CONSTRAINT "cierres_caja_cuenta_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conciliacion_eventos" ADD CONSTRAINT "conciliacion_eventos_movimientoCajaId_fkey" FOREIGN KEY ("movimientoCajaId") REFERENCES "movimientos_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conciliacion_eventos" ADD CONSTRAINT "conciliacion_eventos_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conciliacion_eventos" ADD CONSTRAINT "conciliacion_eventos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Cuentas por defecto. Idempotente: si ya hay una por defecto de ese tipo, no inserta otra.
-- El banco usa datos de marcador que el Administrador renombra desde la aplicacion.
-- gen_random_uuid() es nativo desde PostgreSQL 13.
-- =============================================================================
INSERT INTO "cuentas_bancarias" ("id", "nombre", "tipo", "banco", "numeroCuenta", "esPorDefecto", "updatedAt")
SELECT gen_random_uuid()::text, 'Caja principal', 'CAJA', NULL, NULL, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "cuentas_bancarias" WHERE "tipo" = 'CAJA' AND "esPorDefecto"
);

INSERT INTO "cuentas_bancarias" ("id", "nombre", "tipo", "banco", "numeroCuenta", "esPorDefecto", "updatedAt")
SELECT gen_random_uuid()::text, 'Banco principal', 'BANCO', 'POR DEFINIR', 'POR-DEFINIR-1', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "cuentas_bancarias" WHERE "tipo" = 'BANCO' AND "esPorDefecto"
);
