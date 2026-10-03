-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "reciboId" TEXT;

-- AlterTable
ALTER TABLE "movimientos_saldo" ADD COLUMN     "reciboId" TEXT;

-- CreateTable
CREATE TABLE "recibos" (
    "id" TEXT NOT NULL,
    "folioNumero" SERIAL NOT NULL,
    "inmuebleId" TEXT NOT NULL,
    "montoTotal" DECIMAL(10,2) NOT NULL,
    "metodoPago" "MetodoPago" NOT NULL,
    "referencia" TEXT,
    "fechaPago" TIMESTAMPTZ(3) NOT NULL,
    "comprobantePath" TEXT,
    "comprobanteMime" TEXT,
    "comprobanteNombre" TEXT,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recibos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recibos_folioNumero_key" ON "recibos"("folioNumero");

-- CreateIndex
CREATE UNIQUE INDEX "recibos_comprobantePath_key" ON "recibos"("comprobantePath");

-- CreateIndex
CREATE INDEX "recibos_inmuebleId_fechaPago_idx" ON "recibos"("inmuebleId", "fechaPago");

-- CreateIndex
CREATE INDEX "pagos_reciboId_idx" ON "pagos"("reciboId");

-- CreateIndex
CREATE INDEX "movimientos_saldo_reciboId_idx" ON "movimientos_saldo"("reciboId");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "recibos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_inmuebleId_fkey" FOREIGN KEY ("inmuebleId") REFERENCES "inmuebles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "recibos"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Restriccion de integridad (Prisma no la modela). NOT VALID: se exige para todo dato nuevo.
ALTER TABLE "recibos"
  ADD CONSTRAINT "recibos_monto_positivo" CHECK ("montoTotal" > 0) NOT VALID;
