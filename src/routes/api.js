// Rutas de la API REST (protegidas por sesion/rol).
import { Router } from 'express';
import multer from 'multer';
import {
  queryLineas, listarPeriodos, listarLineas, listarPlanes,
  resumenPorPeriodo, getFactura, getFacturaPdf,
  listarTipoCambio, upsertTipoCambio, eliminarPeriodo,
} from '../db/db.js';
import { importarPdf, importarExcel } from '../services/importer.js';
import { exportarCSV, exportarXLSX } from '../services/export.js';
import { obtenerOficialUltimoDia } from '../services/dolar.js';
import { PLANES } from '../planes.js';
import { requireAuth, puedeEditar, usuarioActual } from '../auth/middleware.js';
import { error } from '../lib/log.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

export const api = Router();

// Toda la API requiere sesion iniciada.
api.use(requireAuth);

function filtrosDeQuery(q) {
  const f = {};
  for (const k of ['periodo', 'linea', 'usuario', 'plan', 'origen']) {
    if (q[k]) f[k] = q[k];
  }
  return f;
}

// --- Lectura (cualquier usuario autenticado) ---
api.get('/lineas', async (req, res, next) => {
  try { res.json(await queryLineas(filtrosDeQuery(req.query))); } catch (e) { next(e); }
});

api.get('/filtros', async (_req, res, next) => {
  try {
    const [periodos, lineas, planes] = await Promise.all([listarPeriodos(), listarLineas(), listarPlanes()]);
    res.json({ periodos, lineas, planes });
  } catch (e) { next(e); }
});

api.get('/resumen', async (_req, res, next) => {
  try { res.json(await resumenPorPeriodo()); } catch (e) { next(e); }
});

// Catalogo de planes (codigo -> GB/nombre) para mostrar los GB en el frontend.
api.get('/planes', (_req, res) => { res.json(PLANES); });

// Tipo de cambio guardado por periodo: { periodo: { tc, fuente } }.
api.get('/tc', async (_req, res, next) => {
  try { res.json(await listarTipoCambio()); } catch (e) { next(e); }
});

api.get('/factura/:periodo', async (req, res, next) => {
  try { res.json(await getFactura(req.params.periodo)); } catch (e) { next(e); }
});

// Descarga del PDF original guardado.
api.get('/factura/:periodo/pdf', async (req, res, next) => {
  try {
    const pdf = await getFacturaPdf(req.params.periodo);
    if (!pdf) return res.status(404).json({ error: 'No hay PDF guardado para ese periodo.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdf.nombre}"`);
    res.send(pdf.buffer);
  } catch (e) { next(e); }
});

// Exportar a CSV o XLSX (formato=csv|xlsx, iva=1 opcional).
api.get('/export', async (req, res, next) => {
  try {
    const formato = (req.query.formato || 'csv').toLowerCase();
    const conIva = req.query.iva === '1' || req.query.iva === 'true';
    const filtros = filtrosDeQuery(req.query);
    const etiqueta = (filtros.periodo || 'todo').replace(/,/g, '_');

    if (formato === 'xlsx') {
      const buf = await exportarXLSX(filtros, { conIva });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="flota-${etiqueta}.xlsx"`);
      return res.send(buf);
    }
    const buf = await exportarCSV(filtros, { conIva });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="flota-${etiqueta}.csv"`);
    res.send(buf);
  } catch (e) { next(e); }
});

// --- Escritura (admin / editor) ---
api.post('/import', puedeEditar, upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo PDF (campo "pdf").' });
    const r = await importarPdf(req.file.buffer, {
      nombreOriginal: req.file.originalname,
      usuario: usuarioActual(req)?.username,
    });
    res.json({
      ok: true, periodo: r.periodo, cantidad: r.cantidad, factura: r.cabecera.factura,
      cuadra: r.validacion.cuadra, sumaTotales: r.validacion.sumaTotales,
      totalFactura: r.cabecera.total_factura,
    });
  } catch (e) { error('POST /import:', e.message); res.status(500).json({ error: e.message }); }
});

// Guardar/editar el tipo de cambio de un periodo a mano (admin/editor).
api.post('/tc', puedeEditar, async (req, res, next) => {
  try {
    const periodo = String(req.body?.periodo || '').trim();
    const tc = Number(req.body?.tc);
    if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ error: 'Periodo invalido (YYYY-MM).' });
    if (!tc || tc <= 0) return res.status(400).json({ error: 'Tipo de cambio invalido.' });
    await upsertTipoCambio({ periodo, tc, fuente: 'manual' });
    res.json({ ok: true, periodo, tc, fuente: 'manual' });
  } catch (e) { next(e); }
});

// Autocompletar el TC (dolar oficial) de los periodos indicados que aun no lo tengan (admin/editor).
api.post('/tc/auto', puedeEditar, async (req, res, next) => {
  try {
    const periodos = Array.isArray(req.body?.periodos) ? req.body.periodos : [];
    const existentes = await listarTipoCambio();
    const tc = {};
    const errores = [];
    for (const p of periodos) {
      if (!/^\d{4}-\d{2}$/.test(p) || existentes[p]) continue; // solo los faltantes
      try {
        const venta = await obtenerOficialUltimoDia(p);
        await upsertTipoCambio({ periodo: p, tc: venta, fuente: 'oficial' });
        tc[p] = venta;
      } catch (e) { errores.push({ periodo: p, error: e.message }); }
    }
    res.json({ ok: true, tc, errores });
  } catch (e) { error('POST /tc/auto:', e.message); res.status(500).json({ error: e.message }); }
});

// Borrar un periodo completo (admin/editor). Sirve para corregir un mes mal cargado.
api.delete('/periodo/:periodo', puedeEditar, async (req, res, next) => {
  try {
    const periodo = String(req.params.periodo);
    if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ error: 'Periodo invalido (YYYY-MM).' });
    const borradas = await eliminarPeriodo(periodo);
    res.json({ ok: true, periodo, borradas });
  } catch (e) { error('DELETE /periodo:', e.message); res.status(500).json({ error: e.message }); }
});

// Migracion del Excel historico (una sola vez; admin/editor).
api.post('/import-excel', puedeEditar, upload.single('excel'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo Excel (campo "excel").' });
    const r = await importarExcel(req.file.buffer, { usuario: usuarioActual(req)?.username });
    res.json({ ok: true, ...r });
  } catch (e) { error('POST /import-excel:', e.message); res.status(500).json({ error: e.message }); }
});

// Manejador de errores de la API.
api.use((err, _req, res, _next) => {
  error('API:', err.message);
  res.status(500).json({ error: err.message });
});
