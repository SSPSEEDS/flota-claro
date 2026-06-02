// Rutas de autenticacion y gestion de usuarios.
import { Router } from 'express';
import { verificarCredenciales, crearUsuario, listarUsuarios, eliminarUsuario } from '../auth/users.js';
import { usuarioActual, requireAuth, esAdmin } from '../auth/middleware.js';
import { log, error } from '../lib/log.js';

export const auth = Router();

// Inicio de sesion.
auth.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const u = await verificarCredenciales(username, password);
    if (!u) return res.status(401).json({ error: 'Usuario o contrasena incorrectos.' });
    req.session.user = u;
    log(`Login OK: ${u.username} (${u.rol})`);
    res.json({ ok: true, usuario: u });
  } catch (e) {
    error('POST /login:', e.message);
    res.status(500).json({ error: 'Error al iniciar sesion.' });
  }
});

// Cierre de sesion.
auth.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// Usuario actual (para que el frontend sepa el rol).
auth.get('/me', (req, res) => {
  res.json({ usuario: usuarioActual(req) });
});

// --- Gestion de usuarios (solo admin) ---
auth.get('/usuarios', requireAuth, esAdmin, async (_req, res) => {
  res.json(await listarUsuarios());
});

auth.post('/usuarios', requireAuth, esAdmin, async (req, res) => {
  try {
    const { username, password, nombre, rol } = req.body || {};
    const u = await crearUsuario({ username, password, nombre, rol });
    res.json({ ok: true, usuario: u });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

auth.delete('/usuarios/:id', requireAuth, esAdmin, async (req, res) => {
  try {
    await eliminarUsuario(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
