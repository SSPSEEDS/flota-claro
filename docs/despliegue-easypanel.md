# Guía de despliegue en EasyPanel (Hostinger VPS)

Esta guía está pensada para hacerla **sin perfil técnico**, paso a paso. Resultado: la app
corriendo en tu VPS, con base de datos PostgreSQL y copias de seguridad, accesible por un link
con HTTPS, y con usuarios (compañero = carga, jefe = consulta, vos = admin).

---

## Parte 1 — Subir el código a GitHub

1. Creá una cuenta gratis en https://github.com (si no tenés).
2. Creá un repositorio nuevo, por ejemplo `flota-claro` (puede ser **privado**).
3. Subí el contenido de la carpeta del proyecto. La forma más simple:
   - Instalá **GitHub Desktop** (https://desktop.github.com), iniciá sesión.
   - "Add local repository" → elegí la carpeta `CLARO`.
   - Te va a ofrecer crear el repo y publicarlo: aceptá. Listo.
   - (Importante: el archivo `.gitignore` ya evita subir claves, la base local y el Excel.)

> El Excel histórico y los PDFs **no** se suben al repo: se cargan después desde la app.

---

## Parte 2 — Crear la base de datos en EasyPanel

1. Entrá a tu EasyPanel.
2. Abrí (o creá) un **Proyecto**, por ejemplo `flota`.
3. Dentro del proyecto: **+ Service → Postgres**.
4. Poné un nombre, por ejemplo `flota-db`. Definí una contraseña (anotala).
5. Crealo. EasyPanel te muestra los datos de conexión. Vas a necesitar la **URL de conexión
   interna**, con esta forma:
   ```
   postgres://USUARIO:CONTRASEÑA@flota-db:5432/NOMBRE_BASE
   ```
   (El host `flota-db` es el nombre del servicio; al estar en el mismo proyecto se conectan por red
   interna, sin exponer la base a internet.)

---

## Parte 3 — Crear la App en EasyPanel

1. En el mismo proyecto: **+ Service → App**.
2. Nombre: `flota-app`.
3. En **Source** elegí **GitHub** y seleccioná tu repositorio `flota-claro` (rama `main`).
4. En **Build** elegí **Dockerfile** (el proyecto ya incluye uno).
5. En **Environment** (Variables de entorno) pegá lo siguiente (ajustando valores):
   ```
   DATABASE_URL=postgres://USUARIO:CONTRASEÑA@flota-db:5432/NOMBRE_BASE
   SESSION_SECRET=una-cadena-larga-y-aleatoria-cualquiera
   ADMIN_USER=admin
   ADMIN_PASSWORD=poné-una-clave-segura
   NODE_ENV=production
   PORT=3000
   ```
   - `DATABASE_URL`: la de la Parte 2.
   - `SESSION_SECRET`: inventá una cadena larga (40+ caracteres al azar).
   - `ADMIN_USER` / `ADMIN_PASSWORD`: el primer usuario administrador (sos vos). Se crea solo la
     primera vez que arranca.
6. En **Network / Domains**: activá un dominio.
   - Para empezar, usá el **subdominio automático** que ofrece EasyPanel (trae HTTPS solo).
   - El puerto interno es **3000**.
7. Guardá y hacé **Deploy**. EasyPanel construye la imagen y levanta la app.

Cuando termine, abrí el link del dominio: te lleva a la pantalla de **ingreso**. Entrá con
`ADMIN_USER` / `ADMIN_PASSWORD`.

---

## Parte 4 — Cargar usuarios y datos

1. Ya dentro como admin, arriba a la derecha → **Usuarios**:
   - Creá al **compañero** con rol **Carga** (editor).
   - Creá al **jefe** con rol **Consulta** (viewer).
2. **Migrar el histórico (una sola vez)**: en "Importar factura PDF" → desplegá
   *"Migrar el Excel histórico"* y subí `LINEAS CLARO DEFINITIVA - Lucio.xlsx`.
3. **Importar la factura del mes**: arrastrá el PDF de Claro a la zona de importación.

Desde ahí, el compañero entra con su usuario, importa el PDF de cada mes, filtra y exporta el Excel
para pasarle al jefe. El jefe puede entrar a consultar online cuando quiera.

---

## Parte 5 — Copias de seguridad (que los datos no se pierdan)

Como **todo** (líneas, históricos y los PDF originales) vive en PostgreSQL, basta con respaldar la
base:

1. En el servicio **Postgres** de EasyPanel → pestaña **Backups**.
2. Activá backups automáticos (por ejemplo, diarios) y, si podés, configurá un destino externo
   (S3 / almacenamiento remoto) para que las copias no estén solo en el mismo VPS.
3. Verificá una vez que se genere un backup y que se pueda **restaurar**.

> Recomendación: además del backup automático, una vez al mes exportá el Excel completo
> (filtro vacío → "Exportar Excel") y guardalo en OneDrive como respaldo extra fuera del servidor.

---

## Actualizar la app más adelante

Cada vez que haya una mejora en el código: subís los cambios a GitHub (en GitHub Desktop:
"Commit" + "Push") y en EasyPanel apretás **Deploy** (o queda automático si activaste auto-deploy).
La base de datos **no se toca** al actualizar la app.

## Si algún día querés que abra al instante (sin “despertar”)

Al estar en tu propio VPS, la app ya está siempre encendida (no “duerme” como los planes gratuitos
de otros servicios). No hay nada extra que hacer.
