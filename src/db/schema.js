// Esquema PostgreSQL. Una sola fila por (periodo, linea, origen).
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS lineas (
  id              BIGSERIAL PRIMARY KEY,
  periodo         TEXT    NOT NULL,            -- YYYY-MM
  factura         TEXT,                        -- ej: 1331-02276863 (null en historico Excel)
  linea           TEXT    NOT NULL,            -- numero de linea (clave de reconciliacion)
  usuario         TEXT,                        -- titular segun la fuente
  plan            TEXT,                        -- codigo/plan segun la fuente
  abono           NUMERIC(14,2),               -- valor plan sin IVA (solo PDF)
  bonificaciones  NUMERIC(14,2),               -- descuento, negativo (solo PDF)
  datos           NUMERIC(14,2),               -- excedente datos (solo PDF)
  otros           NUMERIC(14,2),               -- otros cargos variables (solo PDF)
  total           NUMERIC(14,2),               -- total sin IVA
  origen          TEXT    NOT NULL,            -- 'pdf' | 'excel'
  importado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  importado_por   TEXT,                        -- usuario que realizo la importacion
  UNIQUE (periodo, linea, origen)
);

CREATE INDEX IF NOT EXISTS idx_lineas_periodo ON lineas (periodo);
CREATE INDEX IF NOT EXISTS idx_lineas_linea ON lineas (linea);

CREATE TABLE IF NOT EXISTS facturas (
  periodo         TEXT PRIMARY KEY,            -- YYYY-MM
  factura         TEXT,
  fecha           TEXT,                        -- fecha de factura (YYYY-MM-DD)
  vencimiento     TEXT,
  total_factura   NUMERIC(14,2),
  total_a_pagar   NUMERIC(14,2),
  total_sin_iva   NUMERIC(14,2),
  iva21           NUMERIC(14,2),
  iva27           NUMERIC(14,2),
  cuotas_equipos  NUMERIC(14,2),
  pdf             TEXT,                         -- PDF original en base64 (durabilidad, entra al backup)
  pdf_nombre      TEXT,
  importado_en    TIMESTAMPTZ DEFAULT now(),
  importado_por   TEXT
);

CREATE TABLE IF NOT EXISTS lineas_catalogo (
  linea             TEXT PRIMARY KEY,
  usuario_canonico  TEXT,
  activa            BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  nombre        TEXT,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'viewer', -- 'admin' | 'editor' | 'viewer'
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
