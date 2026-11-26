-- CreateEnum
CREATE TYPE "CanalComunicado" AS ENUM ('CORREO', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "EstadoComunicado" AS ENUM ('BORRADOR', 'ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "comunicados" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "canales" "CanalComunicado"[],
    "estado" "EstadoComunicado" NOT NULL DEFAULT 'BORRADOR',
    "causaFallo" TEXT,
    "totalDestinatarios" INTEGER,
    "enviadoEn" TIMESTAMPTZ(3),
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comunicados_estado_createdAt_idx" ON "comunicados"("estado", "createdAt");

-- AddForeignKey
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

