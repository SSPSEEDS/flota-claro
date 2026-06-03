# Tareas — progreso

## Hecho
- [x] Parser del PDF: detalle por línea + cabecera (factura, fechas, totales, IVA, cuotas)
- [x] Validación de la suma contra `TOTAL LINEAS` (38 líneas, cuadra exacto)
- [x] Importador del Excel histórico "SEGUIMIENTO DE PAGOS" (formato ancho → largo)
- [x] **Base de datos PostgreSQL** (driver `pg`), esquema con migración idempotente
- [x] **Login con roles**: admin / editor (carga) / viewer (consulta), `bcrypt` + `cookie-session`
- [x] PDFs originales guardados en la base (base64) → entran en el backup
- [x] API protegida: `/lineas`, `/filtros`, `/resumen`, `/factura/:periodo(/pdf)`, `/import`,
      `/import-excel`, `/export`, `/auth/*`
- [x] Frontend: login, UI según rol, importación PDF, migración Excel, filtros, tabla, pivote, export
- [x] **Dockerfile** + `.dockerignore` + `.env.example` para EasyPanel
- [x] Guía de despliegue paso a paso (GitHub + EasyPanel + backups)
- [x] Tests: parser, integración con pg-mem, smoke de servidor (login/roles)
- [x] Vista **por mes (pivote)** rediseñada como el Excel: filas TOTAL / TC / TOTAL USD /
      DIF MES ANTERIOR. El TC se autocompleta con el **dólar oficial** (ArgentinaDatos) del último
      día del mes y es editable a mano (tabla `tipo_cambio`, rutas `/api/tc`).
- [x] Columna **Plan** muestra los GB al lado del código (ej: `CC10R (2 GB)`), en tabla y export
- [x] Montos con **2 decimales** ($1.234,56); el % de DIF MES ANTERIOR con 2 decimales y coma (`+5,57%`)
- [x] Filtro de **Mes con selección múltiple** (comparar varios meses, ej: este mes + el anterior)
- [x] Botón de vista renombrado a **"Vista por mes"** (sin "pivote"); meses legibles (ej: `Abr 2026`)
- [x] **Rediseño visual**: cabecera con degradé, tarjetas con sombra, resumen con cifras destacadas
      (Registros / Total / Total USD), barra de acciones ordenada y tablas más claras

## Pendiente / ideas a futuro
- [ ] Desplegar en el VPS (lo hace el usuario/TI con la guía) y crear los usuarios reales
- [ ] Migrar el Excel histórico desde la app (una vez, en producción)
- [ ] Automatizar con **n8n** el envío mensual del Excel al jefe por mail
- [ ] Confirmar unificación de nombres por línea (catálogo `usuario_canonico`)
- [ ] Reglas de IVA por servicio (21% vs 27%) más finas al exportar
- [ ] Gráfico de evolución mensual por línea
- [ ] Registro de auditoría (quién cargó/cambió qué) si se necesita más adelante
