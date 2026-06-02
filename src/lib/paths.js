// Rutas del proyecto, independientes del directorio de ejecucion.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(__filename), '..', '..');

export const FRONTEND_DIR = path.join(ROOT, 'src', 'frontend');
export const EXPORTS_DIR = path.join(ROOT, 'data', 'exports'); // solo para exports por CLI

/** Crea la carpeta de exports local si no existe (uso CLI). */
export function asegurarExports() {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}
