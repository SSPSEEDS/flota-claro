// Catalogo de planes activos (codigo Claro -> GB y nombre). Fuente: docs/planes.md / PDF abril 2026.
// Se usa para mostrar los GB al lado del codigo (ej: "CC10R (2 GB)").
export const PLANES = {
  CC10R: { gb: 2, nombre: 'Control 2 GB' },
  CC11R: { gb: 4, nombre: 'Control 4 GB' },
  CC12R: { gb: 7, nombre: 'Control 7 GB' },
  CC13R: { gb: 10, nombre: 'Control 10 GB' },
  CC13C: { gb: 10, nombre: 'Libre 10 GB' },
  CC14C: { gb: 20, nombre: 'Libre 20 GB' },
  CC14R: { gb: 20, nombre: 'Control 20 GB' },
  PC91R: { gb: 2, nombre: 'Control 2 GB (alt)' },
};

/**
 * Etiqueta de un plan mostrando los GB cuando el codigo es conocido.
 * "CC10R" -> "CC10R (2 GB)". Si no se reconoce (planes historicos en texto libre), devuelve igual.
 */
export function etiquetaPlan(plan) {
  if (!plan) return '';
  const cod = String(plan).trim().toUpperCase();
  const info = PLANES[cod];
  return info ? `${plan} (${info.gb} GB)` : plan;
}
