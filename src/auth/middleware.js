// Middleware de autenticacion y autorizacion por rol.
// Roles: admin (todo), editor (carga + consulta), viewer (solo consulta).

/** Devuelve el usuario de la sesion o null. */
export function usuarioActual(req) {
  return req.session?.user ?? null;
}

/** Exige sesion iniciada. */
export function requireAuth(req, res, next) {
  if (!usuarioActual(req)) return res.status(401).json({ error: 'No autenticado.' });
  next();
}

/** Exige que el rol del usuario este entre los permitidos. */
export function requireRole(...roles) {
  return (req, res, next) => {
    const u = usuarioActual(req);
    if (!u) return res.status(401).json({ error: 'No autenticado.' });
    if (!roles.includes(u.rol)) return res.status(403).json({ error: 'No tenes permisos para esta accion.' });
    next();
  };
}

// Atajos semanticos.
export const puedeEditar = requireRole('admin', 'editor'); // cargar facturas, migrar
export const esAdmin = requireRole('admin');               // gestionar usuarios
