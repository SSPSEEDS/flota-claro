// Prueba de integracion end-to-end con PostgreSQL en memoria (pg-mem).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { setPool } from '../src/db/pool.js';
import { migrar, queryLineas, resumenPorPeriodo, getFacturaPdf, eliminarPeriodo, listarPeriodos } from '../src/db/db.js';
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
  const r = await importarPdf(buf, { nombreOriginal: 'marzo.pdf', usuario: 'compa' });
  // Fecha de factura 08/04 -> consumo del mes anterior (marzo).
  assert.equal(r.periodo, '2026-03');
  assert.equal(r.cantidad, 38);
  assert.equal(r.validacion.cuadra, true);

  const marzo = await queryLineas({ periodo: '2026-03' });
  assert.equal(marzo.length, 38);

  const pdf = await getFacturaPdf('2026-03');
  assert.ok(pdf && pdf.buffer && pdf.buffer.length > 1000, 'el PDF debe quedar guardado en la base');
});

test('importar Excel migra el historico y convive con el PDF', async (t) => {
  if (!fs.existsSync(XLSX)) return t.skip('Excel de ejemplo no disponible');
  const r = await importarExcel(fs.readFileSync(XLSX), { usuario: 'compa' });
  assert.ok(r.total > 800);
  // El Excel tambien tiene 2026-03, pero con otro origen; el aporte del PDF debe seguir cuadrando.
  const marzoPdf = await queryLineas({ periodo: '2026-03', origen: 'pdf' });
  const totalPdf = marzoPdf.reduce((s, x) => s + Number(x.total), 0);
  assert.ok(Math.abs(totalPdf - 740919.15) < 0.5, 'el PDF (2026-03) sigue cuadrando junto al excel');
  // El filtro por linea trae historico (excel) + PDF.
  const lucio = await queryLineas({ linea: '2478402903' });
  const origenes = new Set(lucio.map(x => x.origen));
  assert.ok(origenes.has('pdf') && origenes.has('excel'));
});

test('reimportar el mismo PDF no duplica el periodo', async (t) => {
  if (!fs.existsSync(PDF)) return t.skip('PDF de ejemplo no disponible');
  await importarPdf(fs.readFileSync(PDF), { usuario: 'compa' });
  const marzo = await queryLineas({ periodo: '2026-03', origen: 'pdf' });
  assert.equal(marzo.length, 38);
});

test('eliminarPeriodo borra todas las lineas del mes y su factura', async (t) => {
  if (!fs.existsSync(PDF)) return t.skip('PDF de ejemplo no disponible');
  const borradas = await eliminarPeriodo('2026-03');
  assert.ok(borradas > 0);
  assert.equal((await queryLineas({ periodo: '2026-03' })).length, 0);
  assert.equal(await getFacturaPdf('2026-03'), null);
  assert.ok(!(await listarPeriodos()).includes('2026-03'));
});
