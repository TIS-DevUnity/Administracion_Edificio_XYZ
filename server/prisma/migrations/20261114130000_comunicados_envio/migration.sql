-- CreateEnum
CREATE TYPE "EstadoEnvioDestinatario" AS ENUM ('ENVIADO', 'FALLIDO', 'OMITIDO');

-- AlterTable
ALTER TABLE "comunicados" ADD COLUMN     "totalEnviados" INTEGER,
ADD COLUMN     "totalFallidos" INTEGER,
ADD COLUMN     "totalOmitidos" INTEGER;

-- CreateTable
CREATE TABLE "comunicado_destinatarios" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "copropietarioId" TEXT,
    "nombre" TEXT NOT NULL,
    "canal" "CanalComunicado" NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "destinoReal" TEXT,
    "estado" "EstadoEnvioDestinatario" NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunicado_destinatarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comunicado_destinatarios_comunicadoId_idx" ON "comunicado_destinatarios"("comunicadoId");

-- CreateIndex
CREATE INDEX "comunicado_destinatarios_estado_idx" ON "comunicado_destinatarios"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "comunicado_dest_unico" ON "comunicado_destinatarios"("comunicadoId", "copropietarioId", "canal");

-- AddForeignKey
ALTER TABLE "comunicado_destinatarios" ADD CONSTRAINT "comunicado_destinatarios_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "comunicados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicado_destinatarios" ADD CONSTRAINT "comunicado_destinatarios_copropietarioId_fkey" FOREIGN KEY ("copropietarioId") REFERENCES "copropietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

