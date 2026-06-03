# Estructura de datos

Base **PostgreSQL** (en EasyPanel). Esquema en [src/db/schema.js](../src/db/schema.js).

## Tabla `lineas`

Una fila por **(periodo, línea, origen)**. Es el modelo "largo" (cada mes de cada línea es una fila),
a diferencia del Excel que era "ancho" (una columna por mes).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PK | autoincremento |
| `periodo` | TEXT | `YYYY-MM` — mes de **consumo** (ver nota abajo) |
| `factura` | TEXT | nº factura (null en histórico Excel) |
| `linea` | TEXT | número de línea (10 dígitos) — clave de reconciliación |
| `usuario` | TEXT | titular según la fuente |
| `plan` | TEXT | código/plan según la fuente |
| `abono` | REAL | valor plan sin IVA (solo PDF) |
| `bonificaciones` | REAL | descuento, negativo (solo PDF) |
| `datos` | REAL | excedente de datos (solo PDF) |
| `otros` | REAL | otros cargos variables (solo PDF) |
| `total` | NUMERIC | total sin IVA |
| `origen` | TEXT | `pdf` \| `excel` |
| `importado_en` | TIMESTAMPTZ | fecha/hora de importación |
| `importado_por` | TEXT | usuario que importó |

Restricción `UNIQUE(periodo, linea, origen)`. Reimportar un mes (mismo origen) **reemplaza** las filas
de ese período (transacción: borra + inserta).

> **Período = mes de consumo, no el de la fecha de factura.** La factura se emite a comienzos del mes
> siguiente al consumo (ej.: fechada el 08/05, "Período Facturado desde 09/04 hasta 08/05" → corresponde
> a **abril**). Por eso el parser registra el período como el **mes anterior a la fecha de factura**, para
> que empalme con el histórico del Excel (que llega hasta `2026-03`).

### Mapeo desde el PDF (DETALLE DE ITEMS POR LINEA)

Las 10 columnas de valores en la factura, en orden:

```
0 Valor Plan → abono
1 Servicios Adicionales ┐
3 Llamadas Locales/Nac. │
4 Llamadas Internac.    ├─ suma → otros
5 Roaming               │
6 Mensajes              │
8 Otros Cargos          ┘
2 Bonificaciones → bonificaciones
7 Datos → datos
9 Total por Línea → total
```

Se cumple `total = abono + bonificaciones + datos + otros` (todos sin IVA).

### Migración desde el Excel

El Excel "SEGUIMIENTO DE PAGOS" solo tiene el **total por línea por mes**; por eso en las filas con
`origen='excel'` el desglose (`abono`/`bonificaciones`/`datos`/`otros`) queda en `null` y solo se
completa `total`.

## Tabla `facturas`

Cabecera por período: `factura`, `fecha`, `vencimiento`, `total_factura`, `total_a_pagar`,
`total_sin_iva`, `iva21`, `iva27`, `cuotas_equipos`. El **PDF original** se guarda en la columna
`pdf` (en **base64**, texto) junto con `pdf_nombre`, de modo que entra en el backup de la base y se
puede volver a descargar desde `/api/factura/:periodo/pdf`.

## Tabla `lineas_catalogo`

`linea` → `usuario_canonico`, `activa`. Permite un nombre unificado por línea para filtrar por persona
pese a las variantes de nombre entre Excel y PDF.

## Tabla `usuarios`

`username` (único), `nombre`, `password_hash` (bcrypt), `rol` (`admin` | `editor` | `viewer`).
El admin inicial se crea en el primer arranque desde `ADMIN_USER`/`ADMIN_PASSWORD`.
Roles: **admin** (todo + gestión de usuarios), **editor** (cargar/importar + consultar),
**viewer** (solo consultar y exportar).
