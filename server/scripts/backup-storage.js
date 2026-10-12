const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      enabled: false,
    },
  }
);

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documentos-edificio';
const OUTPUT_DIR = path.join(__dirname, '../temp_storage_backup');

// Función recursiva con paginación para obtener todos los archivos
async function listAllFilesRecursively(folderPath = '') {
  let allFiles = [];
  let offset = 0;
  const limit = 100;
  let keepFetching = true;

  while (keepFetching) {
    const { data: items, error } = await supabase.storage.from(BUCKET).list(folderPath, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw error;

    if (!items || items.length === 0) {
      break;
    }

    for (const item of items) {
      if (item.name === '.emptyFolderPlaceholder') continue;

      const itemFullPath = folderPath ? `${folderPath}/${item.name}` : item.name;

      // Si id es null o no tiene metadata, es una subcarpeta: explorarla
      if (!item.id && !item.metadata) {
        const subfolderFiles = await listAllFilesRecursively(itemFullPath);
        allFiles = allFiles.concat(subfolderFiles);
      } else {
        allFiles.push(itemFullPath);
      }
    }

    if (items.length < limit) {
      keepFetching = false;
    } else {
      offset += limit;
    }
  }

  return allFiles;
}

async function runBackup() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Buscando archivos en bucket: "${BUCKET}"...`);
  const filePaths = await listAllFilesRecursively();
  console.log(`Total de archivos encontrados: ${filePaths.length}`);

  // Descarga en lotes concurrentes de 5 archivos a la vez
  const CONCURRENCY = 5;
  for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
    const batch = filePaths.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (filePath) => {
        try {
          const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
          if (error) throw error;

          const localPath = path.join(OUTPUT_DIR, filePath);
          fs.mkdirSync(path.dirname(localPath), { recursive: true });

          const buffer = Buffer.from(await data.arrayBuffer());
          fs.writeFileSync(localPath, buffer);
          console.log(`Descargado: ${filePath}`);
        } catch (err) {
          console.error(`Error en archivo ${filePath}:`, err.message);
        }
      })
    );
  }

  console.log('Descarga de Storage completada.');
}

runBackup().catch((err) => {
  console.error('Fallo general en respaldo de Storage:', err);
  process.exit(1);
});
