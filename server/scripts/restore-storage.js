const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Configuración de conexión hacia la BD de PRUEBA
// Se toman de variables de entorno o de los valores por defecto que asignes para la prueba
const SUPABASE_URL = process.env.TEST_SUPABASE_URL || 'https://akkcssjmlyagvwjixwbn.supabase.co';
const SERVICE_ROLE_KEY = process.env.TEST_SERVICE_ROLE_KEY; 
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'documentos-edificio';

// 2. Ruta absoluta a la carpeta donde descomprimiste los PDFs
// const SOURCE_DIR = 'D:\\Nicole\\Proyectos\\TIS_Respaldos_BD\\Respaldo_BD_Archivo';
const SOURCE_DIR = process.env.RESTORE_SOURCE_DIR || 'D:\\Nicole\\Proyectos\\TIS_Respaldos_BD\\Respaldo_BD_Archivo';

if (!SERVICE_ROLE_KEY) {
  console.error('Error: Debes proporcionar la TEST_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Carpetas del bucket que contienen los documentos
const TARGET_FOLDERS = ['acta', 'comprobantes-movimientos', 'contrato', 'otro', 'reglamento'];

function getFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      getFilesRecursively(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function restoreStorage() {
  console.log(`Iniciando carga de documentos hacia el bucket "${BUCKET_NAME}"...`);

  let totalUploaded = 0;

  for (const folder of TARGET_FOLDERS) {
    const folderPath = path.join(SOURCE_DIR, folder);
    const files = getFilesRecursively(folderPath);

    for (const filePath of files) {
      // Normaliza la ruta a formato web ("acta/archivo.pdf")
      const relativePath = path.relative(SOURCE_DIR, filePath).split(path.sep).join('/');
      const fileBuffer = fs.readFileSync(filePath);

      console.log(`Subiendo: ${relativePath}...`);
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(relativePath, fileBuffer, {
          upsert: true,
          contentType: 'application/pdf',
        });

      if (error) {
        console.error(` Error en ${relativePath}:`, error.message);
      } else {
        totalUploaded++;
        console.log(` OK: ${relativePath}`);
      }
    }
  }

  console.log(`\n Restauración finalizada: ${totalUploaded} archivos subidos correctamente.`);
}

restoreStorage().catch(console.error);
