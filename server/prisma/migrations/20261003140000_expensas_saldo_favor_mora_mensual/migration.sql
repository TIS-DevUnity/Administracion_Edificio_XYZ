-- CreateEnum
CREATE TYPE "ModoMora" AS ENUM ('UNICA', 'MENSUAL');

-- CreateEnum
CREATE TYPE "TipoMovimientoSaldo" AS ENUM ('PAGO_ANTICIPADO', 'EXCESO_PAGO', 'APLICACION_EXPENSA');

-- AlterEnum
ALTER TYPE "MetodoPago" ADD VALUE 'SALDO_A_FAVOR';

-- AlterTable
ALTER TABLE "configuracion_mora" ADD COLUMN     "modoMora" "ModoMora" NOT NULL DEFAULT 'UNICA';

-- CreateTable
CREATE TABLE "movimientos_saldo" (
    "id" TEXT NOT NULL,
    "inmuebleId" TEXT NOT NULL,
    "tipo" "TipoMovimientoSaldo" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "expensaId" TEXT,
    "metodoPago" "MetodoPago",
    "referencia" TEXT,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_saldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_saldo_inmuebleId_createdAt_idx" ON "movimientos_saldo"("inmuebleId", "createdAt");

-- CreateIndex
CREATE INDEX "movimientos_saldo_expensaId_idx" ON "movimientos_saldo"("expensaId");

-- AddForeignKey
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_inmuebleId_fkey" FOREIGN KEY ("inmuebleId") REFERENCES "inmuebles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "expensas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricciones de integridad (Prisma no las modela). NOT VALID: se exigen para todo dato
-- nuevo sin revisar las filas existentes; para validar las antiguas despues de limpiarlas:
--   ALTER TABLE <tabla> VALIDATE CONSTRAINT <nombre>;
ALTER TABLE "pagos"
  ADD CONSTRAINT "pagos_monto_positivo" CHECK ("monto" > 0) NOT VALID;

ALTER TABLE "expensas"
  ADD CONSTRAINT "expensas_montos_no_negativos" CHECK ("montoTotal" >= 0 AND "montoMora" >= 0) NOT VALID;

ALTER TABLE "movimientos_saldo"
  ADD CONSTRAINT "movimientos_saldo_monto_no_cero" CHECK ("monto" <> 0) NOT VALID,
  ADD CONSTRAINT "movimientos_saldo_signo_segun_tipo" CHECK (
    ("tipo" = 'APLICACION_EXPENSA' AND "monto" < 0)
    OR ("tipo" IN ('PAGO_ANTICIPADO', 'EXCESO_PAGO') AND "monto" > 0)
  ) NOT VALID;

ALTER TABLE "configuracion_mora"
  ADD CONSTRAINT "configuracion_mora_dia_generacion_valido" CHECK ("diaGeneracion" BETWEEN 1 AND 28) NOT VALID,
  ADD CONSTRAINT "configuracion_mora_dias_gracia_no_negativo" CHECK ("diasGracia" >= 0) NOT VALID,
  ADD CONSTRAINT "configuracion_mora_valor_valido" CHECK (
    "valor" >= 0 AND ("tipoValor" <> 'PORCENTAJE' OR "valor" <= 100)
  ) NOT VALID;
