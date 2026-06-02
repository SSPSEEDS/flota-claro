# Flota Claro — Southern Seeds Production SA

App web para gestionar la facturación Claro (AMX Argentina SA) de las 38 líneas móviles
corporativas. Reemplaza la carga manual en Excel: importa el PDF de la factura, conserva todo el
histórico en una base de datos segura y permite filtrar y exportar. Pensada para correr **en la nube
(VPS con EasyPanel)** con login y roles.

## Cómo se usa

1. Entrás al link de la app y ponés tu **usuario y contraseña**.
2. **Compañero (rol Carga)**: arrastra el PDF de Claro y se importa solo (verifica que los totales
   cuadren). Filtra por mes/usuario/plan y exporta el Excel para pasarle al jefe.
3. **Jefe (rol Consulta)**: entra a ver y exportar; no puede modificar datos.
4. **Vos (rol Admin)**: además gestionás usuarios.

Vista **Tabla detallada** (con desglose) y vista **Por mes (pivote)** que replica la planilla de
siempre (línea × mes). Exporta a CSV o Excel, con opción "con IVA 21%".

## Desplegar

Guía paso a paso (no técnica) en **[docs/despliegue-easypanel.md](docs/despliegue-easypanel.md)**:
GitHub → EasyPanel (Postgres + App) → variables de entorno → dominio → backups.

## Arquitectura

- **Backend**: Node + Express. Base **PostgreSQL** (driver `pg`).
- **Login**: usuarios propios (usuario/contraseña), contraseñas con `bcrypt`, sesión en cookie
  firmada (`cookie-session`). Roles: `admin`, `editor` (carga), `viewer` (consulta).
- **Parser PDF**: `pdf-parse` + reglas en [src/parser/parseInvoice.js](src/parser/parseInvoice.js).
  Lee "DETALLE DE ITEMS POR LINEA", normaliza el formato argentino y valida la suma contra
  `TOTAL LINEAS`.
- **Importador Excel**: [src/parser/importExcel.js](src/parser/importExcel.js) convierte el formato
  ancho (una columna por mes) a filas largas.
- **Durabilidad**: líneas, históricos y los **PDF originales** (en base64) viven en Postgres → entran
  en el backup. Ver [docs/estructura-datos.md](docs/estructura-datos.md).

## Variables de entorno

Ver [.env.example](.env.example). Claves: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USER`,
`ADMIN_PASSWORD`, `NODE_ENV`, `PORT`.

## Comandos (soporte técnico)

Requieren `DATABASE_URL` apuntando a un Postgres accesible.

- `npm start` — levanta el servidor (migra el esquema y crea el admin inicial si corresponde).
- `npm run migrate` — crea/actualiza el esquema. `npm run migrate -- --admin <user> <pass>` crea admin.
- `npm run import <archivo.pdf>` — importa una factura por línea de comandos.
- `npm run import-excel <archivo.xlsx>` — migra el Excel histórico.
- `npm run export <YYYY-MM|todo> [--iva] [--xlsx]` — exporta a CSV/Excel.
- `npm test` — tests del parser e integración (PostgreSQL en memoria con pg-mem).
- `node tests/smoke-server.mjs` — smoke test del servidor (login + roles).

## Datos de la cuenta

- Razón social: Southern Seeds Production SA — CUIT 30-70802666-9
- Cuenta Claro: 2/0120501457 — Cliente 2180173 — 38 líneas activas
