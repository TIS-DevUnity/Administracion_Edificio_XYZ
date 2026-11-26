/**
 * Seed exclusivo de Supabase DEMO - Administracion Edificio XYZ.
 *
 * No utiliza ni ejecuta el seed original. No crea expensas, pagos, agua ni mora acumulada:
 * esos flujos se ejecutan desde los modulos reales para la defensa.
 *
 * SEGURIDAD: requiere DEMO_SEED_ALLOWED=true, DEMO_PROJECT_REF y DEMO_ADMIN_PASSWORD.
 * Valida que DATABASE_URL, DIRECT_URL y SUPABASE_URL apunten al mismo proyecto.
 * Ejecucion (desde server): node prisma/seed-demo.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@edificioxyz.com';
const INICIO_DEMO = new Date('2026-01-01T04:00:00.000Z'); // 01-01-2026, 00:00 Bolivia
const INICIO_CONFIG_MORA = new Date('2026-10-01T04:00:00.000Z'); // antes de noviembre DEMO

function rechazar(mensaje) {
  throw new Error(`SEED DEMO CANCELADO: ${mensaje}`);
}

function comprobarUrlPostgres(nombre, valor, proyecto) {
  if (!valor) rechazar(`${nombre} esta vacia`);
  let url;
  try { url = new URL(valor); } catch { rechazar(`${nombre} no es una URL valida`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    rechazar(`${nombre} no es una conexion PostgreSQL`);
  }
  const host = url.hostname.toLowerCase();
  const usuario = decodeURIComponent(url.username);
  // Session/Transaction pooler: usuario postgres.<referencia>
  const esPooler = host.endsWith('.pooler.supabase.com') && usuario === `postgres.${proyecto}`;
  // Conexion directa: hostname db.<referencia>.supabase.co, usuario postgres
  const esDirecta = host === `db.${proyecto}.supabase.co` && usuario === 'postgres';
  if (!esPooler && !esDirecta) {
    rechazar(`${nombre} no corresponde al proyecto DEMO declarado o usa un host no reconocido`);
  }
}

function comprobarProtecciones() {
  if (process.env.DEMO_SEED_ALLOWED !== 'true') {
    rechazar('agrega DEMO_SEED_ALLOWED=true solo en server/.env de la copia DEMO');
  }
  if (process.env.NODE_ENV === 'production') {
    rechazar('NODE_ENV=production no esta permitido para este script');
  }
  const proyecto = (process.env.DEMO_PROJECT_REF || '').trim();
  if (!/^[a-z0-9]{12,64}$/.test(proyecto)) {
    rechazar('DEMO_PROJECT_REF debe ser la referencia del nuevo proyecto Supabase DEMO');
  }
  let supabase;
  try { supabase = new URL(process.env.SUPABASE_URL || ''); } catch {
    rechazar('SUPABASE_URL debe apuntar al nuevo proyecto DEMO');
  }
  if (supabase.protocol !== 'https:' || supabase.hostname !== `${proyecto}.supabase.co`) {
    rechazar('SUPABASE_URL no coincide con DEMO_PROJECT_REF');
  }
  comprobarUrlPostgres('DATABASE_URL', process.env.DATABASE_URL, proyecto);
  comprobarUrlPostgres('DIRECT_URL', process.env.DIRECT_URL, proyecto);

  const contrasena = process.env.DEMO_ADMIN_PASSWORD || '';
  if (contrasena.length < 10) {
    rechazar('define DEMO_ADMIN_PASSWORD con al menos 10 caracteres (solo en server/.env de DEMO)');
  }
  return contrasena;
}

const TIPOS = [
  { nombre: 'A', montoBase: '300.00' },
  { nombre: 'B', montoBase: '350.00' },
  { nombre: 'C', montoBase: '400.00' },
];

const DEPARTAMENTOS = [
  { codigo: 'A101', tipo: 'A', areaM2: '58.00', descripcion: 'Un dormitorio, un bano, sala-comedor, cocina y area de lavanderia.', nombre: 'Ana', apellido: 'Rojas' },
  { codigo: 'A102', tipo: 'A', areaM2: '62.00', descripcion: 'Dos dormitorios, un bano, sala-comedor, cocina y lavanderia.', nombre: 'Luis', apellido: 'Mamani' },
  { codigo: 'A103', tipo: 'A', areaM2: '65.00', descripcion: 'Dos dormitorios, un bano, sala, cocina integrada y balcon pequeno.', nombre: 'Rosa', apellido: 'Quispe' },
  { codigo: 'B101', tipo: 'B', areaM2: '76.00', descripcion: 'Dos dormitorios, dos banos, sala-comedor, cocina y lavanderia.', nombre: 'Carlos', apellido: 'Vargas' },
  { codigo: 'B102', tipo: 'B', areaM2: '80.00', descripcion: 'Dos dormitorios, dos banos, sala-comedor, cocina y balcon.', nombre: 'Marta', apellido: 'Flores' },
  { codigo: 'B103', tipo: 'B', areaM2: '85.00', descripcion: 'Tres dormitorios, dos banos, sala-comedor, cocina y lavanderia.', nombre: 'Daniel', apellido: 'Condori' },
  { codigo: 'C101', tipo: 'C', areaM2: '100.00', descripcion: 'Tres dormitorios, dos banos, sala amplia, comedor, cocina y balcon.', nombre: 'Elena', apellido: 'Salazar' },
  { codigo: 'C102', tipo: 'C', areaM2: '110.00', descripcion: 'Tres dormitorios, dos banos, sala-comedor, cocina, estudio y lavanderia.', nombre: 'Miguel', apellido: 'Arce' },
  { codigo: 'C103', tipo: 'C', areaM2: '120.00', descripcion: 'Tres dormitorios, tres banos, sala amplia, comedor, cocina, estudio y balcon.', nombre: 'Patricia', apellido: 'Mendoza' },
];

async function crearAdministrador(contrasena) {
  const passwordHash = await bcrypt.hash(contrasena, 10);
  await prisma.usuario.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      nombre: 'Administrador', apellido: 'DEMO', email: ADMIN_EMAIL,
      passwordHash, rol: 'ADMINISTRADOR', activo: true,
    },
    update: { nombre: 'Administrador', apellido: 'DEMO', passwordHash, rol: 'ADMINISTRADOR', activo: true },
  });
  console.log(`✓ Administrador listo: ${ADMIN_EMAIL} (contrasena: DEMO_ADMIN_PASSWORD de tu .env)`);
}

async function crearTipos() {
  const resultado = new Map();
  for (const tipo of TIPOS) {
    const registro = await prisma.tipoInmueble.upsert({
      where: { nombre: tipo.nombre },
      create: tipo,
      update: { montoBase: tipo.montoBase },
    });
    resultado.set(tipo.nombre, registro.id);
  }
  console.log('✓ Tipos A/B/C: Bs 300 / 350 / 400');
  return resultado;
}

async function crearConfiguracionMora() {
  const cantidad = await prisma.configuracionMora.count();
  if (cantidad > 0) {
    console.log('↪ Mora: ya existe una configuracion; no se modifica el historial vigente');
    return;
  }
  await prisma.configuracionMora.create({
    data: {
      diaGeneracion: 1,
      diaVencimiento: 10,
      diaDescuentoSaldo: 9,
      diasGracia: 0,
      tipoValor: 'PORCENTAJE',
      valor: '10.00',
      modoMora: 'MENSUAL',
      vigenteDesde: INICIO_CONFIG_MORA,
    },
  });
  console.log('✓ Mora: generacion dia 1, vence dia 10, gracia 0, 10% mensual, saldo dia 9');
}

async function crearAccesorios(clase, prefijo) {
  const definiciones = Array.from({ length: 20 }, (_, i) => ({
    codigo: `${prefijo}-${String(i + 1).padStart(2, '0')}`,
    clase,
    activo: true,
    cuotaMensual: '0.00',
  }));
  await prisma.inmueble.createMany({ data: definiciones, skipDuplicates: true });

  const existentes = await prisma.inmueble.findMany({
    where: { codigo: { in: definiciones.map((it) => it.codigo) } },
    select: { id: true, codigo: true, clase: true, cuotaMensual: true, activo: true },
  });
  if (existentes.length !== definiciones.length) rechazar(`faltan registros ${clase}`);
  for (const item of existentes) {
    if (item.clase !== clase) rechazar(`el codigo ${item.codigo} ya pertenece a otra clase`);
  }
  await prisma.inmueble.updateMany({
    where: { codigo: { in: definiciones.map((it) => it.codigo) }, clase },
    data: { cuotaMensual: '0.00', activo: true },
  });
  console.log(`✓ ${definiciones.length} ${clase.toLowerCase()}s sin cuota adicional`);
  return new Map(existentes.map((it) => [it.codigo, it.id]));
}

async function asegurarTarifasGratis() {
  for (const clase of ['PARQUEO', 'BAULERA']) {
    await prisma.tarifaClase.upsert({
      where: { clase },
      create: { clase, monto: '0.00' },
      update: { monto: '0.00' },
    });
  }
  console.log('✓ Tarifas generales PARQUEO/BAULERA en Bs 0');
}

async function crearDepartamentos(tipos, parqueos, bauleras) {
  for (let i = 0; i < DEPARTAMENTOS.length; i++) {
    const d = DEPARTAMENTOS[i];
    const n = String(i + 1).padStart(2, '0');
    const parqueoId = parqueos.get(`PAR-${n}`);
    const bauleraId = bauleras.get(`BAU-${n}`);
    if (!parqueoId || !bauleraId) rechazar(`faltan accesorios para ${d.codigo}`);

    const datos = {
      clase: 'DEPARTAMENTO',
      piso: '1',
      areaM2: d.areaM2,
      descripcion: d.descripcion,
      tipoInmuebleId: tipos.get(d.tipo),
      parqueoId,
      bauleraId,
      cuotaMensual: null, // unicamente el tipo determina la cuota
      activo: true,
    };
    const existente = await prisma.inmueble.findUnique({
      where: { codigo: d.codigo }, select: { id: true, clase: true },
    });
    if (existente && existente.clase !== 'DEPARTAMENTO') {
      rechazar(`el codigo ${d.codigo} pertenece a otra clase de inmueble`);
    }
    const inmueble = await prisma.inmueble.upsert({
      where: { codigo: d.codigo },
      create: { codigo: d.codigo, ...datos },
      update: datos,
    });

    const ci = `DEMO-CI-${n}`;
    const propietario = await prisma.copropietario.upsert({
      where: { ci },
      create: { nombre: d.nombre, apellido: d.apellido, ci },
      update: { nombre: d.nombre, apellido: d.apellido },
    });

    const ocupacionesActuales = await prisma.ocupanteInmueble.findMany({
      where: { inmuebleId: inmueble.id, fechaFin: null },
      select: { copropietarioId: true, esPropietario: true },
    });
    if (ocupacionesActuales.some((o) => o.copropietarioId !== propietario.id || !o.esPropietario)) {
      rechazar(`${d.codigo} ya tiene otro ocupante/propietario activo; no se sobreescribe`);
    }
    if (ocupacionesActuales.length === 0) {
      await prisma.ocupanteInmueble.create({
        data: {
          inmuebleId: inmueble.id,
          copropietarioId: propietario.id,
          esPropietario: true,
          fechaInicio: INICIO_DEMO,
        },
      });
    }
    console.log(`  ${d.codigo} (${d.tipo}): PAR-${n} + BAU-${n}, propietario DEMO-CI-${n}`);
  }
  console.log(`✓ ${DEPARTAMENTOS.length} departamentos con propietario y accesorios asociados`);
}

async function verificarResultado() {
  const codigos = DEPARTAMENTOS.map((d) => d.codigo);
  const departamentos = await prisma.inmueble.findMany({
    where: { codigo: { in: codigos } },
    select: {
      codigo: true, clase: true, parqueoId: true, bauleraId: true,
      tipoInmueble: { select: { montoBase: true } },
      ocupaciones: { where: { fechaFin: null, esPropietario: true }, select: { id: true } },
    },
  });
  if (departamentos.length !== 9 || departamentos.some((d) =>
    d.clase !== 'DEPARTAMENTO' || !d.parqueoId || !d.bauleraId ||
    d.ocupaciones.length !== 1 || !d.tipoInmueble
  )) {
    rechazar('la verificacion final de los nueve departamentos no paso');
  }
  const tarifas = await prisma.tarifaClase.findMany({ where: { clase: { in: ['PARQUEO', 'BAULERA'] } } });
  if (tarifas.length !== 2 || tarifas.some((t) => Number(t.monto) !== 0)) {
    rechazar('las tarifas de parqueo/baulera no quedaron en cero');
  }
  console.log('\n✓ VERIFICACION FINAL CORRECTA');
  console.log('  9 departamentos (3 A, 3 B, 3 C), 9 propietarios, 9 parqueos y 9 bauleras asignados.');
  console.log('  11 parqueos + 11 bauleras libres. Agua: carga manual al generar expensas.');
  console.log('  No se generaron expensas, pagos, agua ni movimientos extraordinarios.');
}

async function main() {
  const contrasena = comprobarProtecciones();
  console.log('Iniciando seed-demo: proyecto DEMO validado (sin mostrar credenciales).\n');
  const tipos = await crearTipos();
  await crearConfiguracionMora();
  await asegurarTarifasGratis();
  const parqueos = await crearAccesorios('PARQUEO', 'PAR');
  const bauleras = await crearAccesorios('BAULERA', 'BAU');
  await crearDepartamentos(tipos, parqueos, bauleras);
  await crearAdministrador(contrasena);
  await verificarResultado();
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
