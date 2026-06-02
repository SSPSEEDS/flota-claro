// Smoke test del servidor HTTP con pg-mem (no usa Postgres real).
// Arranca el server con un pool en memoria y prueba login + endpoints + roles.
import { newDb } from 'pg-mem';
import { setPool } from '../src/db/pool.js';

// pg-mem como base. El server migra y crea el admin inicial (bootstrap) al arrancar.
const db = newDb();
const pg = db.adapters.createPg();
setPool(new pg.Pool());

process.env.SESSION_SECRET = 'test-secret';
process.env.PORT = '3210';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'admin123';
await import('../src/server.js');
await new Promise(r => setTimeout(r, 500));

const base = 'http://localhost:3210';
let cookie = '';

function check(cond, msg) { console.log((cond ? 'OK  ' : 'FALLA ') + msg); if (!cond) process.exitCode = 1; }

// Convierte el set-cookie de la respuesta en un header "Cookie" (solo nombre=valor).
function tomarCookie(res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (arr.length) cookie = arr.map(c => c.split(';')[0]).join('; ');
  return cookie;
}

// Crea el usuario "jefe" (viewer) como admin.
async function crearJefe() {
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const c = tomarCookie(r);
  await fetch(base + '/api/auth/usuarios', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c },
    body: JSON.stringify({ username: 'jefe', password: 'jefe123', rol: 'viewer' }),
  });
}
await crearJefe();

async function login(u, p) {
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  });
  if (r.status === 200) tomarCookie(r);
  return r;
}

// Sin sesion -> 401
let r = await fetch(base + '/api/lineas');
check(r.status === 401, 'sin sesion /api/lineas -> 401');

// Login malo
r = await login('admin', 'mala');
check(r.status === 401, 'login con clave incorrecta -> 401');

// Login viewer (jefe)
r = await login('jefe', 'jefe123');
check(r.status === 200, 'login jefe -> 200');

// Jefe puede leer
r = await fetch(base + '/api/resumen', { headers: { cookie } });
check(r.status === 200, 'jefe puede leer /api/resumen');

// Jefe NO puede importar (403)
r = await fetch(base + '/api/import', { method: 'POST', headers: { cookie } });
check(r.status === 403, 'jefe NO puede importar -> 403');

// Login admin
r = await login('admin', 'admin123');
check(r.status === 200, 'login admin -> 200');

// Admin ve usuarios
r = await fetch(base + '/api/auth/usuarios', { headers: { cookie } });
const us = await r.json();
check(Array.isArray(us) && us.length === 2, 'admin lista usuarios (2)');

// /api/auth/me
r = await fetch(base + '/api/auth/me', { headers: { cookie } });
const me = await r.json();
check(me.usuario?.rol === 'admin', '/me devuelve rol admin');

console.log('Smoke test finalizado.');
process.exit(process.exitCode || 0);
