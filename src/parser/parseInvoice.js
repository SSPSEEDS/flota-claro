// Parser de la factura Claro (AMX Argentina SA) en PDF.
// Extrae la cabecera y el "DETALLE DE ITEMS POR LINEA".
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseMonto, redondear2 } from '../lib/money.js';
import { warn } from '../lib/log.js';

const require = createRequire(import.meta.url);
// Se importa el archivo interno para evitar el bloque de debug del index de pdf-parse.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

// Codigo de plan Claro: letras + digitos + 1 letra. Cubre el formato actual
// (CC10R, CC14C, PC91R: 2 letras + 2 digitos) y el viejo (A060C: 1 letra + 3 digitos).
const PLAN_RE = /[A-Z]{1,2}\d{2,3}[A-Z]/;
// Un monto argentino, con signo opcional: $26.060,00  -$15.636,00
const MONTO_TOKEN_RE = /-?\$[\d.]+,\d{2}/g;

/** Extrae el texto plano del PDF (acepta Buffer o ruta). */
export async function extraerTexto(pdf) {
  const buf = Buffer.isBuffer(pdf) ? pdf : fs.readFileSync(pdf);
  const data = await pdfParse(buf);
  return data.text;
}

/** Convierte "08/04/2026" -> "2026-04-08" y deriva el periodo "2026-04". */
function parseFecha(ddmmyyyy) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(ddmmyyyy || '');
  if (!m) return { iso: null, periodo: null };
  const [, dd, mm, yyyy] = m;
  return { iso: `${yyyy}-${mm}-${dd}`, periodo: `${yyyy}-${mm}` };
}

/** Resta un mes a un periodo "YYYY-MM" (maneja el cambio de anio). "2026-01" -> "2025-12". */
function periodoMesAnterior(periodo) {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo || '');
  if (!m) return periodo;
  let anio = Number(m[1]);
  let mes = Number(m[2]) - 1;
  if (mes < 1) { mes = 12; anio -= 1; }
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

/**
 * Deriva el periodo de consumo desde "Período Facturado desde DD/MM/YYYY hasta ...".
 * Es la fuente mas confiable (esta en todos los formatos de factura) y equivale al
 * mes anterior a la fecha de factura. Devuelve "YYYY-MM" del "desde" o null.
 */
function periodoDesdeFacturado(texto) {
  const m = /Per[ií]odo Facturado desde\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(texto);
  return m ? `${m[3]}-${m[2]}` : null;
}

/** Busca el primer monto que sigue a una etiqueta dada en el texto. */
function montoTrasEtiqueta(texto, etiqueta) {
  const re = new RegExp(etiqueta + '\\s*:?\\s*(-?\\$[\\d.]+,\\d{2})');
  const m = re.exec(texto);
  return m ? parseMonto(m[1]) : null;
}

/** Parsea la cabecera de la factura. */
export function parseCabecera(texto) {
  // Nº de factura: formato nuevo "Factura N° 1331-..." y viejo "Factura Nro. 1331-...".
  const factura = /Factura\s+N(?:[°ºo]|ro\.?)\s*([\d-]+)/i.exec(texto)?.[1] ?? null;
  // Fecha de factura: "Fecha de Factura", "Fecha de Emisión Factura:" o "Fecha Factura:".
  const fechaTxt = /Fecha(?:\s+de)?(?:\s+Emisi[oó]n)?\s+Factura\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(texto)?.[1] ?? null;
  const vtoTxt = /Vencimiento:\s*(\d{2}\/\d{2}\/\d{4})/.exec(texto)?.[1] ?? null;
  const { iso: fecha, periodo: periodoFactura } = parseFecha(fechaTxt);
  const { iso: vencimiento } = parseFecha(vtoTxt);
  // La factura se emite a comienzos del mes siguiente al consumo: la fechada el
  // 08/05 (periodo facturado 09/04 al 08/05) corresponde al consumo de ABRIL.
  // Usamos el mes del "Período Facturado desde" (mas confiable y presente en todos
  // los formatos); si no estuviera, caemos al mes anterior a la fecha de factura.
  const periodo = periodoDesdeFacturado(texto) || periodoMesAnterior(periodoFactura);

  // IVA 21.0% (Neto gravado $ 273465.86) $57.427,83  /  IVA 27.0% (...) $126.212,39
  // El neto gravado va en parentesis y usa formato ingles; saltamos hasta el ")".
  const iva21 = parseMonto(/IVA 21[.,]0%.*?\)\s*(\$[\d.]+,\d{2})/.exec(texto)?.[1]);
  const iva27 = parseMonto(/IVA 27[.,]0%.*?\)\s*(\$[\d.]+,\d{2})/.exec(texto)?.[1]);

  return {
    factura,
    fecha,
    periodo,
    vencimiento,
    total_a_pagar: montoTrasEtiqueta(texto, 'Total a Pagar'),
    total_factura: montoTrasEtiqueta(texto, 'Total Factura'),
    total_sin_iva: montoTrasEtiqueta(texto, 'Total sin Impuestos'),
    iva21,
    iva27,
    cuotas_equipos: montoTrasEtiqueta(texto, 'Total Cuotas de Equipos'),
  };
}

/**
 * Parsea una fila del detalle por linea.
 * Forma: <10 digitos><usuario><PLAN><montos y puntos><PROVINCIA>
 * Las 10 columnas de valores (en orden) son:
 *  0 valor plan, 1 servicios adicionales, 2 bonificaciones, 3 llamadas locales/nac,
 *  4 llamadas internacionales, 5 roaming, 6 mensajes, 7 datos, 8 otros cargos, 9 total.
 * Devuelve null si la fila no matchea el formato esperado.
 */
export function parseFilaLinea(fila) {
  const mLinea = /^(\d{10})/.exec(fila);
  if (!mLinea) return null;
  const linea = mLinea[1];

  const mPlan = PLAN_RE.exec(fila);
  if (!mPlan) return null;
  const plan = mPlan[0];
  const planIdx = mPlan.index;

  const usuario = fila.slice(linea.length, planIdx).trim().replace(/\s+/g, ' ');

  // Region de valores: desde despues del plan hasta antes de la provincia (texto final).
  let resto = fila.slice(planIdx + plan.length);
  // Recorta la provincia / texto final (todo lo no numerico al final).
  const finProv = /([A-ZÁÉÍÓÚ ]+)\s*$/.exec(resto);
  if (finProv) resto = resto.slice(0, finProv.index);

  // Tokeniza en montos (consume los puntos internos de miles) y celdas vacias (".").
  const cols = [];
  let i = 0;
  while (i < resto.length) {
    MONTO_TOKEN_RE.lastIndex = i;
    const m = MONTO_TOKEN_RE.exec(resto);
    if (m && m.index === i) {
      cols.push(parseMonto(m[0]));
      i = m.index + m[0].length;
    } else if (resto[i] === '.') {
      cols.push(null); // celda vacia
      i += 1;
    } else {
      i += 1; // espacios u otros separadores
    }
  }

  if (cols.length < 10) {
    warn(`Linea ${linea}: se esperaban 10 columnas y se encontraron ${cols.length}. Fila: ${fila}`);
  }

  const abono = cols[0] ?? null;
  const bonificaciones = cols[2] ?? null;
  const datos = cols[7] ?? null;
  const total = cols[cols.length - 1] ?? null; // ultima columna = total por linea
  // "otros" = resto de cargos variables (servicios adic., llamadas, roaming, mensajes, otros cargos).
  const otrosIdx = [1, 3, 4, 5, 6, 8];
  const otros = redondear2(otrosIdx.reduce((acc, idx) => acc + (cols[idx] ?? 0), 0)) || null;

  return { linea, usuario, plan, abono, bonificaciones, datos, otros, total };
}

/**
 * Parsea el detalle por linea completo.
 * Devuelve { lineas, totalLineas } donde totalLineas es el valor de la fila "TOTAL LINEAS".
 */
export function parseDetalleLineas(texto) {
  const inicio = texto.indexOf('DETALLE DE ITEMS POR LINEA');
  if (inicio === -1) throw new Error('No se encontro la seccion "DETALLE DE ITEMS POR LINEA".');

  const region = texto.slice(inicio);
  const filas = region.split('\n');
  const lineas = [];
  let totalLineas = null;

  for (const fila of filas) {
    if (/^TOTAL LINEAS/.test(fila.trim())) {
      const montos = fila.match(MONTO_TOKEN_RE);
      if (montos && montos.length) totalLineas = parseMonto(montos[montos.length - 1]);
      break; // fin del bloque
    }
    if (/^\d{10}/.test(fila.trim())) {
      const parsed = parseFilaLinea(fila.trim());
      if (parsed) lineas.push(parsed);
    }
  }

  return { lineas, totalLineas };
}

/**
 * Parsea una factura completa desde Buffer o ruta.
 * Devuelve { cabecera, lineas, totalLineas, validacion }.
 */
export async function parseInvoice(pdf) {
  const texto = await extraerTexto(pdf);
  const cabecera = parseCabecera(texto);
  const { lineas, totalLineas } = parseDetalleLineas(texto);

  const sumaTotales = redondear2(lineas.reduce((acc, l) => acc + (l.total ?? 0), 0));
  const cuadra = totalLineas !== null && Math.abs(sumaTotales - totalLineas) < 0.5;
  if (!cuadra) {
    warn(`La suma de totales por linea (${sumaTotales}) no coincide con TOTAL LINEAS (${totalLineas}).`);
  }

  return {
    cabecera,
    lineas,
    totalLineas,
    validacion: { sumaTotales, totalLineas, cuadra, cantidadLineas: lineas.length },
  };
}
