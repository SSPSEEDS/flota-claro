// Importador (migracion unica) del Excel manual "SEGUIMIENTO DE PAGOS".
// Formato ancho/pivote: una fila por linea, una columna por mes con el total sin IVA.
// Lo convierte a filas largas {periodo, linea, usuario, plan, total, origen:'excel'}.
import fs from 'node:fs';
import xlsx from 'xlsx';
import { warn, log } from '../lib/log.js';

const HOJA = 'SEGUIMIENTO DE PAGOS';

// Numeros de linea con typo conocido en el Excel -> numero correcto del PDF.
const TYPOS_LINEA = {
  '2345363578': '2346363578',
};

/** "SE PAGÓ MES 05-26" / "SE PAGÓ MES 5-24" -> "2026-05" / "2024-05". */
function headerAPeriodo(header) {
  const m = /MES\s*(\d{1,2})\s*-\s*(\d{2})/.exec(String(header || ''));
  if (!m) return null;
  const mes = String(Number(m[1])).padStart(2, '0');
  const anio = `20${m[2]}`;
  if (Number(mes) < 1 || Number(mes) > 12) return null;
  return `${anio}-${mes}`;
}

/** Normaliza el numero de linea a string de 10 digitos (corrige typos conocidos). */
function normalizarLinea(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  let s = typeof valor === 'number' ? String(Math.round(valor)) : String(valor).trim();
  s = s.replace(/\D/g, '');
  if (!/^\d{10}$/.test(s)) return null;
  if (TYPOS_LINEA[s]) {
    warn(`Linea ${s} corregida a ${TYPOS_LINEA[s]} (typo conocido en el Excel).`);
    s = TYPOS_LINEA[s];
  }
  return s;
}

/**
 * Lee el Excel y devuelve { registros, periodos, lineasDistintas }.
 * registros: arreglo de filas largas listas para insertar (origen 'excel').
 */
export function parseExcelSeguimiento(rutaOBuffer) {
  const buf = Buffer.isBuffer(rutaOBuffer) ? rutaOBuffer : fs.readFileSync(rutaOBuffer);
  const wb = xlsx.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[HOJA];
  if (!ws) throw new Error(`No se encontro la hoja "${HOJA}" en el Excel.`);

  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true });
  const hidx = rows.findIndex(r => String(r[0]).trim() === 'N de linea');
  if (hidx === -1) throw new Error('No se encontro la fila de encabezados ("N de linea").');

  const header = rows[hidx];
  // Mapa columna -> periodo (desde la columna 3 en adelante).
  const colPeriodo = new Map();
  for (let j = 3; j < header.length; j++) {
    const periodo = headerAPeriodo(header[j]);
    if (periodo) colPeriodo.set(j, periodo);
  }

  const registros = [];
  const periodos = new Set();
  const lineasDistintas = new Set();

  for (let i = hidx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const linea = normalizarLinea(row[0]);
    if (!linea) continue; // fila vacia o de totales

    const usuario = row[1] != null ? String(row[1]).trim() : null;
    const plan = row[2] != null ? String(row[2]).trim() : null;
    lineasDistintas.add(linea);

    for (const [j, periodo] of colPeriodo) {
      const celda = row[j];
      if (celda === null || celda === undefined || celda === '') continue;
      const total = typeof celda === 'number' ? celda : Number(String(celda).replace(/[^\d.-]/g, ''));
      if (Number.isNaN(total)) continue;
      registros.push({
        periodo, linea, usuario, plan,
        abono: null, bonificaciones: null, datos: null, otros: null,
        total,
        origen: 'excel',
      });
      periodos.add(periodo);
    }
  }

  log(`Excel parseado: ${registros.length} registros, ${lineasDistintas.size} lineas, ${periodos.size} periodos.`);
  return {
    registros,
    periodos: [...periodos].sort(),
    lineasDistintas: [...lineasDistintas],
  };
}
