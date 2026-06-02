// CLI: npm run export <YYYY-MM|todo> [--iva] [--xlsx]
import fs from 'node:fs';
import path from 'node:path';
import { exportarCSV, exportarXLSX } from '../services/export.js';
import { EXPORTS_DIR, asegurarExports } from '../lib/paths.js';
import { getPool } from '../db/pool.js';
import { error } from '../lib/log.js';

const periodo = process.argv[2];
const conIva = process.argv.includes('--iva');
const xlsxFmt = process.argv.includes('--xlsx');

if (!periodo) {
  console.error('Uso: npm run export <YYYY-MM|todo> [--iva] [--xlsx]');
  process.exit(1);
}

try {
  asegurarExports();
  const filtros = periodo === 'todo' ? {} : { periodo };
  const buf = xlsxFmt ? await exportarXLSX(filtros, { conIva }) : await exportarCSV(filtros, { conIva });
  const ext = xlsxFmt ? 'xlsx' : 'csv';
  const destino = path.join(EXPORTS_DIR, `flota-${periodo}${conIva ? '-con-iva' : ''}.${ext}`);
  fs.writeFileSync(destino, buf);
  console.log('Exportado a:', destino);
} catch (e) {
  error(e.message);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
