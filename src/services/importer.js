// Servicios de importacion: orquestan parser + base de datos (PostgreSQL).
import fs from 'node:fs';
import { parseInvoice } from '../parser/parseInvoice.js';
import { parseExcelSeguimiento } from '../parser/importExcel.js';
import { reemplazarPeriodo, upsertFactura, upsertCatalogo } from '../db/db.js';
import { log, warn } from '../lib/log.js';

/**
 * Importa una factura PDF (Buffer o ruta). Parsea, reemplaza el periodo,
 * guarda el PDF en la base y actualiza cabecera + catalogo de lineas.
 */
export async function importarPdf(pdf, { nombreOriginal = null, usuario = null } = {}) {
  const buf = Buffer.isBuffer(pdf) ? pdf : fs.readFileSync(pdf);
  const { cabecera, lineas, validacion } = await parseInvoice(buf);

  if (!cabecera.periodo) {
    throw new Error('No se pudo determinar el periodo (fecha de factura) del PDF.');
  }

  const cantidad = await reemplazarPeriodo({
    periodo: cabecera.periodo,
    origen: 'pdf',
    factura: cabecera.factura,
    lineas,
    usuario,
  });

  await upsertFactura({
    ...cabecera,
    pdf: buf,
    pdf_nombre: nombreOriginal || `${cabecera.periodo}-factura.pdf`,
    importado_por: usuario,
  });

  for (const l of lineas) {
    await upsertCatalogo({ linea: l.linea, usuario_canonico: l.usuario, activa: true });
  }

  if (!validacion.cuadra) warn('El total importado no coincide con TOTAL LINEAS del PDF (revisar).');
  log(`PDF importado: periodo ${cabecera.periodo}, ${cantidad} lineas (por ${usuario ?? 'CLI'}).`);

  return { periodo: cabecera.periodo, cantidad, cabecera, validacion };
}

/** Importa el Excel historico (migracion unica). Inserta por periodo con origen 'excel'. */
export async function importarExcel(rutaOBuffer, { usuario = null } = {}) {
  const { registros, periodos, lineasDistintas } = parseExcelSeguimiento(rutaOBuffer);

  const porPeriodo = new Map();
  for (const r of registros) {
    if (!porPeriodo.has(r.periodo)) porPeriodo.set(r.periodo, []);
    porPeriodo.get(r.periodo).push(r);
  }

  let total = 0;
  for (const [periodo, lineas] of porPeriodo) {
    total += await reemplazarPeriodo({ periodo, origen: 'excel', lineas, usuario });
  }

  for (const linea of lineasDistintas) {
    await upsertCatalogo({ linea, usuario_canonico: null, activa: true });
  }

  log(`Excel importado: ${total} registros en ${periodos.length} periodos (por ${usuario ?? 'CLI'}).`);
  return { total, periodos, lineas: lineasDistintas.length };
}
