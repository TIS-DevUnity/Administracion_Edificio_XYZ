-- HU8 (nomina y pagos de personal). Solo aditiva: no borra, renombra ni cambia tipos de nada existente.
-- Las tablas personal y pagos_personal no se tocan. Las tablas nuevas nacen vacias, asi que sus CHECK
-- no pueden fallar con los datos actuales.
-- Requiere PostgreSQL 12 o superior (ADD VALUE dentro de una transaccion).

-- CreateEnum
CREATE TYPE "EstadoEmpleado" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EstadoNomina" AS ENUM ('PENDIENTE', 'PAGADA');

-- CreateEnum
CREATE TYPE "TipoConceptoNomina" AS ENUM ('BONO', 'HORA_EXTRA', 'DESCUENTO');

-- CreateEnum
CREATE TYPE "EstadoAnticipo" AS ENUM ('PENDIENTE', 'PARCIAL', 'DESCONTADO');

-- AlterEnum: nuevos origenes de asiento del libro de caja
ALTER TYPE "OrigenMovimientoCaja" ADD VALUE 'PAGO_NOMINA';
ALTER TYPE "OrigenMovimientoCaja" ADD VALUE 'ANTICIPO_SALARIAL';

-- AlterTable: movimientos_caja (columnas nuevas, nulables)
ALTER TABLE "movimientos_caja" ADD COLUMN     "anticipoSalarialId" TEXT,
ADD COLUMN     "nominaId" TEXT;

-- CreateTable
CREATE TABLE "empleados" (
    "id" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "fechaIngreso" DATE NOT NULL,
    "telefono" TEXT NOT NULL,
    "sueldoBase" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoEmpleado" NOT NULL DEFAULT 'ACTIVO',
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "empleados_sueldo_base_positivo" CHECK ("sueldoBase" > 0)
);

-- CreateTable
CREATE TABLE "nominas" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "sueldoBase" DECIMAL(10,2) NOT NULL,
    "totalBonos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalHorasExtra" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalDescuentos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAnticipos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sueldoNeto" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoNomina" NOT NULL DEFAULT 'PENDIENTE',
    "fechaPago" TIMESTAMPTZ(3),
    "montoPagado" DECIMAL(10,2),
    "metodoPago" "MetodoPago",
    "registradoPorId" TEXT,
    "pagadoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "nominas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nominas_periodo_formato" CHECK ("periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "nominas_montos_no_negativos" CHECK (
      "sueldoBase" >= 0 AND "totalBonos" >= 0 AND "totalHorasExtra" >= 0
      AND "totalDescuentos" >= 0 AND "totalAnticipos" >= 0
    ),
    -- El sueldo neto nunca es negativo.
    CONSTRAINT "nominas_sueldo_neto_no_negativo" CHECK ("sueldoNeto" >= 0),
    -- Una nomina pagada tiene fecha, monto y metodo de pago.
    CONSTRAINT "nominas_pagada_completa" CHECK (
      "estado" <> 'PAGADA'
      OR ("fechaPago" IS NOT NULL AND "montoPagado" IS NOT NULL AND "metodoPago" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "conceptos_nomina" (
    "id" TEXT NOT NULL,
    "nominaId" TEXT NOT NULL,
    "tipo" "TipoConceptoNomina" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "horas" DECIMAL(6,2),
    "monto" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conceptos_nomina_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conceptos_nomina_monto_positivo" CHECK ("monto" > 0),
    CONSTRAINT "conceptos_nomina_horas_positivas" CHECK ("horas" IS NULL OR "horas" > 0)
);

-- CreateTable
CREATE TABLE "anticipos_salariales" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "montoDescontado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fecha" DATE NOT NULL,
    "metodoPago" "MetodoPago" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" "EstadoAnticipo" NOT NULL DEFAULT 'PENDIENTE',
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anticipos_salariales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "anticipos_salariales_monto_positivo" CHECK ("monto" > 0),
    CONSTRAINT "anticipos_salariales_descontado_valido" CHECK ("montoDescontado" >= 0 AND "montoDescontado" <= "monto")
);

-- CreateTable
CREATE TABLE "aplicaciones_anticipo" (
    "id" TEXT NOT NULL,
    "anticipoId" TEXT NOT NULL,
    "nominaId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aplicaciones_anticipo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aplicaciones_anticipo_monto_positivo" CHECK ("monto" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "empleados_documento_key" ON "empleados"("documento");

-- CreateIndex
CREATE INDEX "empleados_estado_idx" ON "empleados"("estado");

-- CreateIndex
CREATE INDEX "nominas_periodo_estado_idx" ON "nominas"("periodo", "estado");

-- CreateIndex: un solo pago de nomina por empleado y periodo
CREATE UNIQUE INDEX "nominas_empleadoId_periodo_key" ON "nominas"("empleadoId", "periodo");

-- CreateIndex
CREATE INDEX "conceptos_nomina_nominaId_idx" ON "conceptos_nomina"("nominaId");

-- CreateIndex
CREATE INDEX "anticipos_salariales_empleadoId_estado_idx" ON "anticipos_salariales"("empleadoId", "estado");

-- CreateIndex
CREATE INDEX "aplicaciones_anticipo_nominaId_idx" ON "aplicaciones_anticipo"("nominaId");

-- CreateIndex
CREATE UNIQUE INDEX "aplicaciones_anticipo_anticipoId_nominaId_key" ON "aplicaciones_anticipo"("anticipoId", "nominaId");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_caja_nominaId_key" ON "movimientos_caja"("nominaId");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_caja_anticipoSalarialId_key" ON "movimientos_caja"("anticipoSalarialId");

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_nominaId_fkey" FOREIGN KEY ("nominaId") REFERENCES "nominas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_anticipoSalarialId_fkey" FOREIGN KEY ("anticipoSalarialId") REFERENCES "anticipos_salariales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominas" ADD CONSTRAINT "nominas_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominas" ADD CONSTRAINT "nominas_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominas" ADD CONSTRAINT "nominas_pagadoPorId_fkey" FOREIGN KEY ("pagadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conceptos_nomina" ADD CONSTRAINT "conceptos_nomina_nominaId_fkey" FOREIGN KEY ("nominaId") REFERENCES "nominas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_salariales" ADD CONSTRAINT "anticipos_salariales_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_salariales" ADD CONSTRAINT "anticipos_salariales_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_anticipo" ADD CONSTRAINT "aplicaciones_anticipo_anticipoId_fkey" FOREIGN KEY ("anticipoId") REFERENCES "anticipos_salariales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_anticipo" ADD CONSTRAINT "aplicaciones_anticipo_nominaId_fkey" FOREIGN KEY ("nominaId") REFERENCES "nominas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reemplaza el CHECK de HU7 (mismo nombre) para admitir los dos origenes nuevos. Es un superconjunto del
-- anterior: toda fila actual (RECIBO, MOVIMIENTO_FINANCIERO, TRASPASO) lo cumple. Compara "origen"::text
-- para no usar un valor de enum recien agregado en la misma transaccion.
ALTER TABLE "movimientos_caja" DROP CONSTRAINT "movimientos_caja_origen_coherente";

ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_origen_coherente" CHECK (
    ("origen"::text = 'RECIBO'
       AND "reciboId" IS NOT NULL AND "movimientoFinancieroId" IS NULL AND "traspasoId" IS NULL
       AND "nominaId" IS NULL AND "anticipoSalarialId" IS NULL)
    OR ("origen"::text = 'MOVIMIENTO_FINANCIERO'
       AND "movimientoFinancieroId" IS NOT NULL AND "reciboId" IS NULL AND "traspasoId" IS NULL
       AND "nominaId" IS NULL AND "anticipoSalarialId" IS NULL)
    OR ("origen"::text = 'TRASPASO'
       AND "traspasoId" IS NOT NULL AND "reciboId" IS NULL AND "movimientoFinancieroId" IS NULL
       AND "nominaId" IS NULL AND "anticipoSalarialId" IS NULL)
    OR ("origen"::text = 'PAGO_NOMINA'
       AND "nominaId" IS NOT NULL AND "reciboId" IS NULL AND "movimientoFinancieroId" IS NULL
       AND "traspasoId" IS NULL AND "anticipoSalarialId" IS NULL)
    OR ("origen"::text = 'ANTICIPO_SALARIAL'
       AND "anticipoSalarialId" IS NOT NULL AND "reciboId" IS NULL AND "movimientoFinancieroId" IS NULL
       AND "traspasoId" IS NULL AND "nominaId" IS NULL)
);
