// Exportacion de lineas a CSV o XLSX, con IVA opcional.
import xlsx from 'xlsx';
import { queryLineas } from '../db/db.js';
import { redondear2 } from '../lib/money.js';
import { etiquetaPlan } from '../planes.js';

const COLUMNAS = [
  ['periodo', 'Periodo'],
  ['linea', 'Linea'],
  ['usuario', 'Usuario'],
  ['plan', 'Plan'],
  ['abono', 'Abono'],
  ['bonificaciones', 'Bonificaciones'],
  ['datos', 'Datos'],
  ['otros', 'Otros'],
  ['total', 'Total sin IVA'],
  ['origen', 'Origen'],
  ['factura', 'Factura'],
];

// Alicuota de IVA por defecto al exportar con impuestos (servicios de telefonia movil: 21%).
const IVA_DEFECTO = 0.21;

/** Arma las filas a exportar segun filtros. Si conIva, agrega columnas con impuesto. */
export async function armarFilas(filtros = {}, { conIva = false, alicuota = IVA_DEFECTO } = {}) {
  const lineas = await queryLineas(filtros);
  return lineas.map(l => {
    const fila = {};
    for (const [campo, titulo] of COLUMNAS) fila[titulo] = campo === 'plan' ? etiquetaPlan(l[campo]) : l[campo];
    if (conIva) {
      fila[`IVA ${Math.round(alicuota * 100)}%`] = redondear2((l.total ?? 0) * alicuota);
      fila['Total con IVA'] = redondear2((l.total ?? 0) * (1 + alicuota));
    }
    return fila;
  });
}

/** Devuelve un Buffer con el contenido CSV. */
export async function exportarCSV(filtros = {}, opts = {}) {
  const filas = await armarFilas(filtros, opts);
  const ws = xlsx.utils.json_to_sheet(filas);
  const csv = xlsx.utils.sheet_to_csv(ws, { FS: ';' }); // ; para que Excel-AR separe columnas
  return Buffer.from('﻿' + csv, 'utf8'); // BOM para acentos en Excel
}

/** Devuelve un Buffer con el contenido XLSX. */
export async function exportarXLSX(filtros = {}, opts = {}) {
  const filas = await armarFilas(filtros, opts);
  const ws = xlsx.utils.json_to_sheet(filas);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Lineas');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
