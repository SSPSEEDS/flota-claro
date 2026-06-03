// Frontend de la Flota Claro (JS vanilla).
const $ = (sel) => document.querySelector(sel);
// Montos con 2 decimales, formato argentino ($1.234,56).
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v) => (v === null || v === undefined || v === '' ? '' : fmt.format(v));

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// "2026-04" -> "Abr 2026"
function mesLabel(p) {
  const [a, m] = String(p).split('-');
  const mm = MESES[Number(m) - 1] || m;
  return `${mm.charAt(0).toUpperCase()}${mm.slice(1)} ${a}`;
}

let vista = 'tabla';   // 'tabla' | 'pivote'
let PLANES = {};       // catalogo codigo -> { gb, nombre } (se carga al iniciar)
let TC = {};           // tipo de cambio por periodo: { periodo: { tc, fuente } }
let puedeEditarRol = false;
let periodosSel = [];  // meses seleccionados (vacio = todos)
let periodosDisp = []; // todos los periodos disponibles

// "CC10R" -> "CC10R (2 GB)". Si no se reconoce el codigo, lo deja igual.
function etiquetaPlan(plan) {
  if (!plan) return '';
  const info = PLANES[String(plan).trim().toUpperCase()];
  return info ? `${plan} (${info.gb} GB)` : plan;
}
// Porcentaje con 2 decimales y coma decimal: 0.0557 -> "+5,57%".
const pct = (v) => (v === null || v === undefined ? '' : (v >= 0 ? '+' : '') + (v * 100).toFixed(2).replace('.', ',') + '%');

// --- Filtros y carga ---
function filtrosActuales() {
  const f = {};
  if (periodosSel.length) f.periodo = periodosSel.join(',');
  const linea = $('#fLinea').value;
  const plan = $('#fPlan').value;
  const origen = $('#fOrigen').value;
  const buscar = $('#fBuscar').value.trim();
  if (linea) f.linea = linea;
  if (plan) f.plan = plan;
  if (origen) f.origen = origen;
  if (buscar) f.usuario = buscar;
  return f;
}

function queryString(f) {
  return new URLSearchParams(f).toString();
}

async function cargarFiltros() {
  const r = await fetch('/api/filtros').then(x => x.json());
  periodosDisp = r.periodos;
  construirMesesMulti();
  const selL = $('#fLinea');
  selL.innerHTML = '<option value="">Todas</option>' +
    r.lineas.map(l => `<option value="${l.linea}">${(l.usuario || '(sin nombre)')} — ${l.linea}</option>`).join('');
  const selPlan = $('#fPlan');
  selPlan.innerHTML = '<option value="">Todos</option>' +
    r.planes.map(p => `<option value="${p}">${etiquetaPlan(p)}</option>`).join('');
}

// --- Multi-selector de meses (varios a la vez) ---
function construirMesesMulti() {
  const pop = $('#msPeriodoPop');
  // Saca de la seleccion los periodos que ya no existen.
  periodosSel = periodosSel.filter(p => periodosDisp.includes(p));
  pop.innerHTML = periodosDisp.length
    ? periodosDisp.map(p =>
        `<label class="ms-item"><input type="checkbox" value="${p}" ${periodosSel.includes(p) ? 'checked' : ''}/> ${mesLabel(p)}</label>`
      ).join('')
    : '<div class="ms-vacio">Sin meses cargados</div>';
  pop.querySelectorAll('input[type=checkbox]').forEach(chk =>
    chk.addEventListener('change', () => {
      if (chk.checked) periodosSel.push(chk.value);
      else periodosSel = periodosSel.filter(v => v !== chk.value);
      actualizarMesesBtn();
      cargarDatos();
    }));
  actualizarMesesBtn();
}

function actualizarMesesBtn() {
  const btn = $('#msPeriodoBtn');
  if (!periodosSel.length) btn.textContent = 'Todos los meses';
  else if (periodosSel.length === 1) btn.textContent = mesLabel(periodosSel[0]);
  else btn.textContent = `${periodosSel.length} meses elegidos`;
  btn.classList.toggle('activo', periodosSel.length > 0);
}

async function cargarDatos() {
  const f = filtrosActuales();
  const lineas = await fetch('/api/lineas?' + queryString(f)).then(x => x.json());
  actualizarExport(f);
  renderAlertas(lineas);
  if (vista === 'tabla') renderTabla(lineas);
  else await renderPivote(lineas);
  montarScrollSuperior();
}

// --- Aumentos destacados (consumos fuera de lo normal) ---
// Una línea se destaca cuando su total del último mes disponible supera al del
// mes anterior por encima de los dos umbrales (porcentaje Y monto absoluto), así
// evitamos marcar saltos chicos o variaciones porcentuales sobre montos bajos.
const ALERTA_UMBRAL_PCT = 0.20;   // +20% respecto al mes anterior
const ALERTA_UMBRAL_ABS = 3000;   // y al menos $3.000 más (sin IVA)

function detectarAumentos(lineas) {
  const porLinea = new Map();
  for (const l of lineas) {
    if (typeof l.total !== 'number') continue;
    if (!porLinea.has(l.linea)) porLinea.set(l.linea, { usuario: l.usuario, totales: {} });
    const e = porLinea.get(l.linea);
    e.totales[l.periodo] = l.total;
    if (l.usuario) e.usuario = l.usuario;
  }
  const aumentos = [];
  for (const [linea, e] of porLinea) {
    const periodos = Object.keys(e.totales).sort(); // viejo -> nuevo
    if (periodos.length < 2) continue;              // sin mes previo no hay con qué comparar
    const actual = periodos[periodos.length - 1];
    const anterior = periodos[periodos.length - 2];
    const totalAct = e.totales[actual];
    const totalAnt = e.totales[anterior];
    if (!totalAnt || totalAnt <= 0) continue;
    const dif = totalAct - totalAnt;
    const pctDif = dif / totalAnt;
    if (dif >= ALERTA_UMBRAL_ABS && pctDif >= ALERTA_UMBRAL_PCT) {
      aumentos.push({ linea, usuario: e.usuario, actual, anterior, dif, pctDif });
    }
  }
  return aumentos.sort((a, b) => b.dif - a.dif); // mayor salto primero
}

function renderAlertas(lineas) {
  const card = $('#alertas');
  const aumentos = detectarAumentos(lineas);
  if (!aumentos.length) { card.hidden = true; return; }
  card.hidden = false;
  $('#alertasLista').innerHTML = aumentos.map(a =>
    `<div class="alerta-item">
       <div class="alerta-quien">
         <span class="alerta-usuario">${a.usuario || '(sin nombre)'}</span>
         <span class="alerta-linea">Línea ${a.linea}</span>
       </div>
       <div class="alerta-detalle">
         <span class="alerta-extra">+${money(a.dif)}</span>
         <span class="alerta-pct">${pct(a.pctDif)}</span>
         <span class="alerta-meses">${mesLabel(a.actual)} vs ${mesLabel(a.anterior)}</span>
       </div>
     </div>`).join('');
}

// Barra de scroll horizontal arriba de la tabla (sincronizada con la de abajo),
// para correr de costado sin tener que bajar al final de la planilla.
function montarScrollSuperior() {
  const wrap = $('#tablaWrap');
  const bar = $('#scrollTop');
  const tabla = wrap.querySelector('table');
  if (!tabla) { bar.hidden = true; return; }
  requestAnimationFrame(() => {
    const ancho = tabla.scrollWidth;
    if (ancho <= wrap.clientWidth + 1) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.firstElementChild.style.width = ancho + 'px';
    bar.scrollLeft = wrap.scrollLeft;
    bar.onscroll = () => { wrap.scrollLeft = bar.scrollLeft; };
    wrap.onscroll = () => { bar.scrollLeft = wrap.scrollLeft; };
  });
}

function actualizarExport(f) {
  const conIva = $('#chkIva').checked ? '&iva=1' : '';
  $('#btnCsv').href = '/api/export?formato=csv&' + queryString(f) + conIva;
  $('#btnXlsx').href = '/api/export?formato=xlsx&' + queryString(f) + conIva;
}

// Pinta el bloque de resumen (cifras destacadas) arriba de la tabla.
function pintarResumen({ registros, total, extra = '', usd = null }) {
  const cards = [
    `<div class="stat"><span class="stat-lbl">Registros</span><span class="stat-val">${registros}</span></div>`,
    `<div class="stat stat-total"><span class="stat-lbl">Total sin IVA</span><span class="stat-val">${money(total)}</span></div>`,
  ];
  if (usd !== null) cards.push(`<div class="stat"><span class="stat-lbl">Total USD</span><span class="stat-val">${dolar(usd)}</span></div>`);
  $('#resumen').innerHTML = `<div class="stats">${cards.join('')}</div>${extra ? `<div class="resumen-extra">${extra}</div>` : ''}`;
}

const dolar = (v) => (v === null || v === undefined ? '' : 'US$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// --- Vista tabla detallada ---
function renderTabla(lineas) {
  if (!lineas.length) { mostrarVacio(); return; }
  const cols = [
    ['periodo', 'Mes', 'txt'], ['linea', 'Línea', 'txt'], ['usuario', 'Usuario', 'txt'],
    ['plan', 'Plan', 'txt'], ['abono', 'Abono'], ['bonificaciones', 'Bonif.'],
    ['datos', 'Datos'], ['otros', 'Otros'], ['total', 'Total s/IVA'], ['origen', 'Origen', 'txt'],
  ];
  let total = 0;
  const filas = lineas.map(l => {
    total += l.total || 0;
    return '<tr>' + cols.map(([campo, , cls]) => {
      let v = campo === 'plan' ? etiquetaPlan(l[campo]) : l[campo];
      if (campo === 'periodo') v = mesLabel(l[campo]);
      if (campo === 'origen') return `<td class="txt"><span class="badge ${l[campo]}">${l[campo]}</span></td>`;
      if (cls === 'txt') return `<td class="txt">${v ?? ''}</td>`;
      const neg = typeof v === 'number' && v < 0 ? ' neg' : '';
      return `<td class="${neg}">${money(v)}</td>`;
    }).join('') + '</tr>';
  }).join('');

  const totalRow = `<tr class="total-row"><td class="txt" colspan="8">TOTAL (${lineas.length} líneas)</td><td>${money(total)}</td><td></td></tr>`;
  pintarResumen({ registros: lineas.length, total });
  $('#tablaWrap').innerHTML =
    `<table><thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>` +
    `<tbody>${filas}${totalRow}</tbody></table>`;
}

// --- Vista por mes (línea x mes), como el Excel original ---
// Filas superiores tipo planilla: TOTAL, TC (dólar), TOTAL USD y DIF MES ANTERIOR.
async function renderPivote(lineas) {
  if (!lineas.length) { mostrarVacio(); return; }
  TC = await fetch('/api/tc').then(x => x.json()).catch(() => ({}));

  const periodos = [...new Set(lineas.map(l => l.periodo))].sort().reverse(); // más reciente primero
  const porLinea = new Map();
  for (const l of lineas) {
    if (!porLinea.has(l.linea)) porLinea.set(l.linea, { usuario: l.usuario, datos: {} });
    const e = porLinea.get(l.linea);
    e.datos[l.periodo] = l.total;
    if (l.usuario) e.usuario = l.usuario;
  }

  // Total por mes (suma de todas las líneas).
  const totalMes = {};
  periodos.forEach(p => totalMes[p] = 0);
  const filasLineas = [...porLinea.entries()].map(([linea, e]) => {
    const celdas = periodos.map(p => {
      const v = e.datos[p];
      if (typeof v === 'number') totalMes[p] += v;
      return `<td>${money(v)}</td>`;
    }).join('');
    return `<tr><td class="txt">${e.usuario || ''}</td><td class="txt linea-col">${linea}</td>${celdas}</tr>`;
  }).join('');

  // Helpers de las filas resumen.
  const tcDe = (p) => (TC[p] ? Number(TC[p].tc) : null);
  const usdDe = (p) => { const t = tcDe(p); return t ? totalMes[p] / t : null; };

  const filaTotal = `<tr class="sum total-row"><td class="txt" colspan="2">TOTAL</td>` +
    periodos.map(p => `<td>${money(totalMes[p])}</td>`).join('') + '</tr>';

  const filaTc = `<tr class="sum tc-row"><td class="txt" colspan="2">TC (dólar)</td>` +
    periodos.map(p => {
      const val = TC[p] ? Number(TC[p].tc) : '';
      const fuente = TC[p]?.fuente === 'oficial' ? 'oficial' : (TC[p] ? 'manual' : '');
      return `<td class="tc-cell"><input type="number" step="0.01" min="0" data-periodo="${p}" ` +
        `value="${val}" title="${fuente}" ${puedeEditarRol ? '' : 'disabled'} placeholder="—" /></td>`;
    }).join('') + '</tr>';

  const filaUsd = `<tr class="sum usd-row"><td class="txt" colspan="2">TOTAL USD</td>` +
    periodos.map(p => `<td>${dolar(usdDe(p))}</td>`).join('') + '</tr>';

  const filaDif = `<tr class="sum dif-row"><td class="txt" colspan="2">DIF MES ANTERIOR</td>` +
    periodos.map((p, i) => {
      const ant = periodos[i + 1]; // el mes anterior (más viejo) está a la derecha
      if (!ant || !totalMes[ant]) return '<td></td>';
      const dif = (totalMes[p] - totalMes[ant]) / totalMes[ant];
      const cls = dif > 0 ? 'dif-up' : (dif < 0 ? 'dif-down' : '');
      return `<td class="${cls}">${pct(dif)}</td>`;
    }).join('') + '</tr>';

  const btnAuto = puedeEditarRol
    ? `<button id="btnTcAuto" class="link">Completar TC faltantes (dólar oficial)</button>`
    : '';
  const totalGeneral = periodos.reduce((s, p) => s + totalMes[p], 0);
  pintarResumen({
    registros: `${porLinea.size} × ${periodos.length} meses`,
    total: totalGeneral,
    extra: btnAuto,
  });
  $('#tablaWrap').innerHTML =
    `<table class="pivote"><thead><tr><th>Usuario</th><th>Línea</th>${periodos.map(p => `<th>${mesLabel(p)}</th>`).join('')}</tr></thead>` +
    `<tbody>${filaTotal}${filaTc}${filaUsd}${filaDif}${filasLineas}</tbody></table>`;

  // Eventos de edición del TC (solo editores).
  if (puedeEditarRol) {
    $('#tablaWrap').querySelectorAll('.tc-cell input').forEach(inp =>
      inp.addEventListener('change', () => guardarTc(inp.dataset.periodo, inp.value)));
    const ba = $('#btnTcAuto');
    if (ba) ba.addEventListener('click', () => completarTcAuto(periodos));
  }
}

// Guarda el TC de un mes (edición manual) y refresca la vista.
async function guardarTc(periodo, valor) {
  const tc = Number(valor);
  if (!tc || tc <= 0) return;
  const r = await fetch('/api/tc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodo, tc }),
  }).then(x => x.json());
  if (!r.error) cargarDatos();
}

// Pide al servidor el dólar oficial para los meses sin TC y refresca.
async function completarTcAuto(periodos) {
  const btn = $('#btnTcAuto');
  if (btn) { btn.disabled = true; btn.textContent = 'Buscando dólar oficial…'; }
  const r = await fetch('/api/tc/auto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodos }),
  }).then(x => x.json()).catch(() => ({ error: 'No se pudo conectar.' }));
  if (r.errores?.length) alert('Algunos meses no se pudieron completar:\n' + r.errores.map(e => `${e.periodo}: ${e.error}`).join('\n'));
  cargarDatos();
}

function mostrarVacio() {
  $('#resumen').innerHTML = '';
  $('#tablaWrap').innerHTML = '<div class="vacio">No hay datos para los filtros elegidos.</div>';
}

// --- Importacion PDF ---
async function subirPdf(file) {
  if (!file) return;
  const msg = $('#importMsg');
  msg.className = 'msg load';
  msg.textContent = `Procesando ${file.name}…`;
  const fd = new FormData();
  fd.append('pdf', file);
  try {
    const r = await fetch('/api/import', { method: 'POST', body: fd }).then(x => x.json());
    if (r.error) throw new Error(r.error);
    msg.className = 'msg ok';
    msg.textContent = `Factura ${r.factura} importada — período ${r.periodo}, ${r.cantidad} líneas` +
      (r.cuadra ? ' ✓ (totales verificados).' : ' ⚠ los totales no coinciden, revisar.');
    await cargarFiltros();
    periodosSel = [r.periodo];
    construirMesesMulti();
    await cargarDatos();
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = 'Error al importar: ' + e.message;
  }
}

// --- Sesion y roles ---
let usuario = null;

async function cargarSesion() {
  const r = await fetch('/api/auth/me').then(x => x.json());
  usuario = r.usuario;
  if (!usuario) { window.location.href = '/login.html'; return false; }
  const rolTxt = { admin: 'Administrador', editor: 'Carga', viewer: 'Consulta' }[usuario.rol] || usuario.rol;
  $('#userInfo').textContent = `${usuario.nombre || usuario.username} · ${rolTxt}`;
  puedeEditarRol = usuario.rol === 'admin' || usuario.rol === 'editor';
  $('#importar').hidden = !puedeEditarRol;
  $('#btnUsuarios').hidden = usuario.rol !== 'admin';
  return true;
}

async function salir() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// --- Migracion Excel ---
async function subirExcel(file) {
  if (!file) return;
  const msg = $('#excelMsg');
  msg.className = 'msg load';
  msg.textContent = `Migrando ${file.name}…`;
  const fd = new FormData();
  fd.append('excel', file);
  try {
    const r = await fetch('/api/import-excel', { method: 'POST', body: fd }).then(x => x.json());
    if (r.error) throw new Error(r.error);
    msg.className = 'msg ok';
    msg.textContent = `Histórico migrado: ${r.total} registros en ${r.periodos.length} meses.`;
    await cargarFiltros(); await cargarDatos();
  } catch (e) { msg.className = 'msg err'; msg.textContent = 'Error: ' + e.message; }
}

// --- Gestion de usuarios (admin) ---
async function abrirUsuarios() {
  const p = $('#panelUsuarios');
  p.hidden = !p.hidden;
  if (!p.hidden) await listarUsuarios();
}

async function listarUsuarios() {
  const us = await fetch('/api/auth/usuarios').then(x => x.json());
  if (us.error) { $('#listaUsuarios').textContent = us.error; return; }
  const rol = { admin: 'Administrador', editor: 'Carga', viewer: 'Consulta' };
  $('#listaUsuarios').innerHTML =
    '<table><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th></th></tr></thead><tbody>' +
    us.map(u => `<tr><td class="txt">${u.username}</td><td class="txt">${u.nombre || ''}</td>` +
      `<td class="txt">${rol[u.rol] || u.rol}</td>` +
      `<td class="txt"><button class="link" data-del="${u.id}">eliminar</button></td></tr>`).join('') +
    '</tbody></table>';
  $('#listaUsuarios').querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => eliminarUsuario(b.dataset.del)));
}

async function eliminarUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  const r = await fetch('/api/auth/usuarios/' + id, { method: 'DELETE' }).then(x => x.json());
  if (r.error) { $('#usuarioMsg').className = 'msg err'; $('#usuarioMsg').textContent = r.error; }
  else listarUsuarios();
}

async function crearUsuario(e) {
  e.preventDefault();
  const body = {
    username: $('#nuevoUser').value.trim(),
    nombre: $('#nuevoNombre').value.trim(),
    password: $('#nuevoPass').value,
    rol: $('#nuevoRol').value,
  };
  const msg = $('#usuarioMsg');
  const r = await fetch('/api/auth/usuarios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(x => x.json());
  if (r.error) { msg.className = 'msg err'; msg.textContent = r.error; }
  else {
    msg.className = 'msg ok'; msg.textContent = `Usuario ${r.usuario.username} guardado.`;
    $('#formUsuario').reset(); listarUsuarios();
  }
}

// --- Eventos ---
async function init() {
  if (!await cargarSesion()) return;
  PLANES = await fetch('/api/planes').then(x => x.json()).catch(() => ({}));

  $('#btnSalir').addEventListener('click', salir);
  $('#btnUsuarios').addEventListener('click', abrirUsuarios);
  $('#formUsuario').addEventListener('submit', crearUsuario);

  const dz = $('#dropzone');
  const input = $('#fileInput');
  if (dz) {
    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', () => subirPdf(input.files[0]));
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('hover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('hover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('hover');
      subirPdf(e.dataTransfer.files[0]);
    });
    $('#excelInput').addEventListener('change', (e) => subirExcel(e.target.files[0]));
  }

  // Multi-selector de meses: abrir/cerrar el panel.
  const msBtn = $('#msPeriodoBtn');
  const msPop = $('#msPeriodoPop');
  msBtn.addEventListener('click', (e) => { e.stopPropagation(); msPop.hidden = !msPop.hidden; });
  document.addEventListener('click', (e) => {
    if (!$('#msPeriodo').contains(e.target)) msPop.hidden = true;
  });

  ['#fLinea', '#fPlan', '#fOrigen'].forEach(s => $(s).addEventListener('change', cargarDatos));
  $('#fBuscar').addEventListener('input', debounce(cargarDatos, 300));
  $('#chkIva').addEventListener('change', () => actualizarExport(filtrosActuales()));
  $('#btnLimpiar').addEventListener('click', () => {
    periodosSel = [];
    construirMesesMulti();
    ['#fLinea', '#fPlan', '#fOrigen'].forEach(s => $(s).value = '');
    $('#fBuscar').value = '';
    cargarDatos();
  });
  $('#btnTabla').addEventListener('click', () => cambiarVista('tabla'));
  $('#btnPivote').addEventListener('click', () => cambiarVista('pivote'));

  cargarFiltros().then(cargarDatos);
}

function cambiarVista(v) {
  vista = v;
  $('#btnTabla').classList.toggle('activo', v === 'tabla');
  $('#btnPivote').classList.toggle('activo', v === 'pivote');
  cargarDatos();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

init();
