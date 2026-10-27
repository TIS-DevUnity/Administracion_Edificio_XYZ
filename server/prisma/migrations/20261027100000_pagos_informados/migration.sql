-- CreateEnum
CREATE TYPE "EstadoPagoInformado" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "pagos_informados" (
    "id" TEXT NOT NULL,
    "inmuebleId" TEXT NOT NULL,
    "copropietarioId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodoPago" "MetodoPago" NOT NULL,
    "referencia" TEXT,
    "fechaPago" DATE NOT NULL,
    "comprobantePath" TEXT,
    "comprobanteMime" TEXT,
    "comprobanteNombre" TEXT,
    "estado" "EstadoPagoInformado" NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "reciboId" TEXT,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMPTZ(3),
    "claveSolicitud" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pagos_informados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pagos_informados_comprobantePath_key" ON "pagos_informados"("comprobantePath");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_informados_reciboId_key" ON "pagos_informados"("reciboId");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_informados_claveSolicitud_key" ON "pagos_informados"("claveSolicitud");

-- CreateIndex
CREATE INDEX "pagos_informados_inmuebleId_idx" ON "pagos_informados"("inmuebleId");

-- CreateIndex
CREATE INDEX "pagos_informados_copropietarioId_idx" ON "pagos_informados"("copropietarioId");

-- CreateIndex
CREATE INDEX "pagos_informados_estado_createdAt_idx" ON "pagos_informados"("estado", "createdAt");

-- AddForeignKey
ALTER TABLE "pagos_informados" ADD CONSTRAINT "pagos_informados_inmuebleId_fkey" FOREIGN KEY ("inmuebleId") REFERENCES "inmuebles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_informados" ADD CONSTRAINT "pagos_informados_copropietarioId_fkey" FOREIGN KEY ("copropietarioId") REFERENCES "copropietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_informados" ADD CONSTRAINT "pagos_informados_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "recibos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_informados" ADD CONSTRAINT "pagos_informados_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

