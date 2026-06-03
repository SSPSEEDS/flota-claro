// Obtiene el dolar oficial (venta) del ultimo dia de un mes, desde ArgentinaDatos.
// La API arrastra la ultima cotizacion conocida en fines de semana/feriados, asi que
// alcanza con pedir el ultimo dia del mes directamente.
const BASE = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial';

/** Devuelve la fecha (UTC) del ultimo dia del mes; si el mes es el actual/futuro, usa hoy. */
function ultimoDiaMes(periodo) {
  const [a, m] = String(periodo).split('-').map(Number);
  const finMes = new Date(Date.UTC(a, m, 0)); // dia 0 del mes siguiente = ultimo dia de este mes
  const hoy = new Date();
  return finMes > hoy ? hoy : finMes;
}

/**
 * Tipo de cambio oficial (venta) del ultimo dia del periodo "YYYY-MM".
 * Lanza error si la API no responde o no trae el valor.
 */
export async function obtenerOficialUltimoDia(periodo) {
  const d = ultimoDiaMes(periodo);
  const y = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const r = await fetch(`${BASE}/${y}/${mm}/${dd}`);
  if (!r.ok) throw new Error(`No se pudo obtener el dolar oficial de ${periodo} (HTTP ${r.status}).`);
  const j = await r.json();
  const venta = Number(j?.venta);
  if (!venta) throw new Error(`Respuesta sin cotizacion para ${periodo}.`);
  return venta;
}
