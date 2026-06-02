// CLI: npm run import <archivo.pdf>
import { importarPdf } from '../services/importer.js';
import { getPool } from '../db/pool.js';
import { migrar } from '../db/db.js';
import { formatMonto } from '../lib/money.js';
import { error } from '../lib/log.js';

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: npm run import <archivo.pdf>');
  process.exit(1);
}

try {
  await migrar();
  const r = await importarPdf(ruta, { usuario: 'cli' });
  console.log('--- Importacion OK ---');
  console.log('Periodo:', r.periodo, '| Factura:', r.cabecera.factura, '| Lineas:', r.cantidad);
  console.log('Suma totales:', formatMonto(r.validacion.sumaTotales),
    r.validacion.cuadra ? '(coincide con TOTAL LINEAS)' : '(NO coincide!)');
} catch (e) {
  error(e.message);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
