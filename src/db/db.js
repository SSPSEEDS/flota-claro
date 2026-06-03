// Capa de acceso a datos sobre PostgreSQL.
import { getPool, query } from './pool.js';
import { SCHEMA } from './schema.js';

/** Crea el esquema (idempotente). Ejecuta cada sentencia por separado. */
export async function migrar() {
  const sentencias = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
  for (const s of sentencias) {
    await query(s);
  }
}

/**
 * Reemplaza todas las lineas de un periodo+origen por las nuevas, en una transaccion.
 * Regla de negocio: la ultima importacion reemplaza a la anterior para ese periodo.
 */
export async function reemplazarPeriodo({ periodo, origen, lineas, factura = null, usuario = null }) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM lineas WHERE periodo = $1 AND origen = $2', [periodo, origen]);
    const sql = `
      INSERT INTO lineas
        (periodo, factura, linea, usuario, plan, abono, bonificaciones, datos, otros, total, origen, importado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `;
    for (const l of lineas) {
      await client.query(sql, [
        periodo,
        l.factura ?? factura ?? null,
        String(l.linea),
        l.usuario ?? null,
        l.plan ?? null,
        l.abono ?? null,
        l.bonificaciones ?? null,
        l.datos ?? null,
        l.otros ?? null,
        l.total ?? null,
        origen,
        usuario,
      ]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return lineas.length;
}

/** Inserta o actualiza la cabecera de una factura (clave: periodo), incluido el PDF. */
export async function upsertFactura(f) {
  await query(`
    INSERT INTO facturas
      (periodo, factura, fecha, vencimiento, total_factura, total_a_pagar, total_sin_iva,
       iva21, iva27, cuotas_equipos, pdf, pdf_nombre, importado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (periodo) DO UPDATE SET
      factura = EXCLUDED.factura,
      fecha = EXCLUDED.fecha,
      vencimiento = EXCLUDED.vencimiento,
      total_factura = EXCLUDED.total_factura,
      total_a_pagar = EXCLUDED.total_a_pagar,
      total_sin_iva = EXCLUDED.total_sin_iva,
      iva21 = EXCLUDED.iva21,
      iva27 = EXCLUDED.iva27,
      cuotas_equipos = EXCLUDED.cuotas_equipos,
      pdf = EXCLUDED.pdf,
      pdf_nombre = EXCLUDED.pdf_nombre,
      importado_en = now(),
      importado_por = EXCLUDED.importado_por
  `, [
    f.periodo, f.factura ?? null, f.fecha ?? null, f.vencimiento ?? null,
    f.total_factura ?? null, f.total_a_pagar ?? null, f.total_sin_iva ?? null,
    f.iva21 ?? null, f.iva27 ?? null, f.cuotas_equipos ?? null,
    f.pdf ? Buffer.from(f.pdf).toString('base64') : null, f.pdf_nombre ?? null, f.importado_por ?? null,
  ]);
}

/** Inserta una linea en el catalogo; actualiza el nombre canonico si se pasa. */
export async function upsertCatalogo({ linea, usuario_canonico = null, activa = true }) {
  await query(`
    INSERT INTO lineas_catalogo (linea, usuario_canonico, activa)
    VALUES ($1, $2, $3)
    ON CONFLICT (linea) DO UPDATE SET
      usuario_canonico = COALESCE(EXCLUDED.usuario_canonico, lineas_catalogo.usuario_canonico),
      activa = EXCLUDED.activa
  `, [String(linea), usuario_canonico, activa]);
}

/** Consulta lineas con filtros opcionales: { periodo, linea, usuario, plan, origen }. */
export async function queryLineas(filtros = {}) {
  const where = [];
  const params = [];
  const add = (cond, val) => { params.push(val); where.push(cond.replace('?', `$${params.length}`)); };

  if (filtros.periodo) add('periodo = ?', filtros.periodo);
  if (filtros.linea) add('linea = ?', String(filtros.linea));
  if (filtros.usuario) add('usuario ILIKE ?', `%${filtros.usuario}%`);
  if (filtros.plan) add('plan = ?', filtros.plan);
  if (filtros.origen) add('origen = ?', filtros.origen);

  const sql = `
    SELECT id, periodo, factura, linea, usuario, plan, abono, bonificaciones, datos, otros, total, origen, importado_en
    FROM lineas
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY periodo DESC, linea ASC
  `;
  const { rows } = await query(sql, params);
  return rows;
}

/** Lista de periodos disponibles, mas reciente primero. */
export async function listarPeriodos() {
  const { rows } = await query('SELECT DISTINCT periodo FROM lineas ORDER BY periodo DESC');
  return rows.map(r => r.periodo);
}

/** Lista de lineas distintas con su ultimo usuario conocido (para selectores). */
export async function listarLineas() {
  const { rows } = await query(`
    SELECT l.linea,
           COALESCE(c.usuario_canonico, (
             SELECT usuario FROM lineas l2
             WHERE l2.linea = l.linea AND l2.usuario IS NOT NULL
             ORDER BY periodo DESC LIMIT 1
           )) AS usuario
    FROM (SELECT DISTINCT linea FROM lineas) l
    LEFT JOIN lineas_catalogo c ON c.linea = l.linea
    ORDER BY usuario NULLS LAST
  `);
  return rows;
}

/** Lista de planes distintos. */
export async function listarPlanes() {
  const { rows } = await query('SELECT DISTINCT plan FROM lineas WHERE plan IS NOT NULL ORDER BY plan');
  return rows.map(r => r.plan);
}

/** Resumen de totales por periodo. */
export async function resumenPorPeriodo() {
  const { rows } = await query(`
    SELECT periodo, COUNT(*)::int AS cantidad_lineas, SUM(total) AS total
    FROM lineas GROUP BY periodo ORDER BY periodo DESC
  `);
  return rows;
}

/** Devuelve la cabecera de factura de un periodo (sin el blob del PDF). */
export async function getFactura(periodo) {
  const { rows } = await query(`
    SELECT periodo, factura, fecha, vencimiento, total_factura, total_a_pagar, total_sin_iva,
           iva21, iva27, cuotas_equipos, pdf_nombre, importado_en, importado_por,
           (pdf IS NOT NULL) AS tiene_pdf
    FROM facturas WHERE periodo = $1
  `, [periodo]);
  return rows[0] ?? null;
}

/** Devuelve el tipo de cambio guardado de cada periodo como objeto { periodo: { tc, fuente } }. */
export async function listarTipoCambio() {
  const { rows } = await query('SELECT periodo, tc, fuente FROM tipo_cambio');
  const out = {};
  for (const r of rows) out[r.periodo] = { tc: r.tc, fuente: r.fuente };
  return out;
}

/** Inserta o actualiza el tipo de cambio de un periodo. */
export async function upsertTipoCambio({ periodo, tc, fuente = 'manual' }) {
  await query(`
    INSERT INTO tipo_cambio (periodo, tc, fuente, actualizado_en)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (periodo) DO UPDATE SET
      tc = EXCLUDED.tc, fuente = EXCLUDED.fuente, actualizado_en = now()
  `, [periodo, tc, fuente]);
}

/** Devuelve el PDF guardado de un periodo (buffer + nombre). */
export async function getFacturaPdf(periodo) {
  const { rows } = await query('SELECT pdf, pdf_nombre FROM facturas WHERE periodo = $1', [periodo]);
  if (!rows[0] || !rows[0].pdf) return null;
  return { buffer: Buffer.from(rows[0].pdf, 'base64'), nombre: rows[0].pdf_nombre || `${periodo}-factura.pdf` };
}
