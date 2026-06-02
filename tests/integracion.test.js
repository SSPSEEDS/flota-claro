// Prueba de integracion end-to-end con PostgreSQL en memoria (pg-mem).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { setPool } from '../src/db/pool.js';
import { migrar, queryLineas, resumenPorPeriodo, getFacturaPdf } from '../src/db/db.js';
import { importarPdf, importarExcel } from '../src/services/importer.js';
import { crearUsuario, verificarCredenciales } from '../src/auth/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.join(__dirname, '..', 'data', 'facturas', '2026-04-factura.pdf');
const XLSX = path.join(__dirname, '..', 'LINEAS CLARO DEFINITIVA - Lucio.xlsx');

before(async () => {
  const db = newDb();
  const pg = db.adapters.createPg();
  setPool(new pg.Pool());
  await migrar();
});

test('login: crea usuario y verifica credenciales con hash', async () => {
  await crearUsuario({ username: 'jefe', password: 'secreta123', rol: 'viewer' });
  assert.equal(await verificarCredenciales('jefe', 'mala'), null);
  const u = await verificarCredenciales('jefe', 'secreta123');
  assert.equal(u.rol, 'viewer');
});

test('importar PDF guarda 38 lineas, cabecera y el PDF en la base', async (t) => {
  if (!fs.existsSync(PDF)) return t.skip('PDF de ejemplo no disponible');
  const buf = fs.readFileSync(PDF);
  const r = await importarPdf(buf, { nombreOriginal: 'abril.pdf', usuario: 'compa' });
  assert.equal(r.periodo, '2026-04');
  assert.equal(r.cantidad, 38);
  assert.equal(r.validacion.cuadra, true);

  const abril = await queryLineas({ periodo: '2026-04' });
  assert.equal(abril.length, 38);

  const pdf = await getFacturaPdf('2026-04');
  assert.ok(pdf && pdf.buffer && pdf.buffer.length > 1000, 'el PDF debe quedar guardado en la base');
});

test('importar Excel migra el historico y convive con el PDF', async (t) => {
  if (!fs.existsSync(XLSX)) return t.skip('Excel de ejemplo no disponible');
  const r = await importarExcel(fs.readFileSync(XLSX), { usuario: 'compa' });
  assert.ok(r.total > 800);
  const resumen = await resumenPorPeriodo();
  const abril = resumen.find(x => x.periodo === '2026-04');
  assert.ok(Math.abs(Number(abril.total) - 740919.15) < 0.5, 'abril (PDF) sigue cuadrando');
  // El filtro por linea trae historico (excel) + abril (pdf).
  const lucio = await queryLineas({ linea: '2478402903' });
  const origenes = new Set(lucio.map(x => x.origen));
  assert.ok(origenes.has('pdf') && origenes.has('excel'));
});

test('reimportar el mismo PDF no duplica el periodo', async (t) => {
  if (!fs.existsSync(PDF)) return t.skip('PDF de ejemplo no disponible');
  await importarPdf(fs.readFileSync(PDF), { usuario: 'compa' });
  const abril = await queryLineas({ periodo: '2026-04', origen: 'pdf' });
  assert.equal(abril.length, 38);
});
