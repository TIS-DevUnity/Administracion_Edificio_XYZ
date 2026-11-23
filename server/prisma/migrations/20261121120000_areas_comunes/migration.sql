-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('RESERVADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "areas_comunes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "condiciones" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "areas_comunes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios_area_comun" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "horarios_area_comun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueos_area_comun" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "horaInicio" TEXT,
    "horaFin" TEXT,
    "motivo" TEXT NOT NULL,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bloqueos_area_comun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas_area_comun" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "copropietarioId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'RESERVADA',
    "vigente" BOOLEAN DEFAULT true,
    "canceladaEn" TIMESTAMPTZ(3),
    "motivoCancelacion" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reservas_area_comun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "areas_comunes_nombre_key" ON "areas_comunes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "horarios_area_comun_areaId_diaSemana_horaInicio_key" ON "horarios_area_comun"("areaId", "diaSemana", "horaInicio");

-- CreateIndex
CREATE INDEX "bloqueos_area_comun_areaId_fecha_idx" ON "bloqueos_area_comun"("areaId", "fecha");

-- CreateIndex
CREATE INDEX "reservas_area_comun_copropietarioId_idx" ON "reservas_area_comun"("copropietarioId");

-- CreateIndex
CREATE INDEX "reservas_area_comun_areaId_fecha_idx" ON "reservas_area_comun"("areaId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_area_unica" ON "reservas_area_comun"("areaId", "fecha", "horaInicio", "vigente");

-- AddForeignKey
ALTER TABLE "horarios_area_comun" ADD CONSTRAINT "horarios_area_comun_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas_comunes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueos_area_comun" ADD CONSTRAINT "bloqueos_area_comun_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas_comunes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueos_area_comun" ADD CONSTRAINT "bloqueos_area_comun_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_area_comun" ADD CONSTRAINT "reservas_area_comun_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas_comunes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_area_comun" ADD CONSTRAINT "reservas_area_comun_copropietarioId_fkey" FOREIGN KEY ("copropietarioId") REFERENCES "copropietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

