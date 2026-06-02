# Flota Claro – Southern Seeds Production SA

## Proyecto
Automatización de gestión de facturación Claro (AMX Argentina SA) para la flota de 38 líneas móviles corporativas. Reemplaza la carga manual en Excel.

## Empresa
- **Razón social**: Southern Seeds Production SA
- **CUIT**: 30-70802666-9
- **Cuenta Claro**: 2/0120501457 | Cliente: 2180173
- **Dirección**: Dr Mariano Moreno 46, B2740BVB – Arrecifes, Buenos Aires
- **Total líneas activas**: 38

## Stack
- Runtime: Node.js
- Framework web: (a definir – Express o similar)
- Base de datos: SQLite (local) o PostgreSQL
- Parser PDF: `pdf-parse` o `pdfjs-dist`
- Frontend: HTML/JS vanilla o React (a definir)
- Exportación: `csv-writer` o similar

## Comandos frecuentes
- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción
- `npm run import <archivo.pdf>` — parsear e importar factura PDF
- `npm run export <YYYY-MM>` — exportar mes a CSV
- `npm test` — correr tests

## Estructura de carpetas
```
/
├── CLAUDE.md
├── src/
│   ├── parser/       ← lógica de extracción del PDF
│   ├── db/           ← modelos y migraciones
│   ├── routes/       ← endpoints API
│   └── frontend/     ← interfaz web
├── data/
│   ├── facturas/     ← PDFs originales guardados
│   └── exports/      ← CSVs exportados
├── docs/
│   ├── estructura-datos.md
│   ├── planes.md
│   └── tareas.md     ← checkboxes de progreso
└── tests/
```

## Estructura de datos — tabla `lineas`
Extraída de la sección "DETALLE DE ITEMS POR LINEA" del PDF:

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | int PK | autoincremento |
| `periodo` | string | ej: `2026-04` |
| `factura` | string | ej: `1331-02276863` |
| `linea` | string | número de línea (10 dígitos) |
| `usuario` | string | nombre del titular |
| `plan` | string | código ej: `CC10R` |
| `abono` | decimal | valor plan sin IVA |
| `bonificaciones` | decimal | descuento (negativo) |
| `datos` | decimal | excedente datos |
| `otros` | decimal | otros cargos variables |
| `total` | decimal | total sin IVA sin cuotas equipo |
| `importado_en` | datetime | timestamp de importación |

## Planes activos (abonos sin IVA, abril 2026)
- CC10R → $26.060 (2 GB)
- CC11R → $34.550 (4 GB)
- CC12R → $47.080 (7 GB)
- CC13R → $67.820 (10 GB Control)
- CC13C → $67.820 (10 GB Libre)
- CC14C → $88.590 (20 GB Libre)
- CC14R → $88.590 (20 GB Control)
- PC91R → $30.600 (2 GB alt)

> Claro informó aumento de hasta 4,5% para la próxima factura en todos los planes.

## Lógica de parseo del PDF
La sección relevante está en las últimas hojas, bajo el título **"DETALLE DE ITEMS POR LINEA"**.

- El bloque de datos empieza luego del header de columnas
- Termina con la fila `TOTAL LINEAS`
- Cada fila tiene: número de línea (10 dígitos), nombre usuario, código de plan, valor plan, bonificaciones, excedentes, total
- Los valores usan formato argentino: punto como separador de miles, coma para decimales → normalizar antes de parsear
- Los valores NO incluyen IVA
- Las cuotas de equipos están en una sección separada y NO forman parte del total por línea

## Reglas de negocio
- `total = abono + bonificaciones + datos + otros` (todos sin IVA)
- Las bonificaciones son siempre negativas (descuentos del 50% o 60% × 12 meses)
- Un mes puede tener múltiples importaciones; la última reemplaza a la anterior para ese período
- Al importar, guardar el PDF original en `data/facturas/YYYY-MM-factura.pdf`
- El IVA es 21% o 27% según el servicio; se aplica al total al exportar si se solicita

## Convenciones de código
- Español para nombres de variables de negocio (`periodo`, `lineas`, `bonificaciones`)
- Inglés para infraestructura y nombres de funciones (`parseInvoice`, `exportToCSV`)
- Manejo de errores explícito; no silenciar excepciones
- Logs con timestamp en cada importación

## Referencias
- Documentación Claude Code: https://docs.claude.com/en/docs/claude-code/overview
- Factura de ejemplo: `data/facturas/2026-04-factura.pdf`
- Tareas pendientes: `docs/tareas.md`
