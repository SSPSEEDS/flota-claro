// CLI: npm run import-excel <archivo.xlsx>   (migracion unica del historico)
import { importarExcel } from '../services/importer.js';
import { getPool } from '../db/pool.js';
import { migrar } from '../db/db.js';
import { error } from '../lib/log.js';

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: npm run import-excel <archivo.xlsx>');
  process.exit(1);
}

try {
  await migrar();
  const r = await importarExcel(ruta, { usuario: 'cli' });
  console.log('--- Migracion Excel OK ---');
  console.log('Registros:', r.total, '| Periodos:', r.periodos.length, '| Lineas:', r.lineas);
} catch (e) {
  error(e.message);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
