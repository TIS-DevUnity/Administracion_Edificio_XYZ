require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

// Con `--ejemplo` (npm run seed:ejemplo) tambien se cargan tipos, inmuebles y ocupantes de
// muestra para probar expensas, agua y mora. Sin esa bandera solo se crea el administrador.
const CARGAR_EJEMPLO = process.argv.includes("--ejemplo");

async function crearAdministrador() {
  const email = "admin@edificioxyz.com";
  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nombre: "Administrador",
      apellido: "Sistema",
      email,
      passwordHash,
      rol: "ADMINISTRADOR",
    },
  });

  console.log("Usuario administrador listo:", admin.email, "(password: Admin123!)");
}

async function cargarEjemplo() {
  // Tipos de departamento: expensa fija mensual (el agua se carga a mano en cada expensa).
  const tipos = {};
  for (const [nombre, montoBase] of [
    ["A", 300],
    ["B", 350],
    ["C", 400],
  ]) {
    tipos[nombre] = await prisma.tipoInmueble.upsert({
      where: { nombre },
      update: {},
      create: { nombre, montoBase },
    });
  }

  // Configuracion de mora de ejemplo, solo si todavia no hay ninguna.
  const hayConfiguracion = await prisma.configuracionMora.count();
  if (hayConfiguracion === 0) {
    await prisma.configuracionMora.create({
      data: {
        diaGeneracion: 1,
        diaVencimiento: 10,
        diasGracia: 0,
        tipoValor: "PORCENTAJE",
        valor: 10,
        modoMora: "MENSUAL",
      },
    });
  }

  // Copropietarios de ejemplo (sin correo, para que no se envien avisos reales).
  const personas = {};
  for (const [clave, nombre, apellido, ci] of [
    ["uno", "Ana", "Rojas", "EJ-0001"],
    ["dos", "Luis", "Mamani", "EJ-0002"],
    ["tres", "Rosa", "Quispe", "EJ-0003"],
    ["cuatro", "Carlos", "Vargas", "EJ-0004"],
    ["cinco", "Marta", "Flores", "EJ-0005"],
  ]) {
    personas[clave] = await prisma.copropietario.upsert({
      where: { ci },
      update: {},
      create: { nombre, apellido, ci },
    });
  }

  // Tarifa mensual general de baulera y parqueo (se suma a la expensa del departamento de
  // quien los ocupa). Solo si todavia no esta definida.
  for (const [clase, monto] of [
    ["PARQUEO", 50],
    ["BAULERA", 30],
  ]) {
    await prisma.tarifaClase.upsert({
      where: { clase },
      update: {},
      create: { clase, monto },
    });
  }

  // Inmuebles: departamentos con tipo, y bauleras y parqueos (sin tipo: pagan la tarifa de su
  // clase, o su monto propio si lo tienen).
  const inmuebles = {};
  const definiciones = [
    { codigo: "A-101", clase: "DEPARTAMENTO", tipo: "A", piso: "1" },
    { codigo: "A-102", clase: "DEPARTAMENTO", tipo: "A", piso: "1" },
    { codigo: "B-201", clase: "DEPARTAMENTO", tipo: "B", piso: "2" },
    { codigo: "B-202", clase: "DEPARTAMENTO", tipo: "B", piso: "2" },
    { codigo: "C-301", clase: "DEPARTAMENTO", tipo: "C", piso: "3" },
    { codigo: "C-302", clase: "DEPARTAMENTO", tipo: "C", piso: "3" },
    { codigo: "BAU-01", clase: "BAULERA" },
    { codigo: "PAR-01", clase: "PARQUEO" },
    { codigo: "PAR-02", clase: "PARQUEO", cuotaMensual: 80 }, // monto propio
  ];
  for (const def of definiciones) {
    inmuebles[def.codigo] = await prisma.inmueble.upsert({
      where: { codigo: def.codigo },
      update: {},
      create: {
        codigo: def.codigo,
        clase: def.clase,
        tipoInmuebleId: def.tipo ? tipos[def.tipo].id : null,
        piso: def.piso,
        cuotaMensual: def.cuotaMensual ?? null,
      },
    });
  }

  // Quien esta asignado: B-202 y C-302 quedan sin nadie (no pagan expensa). "uno" tiene
  // departamento, baulera y dos parqueos: su expensa suma los cuatro conceptos.
  const asignaciones = [
    ["A-101", "uno", true],
    ["BAU-01", "uno", true],
    ["PAR-01", "uno", true],
    ["PAR-02", "uno", true],
    ["A-102", "dos", true],
    ["B-201", "tres", true],
    ["B-201", "cuatro", false], // inquilino del mismo departamento
    ["C-301", "cinco", true],
  ];
  for (const [codigo, clave, esPropietario] of asignaciones) {
    const yaAsignado = await prisma.ocupanteInmueble.findFirst({
      where: {
        inmuebleId: inmuebles[codigo].id,
        copropietarioId: personas[clave].id,
        fechaFin: null,
      },
    });
    if (!yaAsignado) {
      await prisma.ocupanteInmueble.create({
        data: {
          inmuebleId: inmuebles[codigo].id,
          copropietarioId: personas[clave].id,
          esPropietario,
          fechaInicio: new Date("2026-01-01T00:00:00Z"),
        },
      });
    }
  }

  console.log(
    "Datos de ejemplo listos: tipos A/B/C, 6 departamentos (4 asignados), 1 baulera y 2 parqueos " +
      "(tarifas: parqueo Bs 50, baulera Bs 30; PAR-02 con monto propio Bs 80, asignados a A-101)"
  );
}

async function main() {
  await crearAdministrador();
  if (CARGAR_EJEMPLO) {
    await cargarEjemplo();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
