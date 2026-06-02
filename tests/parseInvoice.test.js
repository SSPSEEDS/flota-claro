// Tests del parser y utilidades. Ejecutar con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInvoice, parseFilaLinea } from '../src/parser/parseInvoice.js';
import { parseMonto } from '../src/lib/money.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.join(__dirname, '..', 'data', 'facturas', '2026-04-factura.pdf');

test('parseMonto normaliza el formato argentino', () => {
  assert.equal(parseMonto('$26.060,00'), 26060);
  assert.equal(parseMonto('-$53.154,00'), -53154);
  assert.equal(parseMonto('$524,79'), 524.79);
  assert.equal(parseMonto('.'), null);
  assert.equal(parseMonto(''), null);
});

test('parseFilaLinea separa columnas y aplica la ecuacion total = abono+bonif+datos+otros', () => {
  const fila = '2478402903PERONI, LUCIOCC14C$88.590,00.-$53.154,00$524,79.....$35.960,79BUENOS AIRES';
  const r = parseFilaLinea(fila);
  assert.equal(r.linea, '2478402903');
  assert.equal(r.plan, 'CC14C');
  assert.equal(r.abono, 88590);
  assert.equal(r.bonificaciones, -53154);
  assert.equal(r.otros, 524.79);
  assert.equal(r.total, 35960.79);
  const suma = r.abono + r.bonificaciones + (r.datos || 0) + (r.otros || 0);
  assert.ok(Math.abs(suma - r.total) < 0.01);
});

test('parseInvoice extrae 38 lineas y el total cuadra con TOTAL LINEAS', async (t) => {
  try {
    const r = await parseInvoice(PDF);
    assert.equal(r.lineas.length, 38);
    assert.equal(r.validacion.cuadra, true);
    assert.equal(r.cabecera.factura, '1331-02276863');
    assert.equal(r.cabecera.periodo, '2026-04');
  } catch (e) {
    if (e.code === 'ENOENT') return t.skip('PDF de ejemplo no disponible');
    throw e;
  }
});
