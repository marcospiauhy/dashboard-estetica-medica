/* =========================================================================
   PARTE 2 — Estado, formatação, componentes e helpers de gráfico
   ========================================================================= */

// ---------- formatação pt-BR ----------
const nf = (d = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fInt = v => isNum(v) ? nf(0).format(v) : '—';
const fDec = (v, d = 1) => isNum(v) ? nf(d).format(v) : '—';
function fCompact(v, d = 1) {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return nf(d).format(v / 1e9) + ' bi';
  if (a >= 1e6) return nf(d).format(v / 1e6) + ' mi';
  if (a >= 1e4) return nf(0).format(v / 1e3) + ' mil';
  return nf(0).format(v);
}
const fPct = (v, d = 1) => isNum(v) ? nf(d).format(v * 100) + '%' : '—';
const fPctS = (v, d = 1) => isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v) * 100) + '%' : '—';
const fUsdBi = v => isNum(v) ? 'US$ ' + nf(v < 1 ? 2 : 1).format(v) + ' bi' : '—';
const fUsdMi = v => isNum(v) ? 'US$ ' + nf(0).format(v) + ' mi' : '—';

// ---------- DOM ----------
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.setAttribute('style', v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const $ = s => document.querySelector(s);

// ---------- cores (tokens CSS) ----------
function T() {
  const s = getComputedStyle(document.documentElement);
  const g = n => s.getPropertyValue(n).trim();
  return { surface: g('--surface'), text1: g('--text-1'), text2: g('--text-2'), muted: g('--muted'), grid: g('--grid'), axis: g('--axis'),
    s1: g('--s1'), s2: g('--s2'), s3: g('--s3'), s4: g('--s4'), good: g('--good'), bad: g('--bad') };
}
// cor fixa por entidade (nunca por ranking)
const GEO_COLOR = { 'Mundo': 's1', 'EUA': 's2', 'Brasil': 's3' };
const TYPE_COLOR = { 'Cirúrgico': 's1', 'Não cirúrgico': 's2' };
const col = k => T()[k];
const alpha = (hex, a) => { const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return `rgba(${r},${g},${b},${a})`; };

// ---------- estado ----------
const S = {
  M: null, tab: 'overview', from: 2015, to: 2025, years: [],
  geos: new Set(['Mundo', 'EUA', 'Brasil']), tipos: new Set(['Cirúrgico', 'Não cirúrgico']), onlyRep: false,
  procAno: null, procEscopo: 'Mundo', procTipo: 'Todos',
  mktGeo: 'Global', mktGrupo: 'Produtos (injetáveis, aparelhos, implantes)', mktCons: null,
  empPais: null, fx: { EUR: 1.13, EUR_2022: 1.053, KRW: 1446 },
  potRate: null, fontesQ: ''
};
// valor respeitando o filtro "só reportados"
const g = o => (o && isNum(o.v) && !(S.onlyRep && o.d)) ? o.v : null;
const inRange = y => y >= S.from && y <= S.to;

// ---------- cards ----------
const charts = [];
function destroyCharts() { while (charts.length) { try { charts.pop().destroy(); } catch (e) {} } }

function card(parent, { title, q, span = 6, height = '', note = '', legend = null, table = true }) {
  const c = el('section', { class: `card span-${span}` });
  const tools = el('div', { class: 'tools' });
  c.append(el('div', { class: 'card-h' }, el('div', {}, el('h3', { text: title }), q ? el('div', { class: 'q', text: q }) : null), tools));
  const wrap = el('div', { class: 'chart-wrap ' + height });
  const canvas = el('canvas', { role: 'img', 'aria-label': title });
  wrap.append(canvas);
  const tv = el('div', { class: 'table-view', hidden: true });
  c.append(wrap, tv);
  if (legend) c.append(legendEl(legend));
  if (note) c.append(el('div', { class: 'note', text: note }));
  parent.append(c);
  const obj = { el: c, canvas, wrap, tv, tools, chart: null, tableFmt: null };
  if (table) {
    const b = el('button', { class: 'btn small', text: 'Tabela', title: 'Alternar entre gráfico e tabela', 'aria-pressed': 'false' });
    b.addEventListener('click', () => {
      const show = tv.hidden;
      tv.hidden = !show; wrap.hidden = show; b.setAttribute('aria-pressed', String(show)); b.textContent = show ? 'Gráfico' : 'Tabela';
      if (show) renderTableView(obj);
    });
    tools.append(b);
  }
  return obj;
}
function legendEl(items) {
  const L = el('div', { class: 'legend' });
  items.forEach(it => {
    const sw = el('i', { class: it.kind || '' });
    if (it.color) sw.style.background = it.color;
    L.append(el('span', {}, sw, it.label));
  });
  return L;
}
function plainCard(parent, { title, q, span = 6 }) {
  const c = el('section', { class: `card span-${span}` });
  c.append(el('div', { class: 'card-h' }, el('div', {}, el('h3', { text: title }), q ? el('div', { class: 'q', text: q }) : null)));
  parent.append(c);
  return c;
}
function kpi(parent, { label, value, delta = null, dir = 0, flag = '', hero = false, span = 3, sub = '' }) {
  const c = el('section', { class: `card span-${span} kpi` },
    el('div', { class: 'lbl', text: label }),
    el('div', { class: 'val' + (hero ? ' hero' : ''), text: value }),
    delta ? el('div', { class: 'delta ' + (dir > 0 ? 'up' : dir < 0 ? 'down' : ''), text: delta }) : null,
    sub ? el('div', { class: 'delta', text: sub }) : null,
    flag ? el('div', { class: 'flag', text: flag }) : null);
  parent.append(c);
  return c;
}

// tabela gêmea de cada gráfico (gerada a partir dos dados do próprio gráfico)
function renderTableView(obj) {
  const ch = obj.chart; obj.tv.textContent = '';
  if (!ch) return;
  const fmt = obj.tableFmt || (v => isNum(v) ? fDec(v, 2) : '—');
  const ds = ch.data.datasets.filter(d => !d._hideInTable);
  const t = el('table', { class: 'data' });
  const isXY = ds.some(d => d.data.some(p => p && typeof p === 'object' && !Array.isArray(p)));
  if (isXY) {
    t.append(el('thead', {}, el('tr', {}, el('th', { text: 'Série' }), el('th', { text: 'Item' }), el('th', { class: 'num', text: 'X' }), el('th', { class: 'num', text: 'Y' }))));
    const tb = el('tbody');
    ds.forEach(d => d.data.forEach(p => { if (!p) return;
      tb.append(el('tr', {}, el('td', { text: d.label || '' }), el('td', { text: p.label || p.y || '' }),
        el('td', { class: 'num', text: obj.tableFmtX ? obj.tableFmtX(p.x) : fmt(p.x) }), el('td', { class: 'num', text: typeof p.y === 'string' ? '' : fmt(p.y) })));
    }));
    t.append(tb);
  } else {
    t.append(el('thead', {}, el('tr', {}, el('th', { text: '' }), ...ds.map(d => el('th', { class: 'num', text: d.label || 'Valor' })))));
    const tb = el('tbody');
    (ch.data.labels || []).forEach((lab, i) => {
      tb.append(el('tr', {}, el('td', { text: Array.isArray(lab) ? lab.join(' ') : String(lab) }),
        ...ds.map(d => { const v = d.data[i]; const isD = d._derived && d._derived[i];
          const txtv = Array.isArray(v) ? `${fmt(v[0])} → ${fmt(v[1])}` : fmt(v);
          const td = el('td', { class: 'num', text: txtv }); if (isD && isNum(v)) td.append(' ', el('span', { class: 'tag d', text: 'derivado' })); return td; })));
    });
    t.append(tb);
  }
  obj.tv.append(t);
}

// ---------- defaults do Chart.js ----------
function applyChartDefaults() {
  const t = T();
  Chart.defaults.font.family = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.muted;
  Chart.defaults.borderColor = t.grid;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation.duration = 250; // não substituir o objeto: o Chart.js usa as chaves dele (type, easing…) nas animações
  Chart.defaults.plugins.legend.display = false;
  const tt = Chart.defaults.plugins.tooltip;
  tt.backgroundColor = t.surface; tt.titleColor = t.text2; tt.bodyColor = t.text1; tt.borderColor = t.axis; tt.borderWidth = 1;
  tt.padding = 10; tt.cornerRadius = 8; tt.boxWidth = 14; tt.boxHeight = 3; tt.usePointStyle = false; tt.bodyFont = { weight: '600' };
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.line.borderCapStyle = 'round';
  Chart.defaults.elements.line.borderJoinStyle = 'round';
  Chart.defaults.elements.point.radius = 4;
  Chart.defaults.elements.point.hoverRadius = 6;
  Chart.defaults.elements.point.borderWidth = 2;
  Chart.defaults.elements.point.hitRadius = 12;
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.elements.bar.borderSkipped = 'start';
  Chart.defaults.datasets.bar.maxBarThickness = 24;
  Chart.defaults.scale.grid.color = t.grid;
  Chart.defaults.scale.border = { color: t.axis };
  Chart.defaults.scale.ticks.color = t.muted;
}

// ---------- plugins próprios ----------
// linha vertical que acompanha o tooltip (crosshair)
const PD = { defaults: { on: false }, descriptors: { _scriptable: false, _indexable: false } };
const on = (ch, id) => { const o = ch.options.plugins[id]; return o && o.on === true ? o : null; };
const crosshair = { id: 'crosshair', ...PD, afterDatasetsDraw(ch) {
  if (!on(ch, 'crosshair')) return;
  const a = ch.tooltip && ch.tooltip.getActiveElements(); if (!a || !a.length) return;
  const x = a[0].element.x, { top, bottom } = ch.chartArea, ctx = ch.ctx;
  ctx.save(); ctx.strokeStyle = T().axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
} };
// marcos verticais (ex.: COVID, quebra de método)
const vmarks = { id: 'vmarks', ...PD, afterDraw(ch) {
  const o = on(ch, 'vmarks'); const marks = o && o.items; if (!marks || !marks.length) return;
  const xs = ch.scales.x; const { top, bottom } = ch.chartArea; const ctx = ch.ctx; const t = T();
  marks.forEach(m => {
    let x;
    if (xs.type === 'category') { const i = ch.data.labels.indexOf(m.x); if (i < 0) return; x = xs.getPixelForValue(i); if (m.between) x = (x + xs.getPixelForValue(i - 1)) / 2; }
    else { if (m.x < xs.min || m.x > xs.max) return; x = xs.getPixelForValue(m.x); }
    ctx.save(); ctx.strokeStyle = t.axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, top + 14); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.fillStyle = t.text2; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.text, x, top + 9); ctx.restore();
  });
} };
// rótulo no fim de cada linha (seletivo: pula se colidir)
const endLabels = { id: 'endLabels', ...PD, afterDatasetsDraw(ch) {
  const o = on(ch, 'endLabels'); if (!o) return;
  const ctx = ch.ctx, t = T(), used = [];
  ch.data.datasets.forEach((ds, i) => {
    if (ds._noEnd) return;
    const meta = ch.getDatasetMeta(i); if (meta.hidden) return;
    let k = ds.data.length - 1; while (k >= 0 && !isNum(typeof ds.data[k] === 'object' && ds.data[k] ? ds.data[k].y : ds.data[k])) k--;
    if (k < 0) return; const p = meta.data[k]; if (!p) return;
    const y = p.y; if (used.some(u => Math.abs(u - y) < 13)) return; used.push(y);
    const txtv = (o.fmt ? o.fmt(ds, k) : ds.label);
    ctx.save(); ctx.fillStyle = t.text2; ctx.font = '600 11.5px system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(txtv, p.x + 8, y); ctx.restore();
  });
} };
// valor na ponta das barras (gráfico de uma série)
const barLabels = { id: 'barLabels', ...PD, afterDatasetsDraw(ch) {
  const o = on(ch, 'barLabels'); if (!o) return;
  const ctx = ch.ctx, t = T(), horiz = ch.options.indexAxis === 'y';
  ch.data.datasets.forEach((ds, i) => {
    if (o.only !== undefined && o.only !== i) return;
    const meta = ch.getDatasetMeta(i); if (meta.hidden) return;
    meta.data.forEach((bar, k) => {
      const v = ds.data[k]; if (!isNum(v)) return;
      const s = o.fmt ? o.fmt(v, k, ds) : fDec(v); if (!s) return;
      ctx.save(); ctx.fillStyle = t.text2; ctx.font = '11.5px system-ui,sans-serif';
      if (horiz) { const neg = v < 0; ctx.textAlign = neg ? 'right' : 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, bar.x + (neg ? -6 : 6), bar.y); }
      else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(s, bar.x, (v < 0 ? bar.y + 16 : bar.y - 4)); }
      ctx.restore();
    });
  });
} };
// rótulos de pontos (scatter/bolhas)
const pointLabels = { id: 'pointLabels', ...PD, afterDatasetsDraw(ch) {
  const o = on(ch, 'pointLabels'); if (!o) return;
  const ctx = ch.ctx, t = T();
  const placed = [], A = ch.chartArea;
  const hit = b => placed.some(q => b.x < q.x + q.w && b.x + b.w > q.x && b.y < q.y + q.h && b.y + b.h > q.y);
  ch.data.datasets.forEach((ds, i) => { if (ds._noLabels) return; const meta = ch.getDatasetMeta(i);
    meta.data.forEach(p => placed.push({ x: p.x - 7, y: p.y - 7, w: 14, h: 14 })); });
  ctx.save(); ctx.fillStyle = t.text2; ctx.font = '11px system-ui,sans-serif'; ctx.textBaseline = 'middle';
  ch.data.datasets.forEach((ds, i) => { if (ds._noLabels) return; const meta = ch.getDatasetMeta(i);
    meta.data.forEach((p, k) => { const d = ds.data[k]; if (!d || !d.label) return;
      const w = ctx.measureText(d.label).width, h = 13;
      const cands = [{ x: p.x + 9, y: p.y - h / 2 }, { x: p.x - 9 - w, y: p.y - h / 2 }, { x: p.x - w / 2, y: p.y + 9 }, { x: p.x - w / 2, y: p.y - 9 - h }]
        .filter(b => b.x >= A.left && b.x + w <= A.right + 10);
      const b = cands.find(c => !hit({ ...c, w, h })) || cands[0]; if (!b) return;
      placed.push({ ...b, w, h }); ctx.fillText(d.label, b.x, b.y + h / 2); }); });
  ctx.restore();
} };
// linhas de referência (quadrantes)
const refLines = { id: 'refLines', ...PD, beforeDatasetsDraw(ch) {
  const o = on(ch, 'refLines'); if (!o) return; const ctx = ch.ctx, t = T(), A = ch.chartArea;
  ctx.save(); ctx.strokeStyle = t.axis; ctx.lineWidth = 1;
  if (isNum(o.y)) { const y = ch.scales.y.getPixelForValue(o.y); ctx.beginPath(); ctx.moveTo(A.left, y); ctx.lineTo(A.right, y); ctx.stroke(); }
  if (isNum(o.x)) { const x = ch.scales.x.getPixelForValue(o.x); ctx.beginPath(); ctx.moveTo(x, A.top); ctx.lineTo(x, A.bottom); ctx.stroke(); }
  if (o.labels) { ctx.fillStyle = t.muted; ctx.font = '11px system-ui,sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(o.labels[0], A.left + 6, A.top + 12); ctx.textAlign = 'right'; ctx.fillText(o.labels[1], A.right - 6, A.top + 12);
    ctx.textAlign = 'left'; ctx.fillText(o.labels[2], A.left + 6, A.bottom - 6); ctx.textAlign = 'right'; ctx.fillText(o.labels[3], A.right - 6, A.bottom - 6); }
  ctx.restore();
} };
Chart.register(crosshair, vmarks, endLabels, barLabels, pointLabels, refLines);

function mkChart(c, cfg, tableFmt) {
  const ch = new Chart(c.canvas.getContext('2d'), cfg);
  c.chart = ch; c.tableFmt = tableFmt ? (v => isNum(v) && Math.abs(v) >= 10000 ? fInt(v) : tableFmt(v)) : null; charts.push(ch);
  return ch;
}
// dataset de linha com pontos derivados vazados
function lineDS(label, objs, colorKey, extra = {}) {
  const t = T(), color = t[colorKey] || colorKey;
  const data = objs.map(g);
  const der = objs.map(o => !!(o && o.d));
  return Object.assign({ label, data, _derived: der, borderColor: color, backgroundColor: color,
    pointBackgroundColor: der.map(d => d ? t.surface : color), pointBorderColor: der.map(d => d ? color : t.surface),
    pointBorderWidth: 2, pointRadius: 4, spanGaps: false, tension: 0 }, extra);
}
function tooltipDerived(ctx) { const ds = ctx.dataset; return ds._derived && ds._derived[ctx.dataIndex] ? ' (derivado)' : ''; }
const scaleY = (fmt, extra = {}) => Object.assign({ beginAtZero: true, ticks: { callback: v => fmt(v) }, grid: { color: T().grid } }, extra);
const scaleX = (extra = {}) => Object.assign({ grid: { display: false } }, extra);

function lineChart(c, { labels, datasets, fmt, marks = [], end = true, yExtra = {}, padRight = 80, tipFmt }) {
  return mkChart(c, { type: 'line', data: { labels, datasets },
    options: { interaction: { mode: 'index', intersect: false }, layout: { padding: { right: end ? padRight : 8, top: 4 } },
      scales: { x: scaleX(), y: scaleY(fmt, yExtra) },
      plugins: { crosshair: { on: true }, vmarks: { on: true, items: marks }, endLabels: { on: !!end },
        tooltip: { callbacks: { label: ctx => ` ${(tipFmt || fmt)(ctx.parsed.y)}  ${ctx.dataset.label}${tooltipDerived(ctx)}` } } } } }, fmt);
}
function barChart(c, { labels, datasets, fmt, horizontal = false, stacked = false, labelsOn = false, xExtra = {}, yExtra = {}, tip, padRight }) {
  const valueAxis = horizontal ? 'x' : 'y', catAxis = horizontal ? 'y' : 'x';
  const scales = {};
  scales[valueAxis] = Object.assign(scaleY(fmt, { stacked }), horizontal ? xExtra : yExtra);
  scales[catAxis] = Object.assign({ stacked, grid: { display: false } }, horizontal ? yExtra : xExtra);
  if (stacked) datasets.forEach(d => { d.borderColor = T().surface; d.borderWidth = horizontal ? { left: 1, right: 1 } : { top: 1, bottom: 1 }; d.borderSkipped = false; d.borderRadius = 2; });
  return mkChart(c, { type: 'bar', data: { labels, datasets },
    options: { indexAxis: horizontal ? 'y' : 'x', interaction: { mode: stacked ? 'index' : 'nearest', intersect: !stacked, axis: horizontal ? 'y' : 'x' },
      layout: { padding: { right: padRight ?? (horizontal && labelsOn ? 70 : 8), top: labelsOn && !horizontal ? 18 : 4 } }, scales,
      plugins: { barLabels: { on: !!labelsOn, fmt: typeof labelsOn === 'function' ? labelsOn : (v => fmt(v)) },
        tooltip: { callbacks: { label: tip || (ctx => ` ${fmt(horizontal ? ctx.parsed.x : ctx.parsed.y)}  ${ctx.dataset.label || ''}${tooltipDerived(ctx)}`) } } } } }, fmt);
}
function emptyCard(c, msg) { c.wrap.textContent = ''; c.wrap.append(el('div', { class: 'empty', text: msg })); c.wrap.style.height = 'auto'; }
function toast(msg, ms = 5000) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', ms); }
