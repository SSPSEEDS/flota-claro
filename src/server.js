// Servidor web de la Flota Claro (nube). PostgreSQL + login con roles.
import express from 'express';
import cookieSession from 'cookie-session';
import { api } from './routes/api.js';
import { auth } from './routes/auth.js';
import { FRONTEND_DIR } from './lib/paths.js';
import { migrar } from './db/db.js';
import { contarUsuarios, crearUsuario } from './auth/users.js';
import { usuarioActual } from './auth/middleware.js';
import { log, warn, error } from './lib/log.js';

const PORT = process.env.PORT || 3000;

/** Crea el admin inicial desde ADMIN_USER/ADMIN_PASSWORD si todavia no hay usuarios. */
async function bootstrapAdmin() {
  if (await contarUsuarios() > 0) return;
  const username = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    warn('No hay usuarios y faltan ADMIN_USER/ADMIN_PASSWORD: crea el admin inicial con esas variables.');
    return;
  }
  await crearUsuario({ username, password, nombre: 'Administrador', rol: 'admin' });
  log(`Admin inicial creado: ${username}`);
}

async function main() {
  await migrar();
  await bootstrapAdmin();

  const app = express();
  app.set('trust proxy', 1); // detras del proxy de EasyPanel (HTTPS)
  app.use(express.json({ limit: '2mb' }));

  const secret = process.env.SESSION_SECRET;
  if (!secret) warn('SESSION_SECRET no definido: usando una clave temporal (definila en produccion).');
  app.use(cookieSession({
    name: 'flota.sid',
    keys: [secret || 'clave-temporal-insegura'],
    maxAge: 12 * 60 * 60 * 1000, // 12 horas
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', auth);
  app.use('/api', api);

  // Frontend estatico. La pagina principal exige sesion; el login es publico.
  app.get('/', (req, res, next) => {
    if (!usuarioActual(req)) return res.redirect('/login.html');
    next();
  });
  app.use(express.static(FRONTEND_DIR));

  app.listen(PORT, () => log(`Flota Claro corriendo en puerto ${PORT}`));
}

main().catch((e) => { error('No se pudo iniciar:', e.message); process.exit(1); });
