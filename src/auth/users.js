// Gestion de usuarios y verificacion de credenciales.
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';

export const ROLES = ['admin', 'editor', 'viewer'];

/** Crea (o actualiza la clave/rol de) un usuario. Devuelve el usuario sin el hash. */
export async function crearUsuario({ username, password, nombre = null, rol = 'viewer' }) {
  if (!username || !password) throw new Error('username y password son obligatorios.');
  if (!ROLES.includes(rol)) throw new Error(`Rol invalido: ${rol}`);
  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await query(`
    INSERT INTO usuarios (username, nombre, password_hash, rol)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (username) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      password_hash = EXCLUDED.password_hash,
      rol = EXCLUDED.rol
    RETURNING id, username, nombre, rol, creado_en
  `, [username.trim().toLowerCase(), nombre, hash, rol]);
  return rows[0];
}

/** Verifica usuario/clave. Devuelve el usuario (sin hash) o null. */
export async function verificarCredenciales(username, password) {
  if (!username || !password) return null;
  const { rows } = await query('SELECT * FROM usuarios WHERE username = $1', [username.trim().toLowerCase()]);
  const u = rows[0];
  if (!u) return null;
  if (!bcrypt.compareSync(password, u.password_hash)) return null;
  return { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol };
}

/** Lista usuarios (sin hash). */
export async function listarUsuarios() {
  const { rows } = await query('SELECT id, username, nombre, rol, creado_en FROM usuarios ORDER BY username');
  return rows;
}

/** Elimina un usuario por id. Evita borrar el ultimo admin. */
export async function eliminarUsuario(id) {
  const { rows: admins } = await query(`SELECT id FROM usuarios WHERE rol = 'admin'`);
  const { rows: target } = await query('SELECT rol FROM usuarios WHERE id = $1', [id]);
  if (target[0]?.rol === 'admin' && admins.length <= 1) {
    throw new Error('No se puede eliminar el unico administrador.');
  }
  await query('DELETE FROM usuarios WHERE id = $1', [id]);
}

/** Cantidad de usuarios existentes (para el bootstrap del admin inicial). */
export async function contarUsuarios() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM usuarios');
  return rows[0].n;
}
