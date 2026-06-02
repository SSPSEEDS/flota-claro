// CLI: npm run migrate   (crea el esquema y, opcionalmente, un admin)
// Uso opcional: npm run migrate -- --admin <usuario> <contrasena>
import { migrar } from '../db/db.js';
import { crearUsuario, contarUsuarios } from '../auth/users.js';
import { getPool } from '../db/pool.js';
import { log, error } from '../lib/log.js';

try {
  await migrar();
  log('Esquema creado/actualizado.');

  const i = process.argv.indexOf('--admin');
  if (i !== -1) {
    const username = process.argv[i + 1];
    const password = process.argv[i + 2];
    if (!username || !password) throw new Error('Uso: npm run migrate -- --admin <usuario> <contrasena>');
    await crearUsuario({ username, password, nombre: 'Administrador', rol: 'admin' });
    log(`Admin creado/actualizado: ${username}`);
  } else if (await contarUsuarios() === 0) {
    log('Aun no hay usuarios. Crea el admin con: npm run migrate -- --admin <usuario> <contrasena>');
  }
} catch (e) {
  error(e.message);
  process.exitCode = 1;
} finally {
  await getPool().end();
}
