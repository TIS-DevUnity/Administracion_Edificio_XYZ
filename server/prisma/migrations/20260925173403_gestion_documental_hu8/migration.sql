-- CreateEnum
CREATE TYPE "CategoriaDocumento" AS ENUM ('ACTA', 'REGLAMENTO', 'CONTRATO', 'FACTURA', 'FOTOGRAFIA', 'COTIZACION', 'OTRO');

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaDocumento" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanioBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "entidad" TEXT,
    "entidadId" TEXT,
    "subidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_storagePath_key" ON "documentos"("storagePath");

-- CreateIndex
CREATE INDEX "documentos_categoria_idx" ON "documentos"("categoria");

-- CreateIndex
CREATE INDEX "documentos_entidad_entidadId_idx" ON "documentos"("entidad", "entidadId");

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
