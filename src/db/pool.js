// Pool de conexiones a PostgreSQL. Inyectable para tests (pg-mem).
import pg from 'pg';

const { Pool } = pg;

let _pool = null;

// pg devuelve NUMERIC/DECIMAL como string para no perder precision; aca los queremos como Number.
// OID 1700 = numeric. Lo convertimos a float (montos con 2 decimales, sin riesgo de precision).
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

/** Permite inyectar un pool (p. ej. pg-mem) antes de usar la base. Para tests. */
export function setPool(pool) {
  _pool = pool;
}

/** Devuelve el pool singleton; lo crea desde DATABASE_URL si no existe. */
export function getPool() {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta la variable de entorno DATABASE_URL (cadena de conexion a PostgreSQL).');
  }
  // En produccion EasyPanel suele estar en la misma red interna (sin SSL). Si se usa una base
  // externa que exige SSL, definir PGSSL=1.
  const ssl = process.env.PGSSL === '1' ? { rejectUnauthorized: false } : false;
  _pool = new Pool({ connectionString, ssl, max: 5 });
  return _pool;
}

/** Atajo para consultas. */
export function query(text, params) {
  return getPool().query(text, params);
}
