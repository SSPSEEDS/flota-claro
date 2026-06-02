// Utilidades para el formato monetario argentino: "$1.234.567,89" -> 1234567.89
// Punto = separador de miles, coma = separador decimal.

/**
 * Normaliza un texto con formato argentino a Number.
 * Acepta: "$1.234,56", "-$53.154,00", "1.234,56", "$ 26060", ".", "", null.
 * Devuelve null cuando la celda esta vacia ("." o "").
 */
export function parseMonto(texto) {
  if (texto === null || texto === undefined) return null;
  let s = String(texto).trim();
  if (s === '' || s === '.') return null;

  const negativo = s.includes('-');
  s = s.replace(/[^\d.,]/g, ''); // quita $, -, espacios, etc.
  if (s === '') return null;

  // Quita separadores de miles (puntos) y convierte la coma decimal en punto.
  s = s.replace(/\./g, '').replace(',', '.');

  const valor = Number(s);
  if (Number.isNaN(valor)) return null;
  return negativo ? -valor : valor;
}

/** Formatea un Number al formato argentino "$1.234.567,89". */
export function formatMonto(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/** Redondea a 2 decimales evitando errores de punto flotante. */
export function redondear2(valor) {
  if (valor === null || valor === undefined) return null;
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
