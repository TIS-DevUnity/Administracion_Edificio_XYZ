-- Dia del mes en que se descuenta el saldo a favor de las expensas pendientes (antes se descontaba al generar
-- la expensa). Aditiva: las configuraciones existentes quedan con el dia 9.
-- Debe ir entre diaGeneracion y diaVencimiento; eso lo valida la aplicacion (un CHECK entre columnas podria
-- fallar con configuraciones existentes, por ejemplo con diaGeneracion = 10).

-- AlterTable
ALTER TABLE "configuracion_mora" ADD COLUMN "diaDescuentoSaldo" INTEGER NOT NULL DEFAULT 9;
