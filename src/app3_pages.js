/* =========================================================================
   PARTE 3 — Filtros, abas e páginas
   ========================================================================= */
const TABS = [
  ['overview', 'Visão geral'], ['world', 'Procedimentos no mundo'], ['countries', 'Brasil × EUA × Mundo'], ['procs', 'Ranking de procedimentos'],
  ['market', 'Mercado & projeções'], ['companies', 'Empresas'], ['cross', 'Análises cruzadas'], ['method', 'Metodologia & fontes']
];
// quais filtros globais valem em cada aba
const FILTER_SCOPE = {
  period: ['overview', 'world', 'countries', 'companies', 'cross'],
  geo: ['overview', 'countries'],
  tipo: ['world', 'procs'],
  rep: ['overview', 'world', 'countries', 'companies', 'cross', 'market']
};

function chipGroup(values, set, onChange, colorOf) {
  return values.map(v => {
    const b = el('button', { class: 'chip', 'aria-pressed': String(set.has(v)) });
    if (colorOf) { const d = el('span', { class: 'dot' }); d.style.background = colorOf(v); b.append(d); }
    b.append(v);
    b.addEventListener('click', () => { if (set.has(v)) { if (set.size > 1) set.delete(v); } else set.add(v); onChange(); });
    return b;
  });
}
function segGroup(options, current, onPick) {
  const w = el('div', { class: 'seg', role: 'group' });
  options.forEach(([val, lab]) => { const b = el('button', { 'aria-pressed': String(val === current), text: lab }); b.addEventListener('click', () => onPick(val)); w.append(b); });
  return w;
}
function yearSelect(value, onPick, years = S.years) {
  const s = el('select'); years.forEach(y => s.append(el('option', { value: y, text: y, selected: y === value }))); s.addEventListener('change', () => onPick(+s.value)); return s;
}

function renderGlobalFilters() {
  const F = $('#globalFilters'); F.textContent = '';
  const grp = (scope, label, ...kids) => el('div', { class: 'fgroup' + (FILTER_SCOPE[scope].includes(S.tab) ? '' : ' inactive'),
    title: FILTER_SCOPE[scope].includes(S.tab) ? '' : 'Este filtro não se aplica a esta aba' }, el('label', { class: 'fl', text: label }), ...kids);
  F.append(
    grp('period', 'Período', yearSelect(S.from, y => { S.from = Math.min(y, S.to); rerender(); }), el('span', { text: 'a' }), yearSelect(S.to, y => { S.to = Math.max(y, S.from); rerender(); })),
    grp('geo', 'Geografia', ...chipGroup(['Mundo', 'EUA', 'Brasil'], S.geos, rerender, v => col(GEO_COLOR[v]))),
    grp('tipo', 'Tipo', ...chipGroup(['Cirúrgico', 'Não cirúrgico'], S.tipos, rerender)),
    grp('rep', 'Dados', segGroup([[false, 'Todos'], [true, 'Só reportados']], S.onlyRep, v => { S.onlyRep = v; rerender(); }))
  );
}
function renderTabs() {
  const N = $('#tabs'); N.textContent = '';
  TABS.forEach(([id, lab]) => { const b = el('button', { role: 'tab', 'aria-selected': String(S.tab === id), text: lab });
    b.addEventListener('click', () => { S.tab = id; rerender(); window.scrollTo({ top: 0 }); }); N.append(b); });
}
function rerender() {
  destroyCharts(); renderTabs(); renderGlobalFilters();
  const main = $('#main'); main.textContent = '';
  const root = el('div', { class: 'grid' }); main.append(root);
  try { PAGES[S.tab](root, main); }
  catch (e) { console.error(e); root.append(el('div', { class: 'card span-12 alert', text: 'Erro ao montar esta aba: ' + e.message + '. Verifique se a planilha mantém a estrutura original.' })); }
}

// ---------- helpers de série ----------
const W = () => S.M.world.filter(w => inRange(w.ano));
const CN = () => S.M.countries.filter(c => inRange(c.ano));
const firstLast = (rows, f) => { const ok = rows.filter(r => g(f(r)) !== null); return [ok[0], ok[ok.length - 1]]; };
const growth = (a, b) => isNum(a) && isNum(b) && a ? b / a - 1 : null;
const cagr = (a, b, n) => isNum(a) && isNum(b) && a > 0 && n > 0 ? Math.pow(b / a, 1 / n) - 1 : null;
const median = arr => { const a = arr.filter(isNum).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const compRow = (re, ano) => S.M.comp.find(r => re.test(r.key) && (!ano || r.ano === String(ano)));
const usdOf = c => {
  const v = g(c.valor); if (v === null) return null;
  const m = norm(c.moeda);
  if (m.includes('us')) return v;
  if (m.includes('€') || m.includes('eur')) return v * (c.ano && c.ano <= 2022 ? S.fx.EUR_2022 : S.fx.EUR);
  if (m.includes('krw') || m.includes('won')) return v / S.fx.KRW;
  return null;
};

const PAGES = {};

/* ---------------- 1. VISÃO GERAL ---------------- */
PAGES.overview = (root) => {
  const w = W();
  const [f, l] = firstLast(w, r => r.tot);
  const prev = l && w.filter(r => r.ano < l.ano && g(r.tot) !== null).pop();
  if (!l) { root.append(el('div', { class: 'card span-12 empty', text: 'Sem dados de procedimentos no período selecionado.' })); return; }
  const flag = o => o && o.d ? 'contém valor derivado' : '';
  kpi(root, { span: 4, hero: true, label: `Procedimentos estéticos no mundo (${l.ano})`, value: fCompact(g(l.tot)),
    delta: prev ? `${fPctS(growth(g(prev.tot), g(l.tot)))} vs ${prev.ano}` : '', dir: prev ? Math.sign(g(l.tot) - g(prev.tot)) : 0, flag: flag(l.tot) });
  const c1 = cagr(g(f.tot), g(l.tot), l.ano - f.ano);
  kpi(root, { span: 2, label: 'CAGR mundial', value: fPct(c1), sub: `${f.ano}→${l.ano}` });
  const mixL = g(l.nao) !== null && g(l.tot) ? g(l.nao) / g(l.tot) : null, mixF = g(f.nao) !== null && g(f.tot) ? g(f.nao) / g(f.tot) : null;
  kpi(root, { span: 2, label: `% não cirúrgico (${l.ano})`, value: fPct(mixL), sub: `${f.ano}: ${fPct(mixF)}`, flag: flag(l.nao) });
  const cn = CN();
  const rk = [...cn].reverse().find(c => g(c.rank_cir) !== null);
  const rkt = [...cn].reverse().find(c => g(c.rank_tot) !== null);
  kpi(root, { span: 2, label: 'Brasil no ranking de cirurgias', value: rk ? g(rk.rank_cir) + 'º' : '—', sub: rk ? `${rk.ano} · total: ${rkt ? g(rkt.rank_tot) + 'º' : '—'}` : '' });
  const pc = [...cn].reverse().find(c => g(c.br_pct_cir) !== null);
  kpi(root, { span: 2, label: 'Brasil: % das cirurgias do mundo', value: pc ? fPct(g(pc.br_pct_cir)) : '—', sub: pc ? String(pc.ano) : '', flag: pc ? flag(pc.br_pct_cir) : '' });

  // total mundial
  const c = card(root, { title: 'Procedimentos estéticos no mundo', q: 'Total anual (cirúrgicos + não cirúrgicos), pesquisa ISAPS', span: 8,
    legend: [{ kind: 'fill', label: 'Reportado' }, { kind: 'hollow', label: 'Derivado/estimado' }],
    note: 'A ISAPS muda a amostra todo ano (≈1.000 cirurgiões em 2021, 2.975 em 2024): leia tendência, não variações de 1–2%.' });
  lineChart(c, { labels: w.map(r => String(r.ano)), datasets: [lineDS('Mundo', w.map(r => r.tot), 's1', { _noEnd: true, fill: true, backgroundColor: alpha(T().s1, .10) })],
    fmt: v => fCompact(v), end: false, marks: [{ x: '2020', text: 'COVID-19' }] });
  c.chart.data.datasets[0].pointBackgroundColor = c.chart.data.datasets[0]._derived.map(d => d ? T().surface : T().s1); c.chart.update('none');

  // insights automáticos
  const ic = plainCard(root, { title: 'Principais leituras', q: 'Calculadas a partir dos dados e do filtro atual', span: 4 });
  const ul = el('ul', { class: 'insights' }); ic.append(ul);
  insights().forEach(t => ul.append(el('li', { text: t })));

  // índice base 100
  const ci = card(root, { title: 'Crescimento comparado (índice, ano-base = 100)', q: 'Brasil, EUA e Mundo na mesma escala: quem cresce mais rápido?', span: 12,
    legend: [...S.geos].map(gx => ({ color: col(GEO_COLOR[gx]), label: gx })),
    note: 'EUA: salto entre 2020 e 2022 reflete mudança de método/amostra da ISAPS, não necessariamente demanda real.' });
  const series = { Mundo: w.map(r => r.tot), EUA: w.map(r => (S.M.countries.find(c => c.ano === r.ano) || {}).eua_tot), Brasil: w.map(r => (S.M.countries.find(c => c.ano === r.ano) || {}).br_tot) };
  const geos = [...S.geos];
  const bi = w.findIndex((r, i) => geos.every(gx => g(series[gx][i]) !== null));
  if (bi < 0) emptyCard(ci, 'Não há um ano com dado para todas as geografias selecionadas.');
  else {
    ci.el.querySelector('.q').textContent = `Índice ${w[bi].ano} = 100 · Brasil, EUA e Mundo na mesma escala`;
    lineChart(ci, { labels: w.map(r => String(r.ano)), fmt: v => fDec(v, 0),
      datasets: geos.map(gx => { const base = g(series[gx][bi]); const objs = series[gx].map(o => o && g(o) !== null ? V(g(o) / base * 100, o.d) : V(null)); return lineDS(gx, objs, GEO_COLOR[gx]); }),
      yExtra: { beginAtZero: false }, marks: [{ x: '2021', text: 'quebra de método (EUA)' }] });
  }
};

function insights() {
  const out = [], w = W(), cn = CN();
  const [f, l] = firstLast(w, r => r.nao);
  if (f && l && f !== l && g(f.tot) && g(l.tot)) out.push(`Não cirúrgicos eram ${fPct(g(f.nao) / g(f.tot))} do total em ${f.ano} e ${fPct(g(l.nao) / g(l.tot))} em ${l.ano}.`);
  const withR = cn.filter(c => g(c.rank_cir) !== null);
  if (withR.length) out.push(`Brasil foi 1º do mundo em cirurgias em ${withR.filter(c => g(c.rank_cir) === 1).length} de ${withR.length} anos com dado (${withR[0].ano}–${withR[withR.length - 1].ano}).`);
  const gr = k => { const [a, b] = firstLast(cn, c => c[k]); return a && b && a !== b ? [growth(g(a[k]), g(b[k])), a.ano, b.ano] : null; };
  const gm = (() => { const [a, b] = firstLast(w, r => r.tot); return a && b && a !== b ? [growth(g(a.tot), g(b.tot)), a.ano, b.ano] : null; })();
  const gb = gr('br_tot'), ge = gr('eua_tot');
  if (gm && gb) out.push(`Crescimento acumulado: Mundo ${fPctS(gm[0], 0)} (${gm[1]}–${gm[2]}), EUA ${ge ? fPctS(ge[0], 0) : '—'}, Brasil ${fPctS(gb[0], 0)} — o Brasil cresce menos que o mundo; a expansão global vem dos não cirúrgicos e da Ásia.`);
  const ab = S.M.abbvie.filter(a => inRange(a.ano));
  const [b1, b2] = firstLast(ab, a => a.bg), [j1, j2] = firstLast(ab, a => a.juv);
  if (b1 && b2 && b1 !== b2 && j1 && j2 && j1 !== j2) out.push(`AbbVie: Botox Cosmetic ${fPctS(growth(g(b1.bg), g(b2.bg)), 0)} (${b1.ano}→${b2.ano}) vs Juvéderm ${fPctS(growth(g(j1.juv), g(j2.juv)), 0)} (${j1.ano}→${j2.ano}) — toxina resiliente, ácido hialurônico em queda.`);
  const br = S.M.market.filter(m => m.geo === 'Brasil').flatMap(m => [g(m.base), g(m.proj)]).filter(isNum);
  if (br.length > 1) out.push(`Estimativas de mercado para o Brasil vão de ${fUsdBi(Math.min(...br))} a ${fUsdBi(Math.max(...br))}: o número depende da definição de “mercado”.`);
  if (S.M.notes.concentracao) out.push(S.M.notes.concentracao.replace(/\s*\(.*?S\d+\)\.?$/, '.'));
  return out;
}

/* ---------------- 2. PROCEDIMENTOS NO MUNDO ---------------- */
PAGES.world = (root) => {
  const w = W(); const labels = w.map(r => String(r.ano)); const t = T();
  const [f, l] = firstLast(w, r => r.tot);
  if (!l) { root.append(el('div', { class: 'card span-12 empty', text: 'Sem dados no período.' })); return; }
  const gk = k => { const [a, b] = firstLast(w, r => r[k]); return a && b && a !== b ? { v: growth(g(a[k]), g(b[k])), a: a.ano, b: b.ano } : null; };
  const gc = gk('cir'), gn = gk('nao'), gt = gk('tot');
  kpi(root, { label: 'Crescimento — cirúrgicos', value: gc ? fPctS(gc.v, 0) : '—', sub: gc ? `${gc.a}→${gc.b}` : '' });
  kpi(root, { label: 'Crescimento — não cirúrgicos', value: gn ? fPctS(gn.v, 0) : '—', sub: gn ? `${gn.a}→${gn.b}` : '' });
  kpi(root, { label: 'Crescimento — total', value: gt ? fPctS(gt.v, 0) : '—', sub: gt ? `${gt.a}→${gt.b} · CAGR ${fPct(cagr(g(f.tot), g(l.tot), l.ano - f.ano))}` : '' });
  const hm = [...w].reverse().find(r => g(r.hom) !== null);
  kpi(root, { label: 'Procedimentos em homens', value: hm ? fPct(g(hm.hom)) : '—', sub: hm ? `${hm.ano} (dado esparso)` : '' });

  // empilhado absoluto
  const tipos = [['Cirúrgico', 'cir'], ['Não cirúrgico', 'nao']].filter(([n]) => S.tipos.has(n));
  const c1 = card(root, { title: 'Cirúrgicos × não cirúrgicos', q: 'Volume anual por tipo', span: 6, legend: tipos.map(([n]) => ({ kind: 'box', color: col(TYPE_COLOR[n]), label: n })) });
  barChart(c1, { labels, stacked: true, fmt: v => fCompact(v), datasets: tipos.map(([n, k]) => ({ label: n, data: w.map(r => g(r[k])), _derived: w.map(r => r[k].d), backgroundColor: col(TYPE_COLOR[n]) })) });

  // mix 100%
  const c2 = card(root, { title: 'Mix do setor (100%)', q: 'Participação de cada tipo no total do ano', span: 6,
    legend: [['Cirúrgico'], ['Não cirúrgico']].map(([n]) => ({ kind: 'box', color: col(TYPE_COLOR[n]), label: n })), note: 'Mostra sempre os dois tipos (o filtro “Tipo” não se aplica ao mix).' });
  const share = (r, k) => g(r[k]) !== null && g(r.tot) ? g(r[k]) / g(r.tot) : null;
  barChart(c2, { labels, stacked: true, fmt: v => fPct(v, 0), yExtra: { max: 1 },
    datasets: [{ label: 'Cirúrgico', data: w.map(r => share(r, 'cir')), _derived: w.map(r => r.cir.d), backgroundColor: t.s1 },
      { label: 'Não cirúrgico', data: w.map(r => share(r, 'nao')), _derived: w.map(r => r.nao.d), backgroundColor: t.s2 }] });

  // crescimento acumulado por tipo
  const c3 = card(root, { title: 'Crescimento acumulado por tipo', q: gt ? `${gt.a} → ${gt.b}` : '', span: 4, height: 'short' });
  barChart(c3, { labels: ['Cirúrgicos', 'Não cirúrgicos', 'Total'], horizontal: true, fmt: v => fPctS(v, 0), labelsOn: true,
    datasets: [{ label: 'Crescimento', data: [gc?.v, gn?.v, gt?.v], backgroundColor: [t.s1, t.s2, t.muted] }] });

  // toxina e AH (small multiples, mesma escala)
  const ymax = Math.max(...w.flatMap(r => [g(r.tox), g(r.ah)]).filter(isNum), 1) * 1.1;
  [['tox', 'Toxina botulínica', 'Procedimento não cirúrgico nº 1'], ['ah', 'Ácido hialurônico', 'Preenchedor nº 1 — em queda em 2025']].forEach(([k, title, q]) => {
    const c = card(root, { title: `${title} (aplicações ISAPS)`, q, span: 4, height: 'short', note: 'Série com anos faltantes: só liga anos consecutivos.' });
    lineChart(c, { labels, datasets: [lineDS(title, w.map(r => r[k]), 's3', { _noEnd: true })], fmt: v => fCompact(v), end: false, yExtra: { max: ymax } });
  });

  // variação calculada x oficial
  const c4 = card(root, { title: 'Variação anual: calculada × oficial ISAPS', q: 'Diferenças grandes indicam mudança de amostra/método', span: 8,
    legend: [{ kind: 'box', color: t.s3, label: 'Calculada (total ano / total ano anterior)' }, { kind: 'box', color: t.muted, label: 'Oficial (divulgada pela ISAPS)' }] });
  barChart(c4, { labels, fmt: v => fPctS(v, 0), datasets: [
    { label: 'Calculada', data: w.map(r => g(r.varCalc)), _derived: w.map(r => r.varCalc.d), backgroundColor: t.s3 },
    { label: 'Oficial', data: w.map(r => g(r.varOf)), backgroundColor: t.muted }] });

  const c5 = card(root, { title: 'Participação de homens', q: '% dos procedimentos feitos em homens', span: 4 });
  lineChart(c5, { labels, datasets: [lineDS('% homens', w.map(r => r.hom), 's1', { _noEnd: true })], fmt: v => fPct(v, 0), end: false, yExtra: { beginAtZero: false, suggestedMin: .1, suggestedMax: .18 }, tipFmt: v => fPct(v, 1) });
};

/* ---------------- 3. BRASIL × EUA × MUNDO ---------------- */
PAGES.countries = (root) => {
  const cn = CN(); const labels = cn.map(c => String(c.ano)); const t = T();
  root.append(el('div', { class: 'alert span-12' }, el('b', { text: 'Atenção: ' }),
    'a ISAPS conta só procedimentos de cirurgiões plásticos. No Brasil, a maior parte da toxina e dos preenchedores é aplicada por dermatologistas, dentistas e biomédicos — o volume não cirúrgico brasileiro está subestimado. Nos EUA, os números de 2019 e 2021 são derivados de % do mundo, e o salto em 2021–22 é quebra de série.'));
  const geos2 = ['EUA', 'Brasil'].filter(x => S.geos.has(x));
  const c1 = card(root, { title: 'Procedimentos totais: Brasil × EUA', q: 'Volume anual (ISAPS)', span: 8, legend: [...geos2.map(x => ({ color: col(GEO_COLOR[x]), label: x })), { kind: 'hollow', label: 'derivado' }] });
  if (!geos2.length) emptyCard(c1, 'Selecione Brasil e/ou EUA no filtro de geografia.');
  else lineChart(c1, { labels, fmt: v => fCompact(v), marks: [{ x: '2021', text: 'quebra de método (EUA)' }],
    datasets: geos2.map(x => lineDS(x, cn.map(c => x === 'EUA' ? c.eua_tot : c.br_tot), GEO_COLOR[x])) });

  const c2 = card(root, { title: 'Razão Brasil ÷ EUA', q: 'Procedimentos do Brasil para cada 1 dos EUA', span: 4 });
  lineChart(c2, { labels, fmt: v => fDec(v, 2), datasets: [lineDS('Brasil ÷ EUA', cn.map(c => c.br_eua), 's3', { _noEnd: true })], end: false, yExtra: { beginAtZero: true, suggestedMax: .8 } });

  const c3 = card(root, { title: 'Participação no total mundial', q: '% dos procedimentos do mundo', span: 6, legend: geos2.map(x => ({ color: col(GEO_COLOR[x]), label: x })) });
  if (geos2.length) lineChart(c3, { labels, fmt: v => fPct(v, 0), tipFmt: v => fPct(v, 1), datasets: geos2.map(x => lineDS(x, cn.map(c => x === 'EUA' ? c.eua_pct : c.br_pct), GEO_COLOR[x])) });
  else emptyCard(c3, 'Selecione Brasil e/ou EUA.');

  const c4 = card(root, { title: 'Brasil: % das cirurgias do mundo', q: 'Onde o Brasil é líder', span: 6 });
  lineChart(c4, { labels, fmt: v => fPct(v, 0), tipFmt: v => fPct(v, 1), datasets: [lineDS('Brasil', cn.map(c => c.br_pct_cir), 's3', { _noEnd: true, fill: true, backgroundColor: alpha(t.s3, .10) })], end: false, yExtra: { suggestedMax: .2 } });
  c4.chart.data.datasets[0].pointBackgroundColor = c4.chart.data.datasets[0]._derived.map(d => d ? t.surface : t.s3); c4.chart.update('none');

  // ranking (bump)
  const c5 = card(root, { title: 'Posição do Brasil no ranking mundial', q: '1º = maior do mundo', span: 6,
    legend: [{ color: t.s3, label: 'Em cirurgias' }, { color: t.text2, label: 'No total de procedimentos' }] });
  mkChart(c5, { type: 'line', data: { labels, datasets: [
      lineDS('Em cirurgias', cn.map(c => c.rank_cir), 's3'), lineDS('No total', cn.map(c => c.rank_tot), t.text2, { borderDash: [5, 4] })] },
    options: { interaction: { mode: 'index', intersect: false }, layout: { padding: { right: 80 } },
      scales: { x: scaleX(), y: { reverse: true, min: .6, max: 3.4, afterBuildTicks: ax => { ax.ticks = [1, 2, 3].map(v => ({ value: v })); }, ticks: { callback: v => v + 'º' } } },
      plugins: { crosshair: { on: true }, endLabels: { on: true }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}º  ${ctx.dataset.label}` } } } } }, v => isNum(v) ? v + 'º' : '—');

  // perfil cirúrgico x não cirúrgico
  const yr = [...S.M.countries].reverse().find(c => c.ano <= S.to && g(c.br_cir) !== null);
  const c6 = card(root, { title: 'Perfil: quanto do volume é cirúrgico', q: yr ? `Ano ${yr.ano}` : '', span: 6, height: 'short',
    legend: [{ kind: 'box', color: t.text2, label: 'Cirúrgico' }, { kind: 'box', color: t.axis, label: 'Não cirúrgico' }] });
  if (yr) {
    const wy = S.M.world.find(x => x.ano === yr.ano);
    const rows = [['Brasil', yr.br_cir, yr.br_tot], ['Mundo', wy?.cir, wy?.tot], ['EUA', yr.eua_cir, yr.eua_tot]].filter(([n, a, b]) => S.geos.has(n) && g(a) !== null && g(b));
    barChart(c6, { labels: rows.map(r => r[0]), horizontal: true, stacked: true, fmt: v => fPct(v, 0), xExtra: { max: 1 },
      datasets: [{ label: 'Cirúrgico', data: rows.map(r => g(r[1]) / g(r[2])), backgroundColor: t.text2 }, { label: 'Não cirúrgico', data: rows.map(r => 1 - g(r[1]) / g(r[2])), backgroundColor: t.axis }] });
  } else emptyCard(c6, 'Sem ano com dado cirúrgico do Brasil no período.');

  // normalizações (small multiples)
  root.append(el('div', { class: 'section-title', text: 'Normalização (2024) — o tamanho relativo ao país' }));
  const norms = [[/^procedimentos por 1\.000/, 'Procedimentos por 1.000 habitantes', v => fDec(v, 1)], [/^cirurgias por 1\.000/, 'Cirurgias por 1.000 habitantes', v => fDec(v, 1)],
    [/^procedimentos por cirurgiao/, 'Procedimentos por cirurgião plástico', v => fInt(v)]];
  norms.forEach(([re, title, fmt]) => {
    const r = compRow(re);
    const c = card(root, { title, q: r ? `${r.ano} · só cirurgiões plásticos (ISAPS)` : '', span: 4, height: 'xs' });
    if (!r) { emptyCard(c, 'Indicador não encontrado em Brasil_Comparativo.'); return; }
    const items = [['Brasil', r.br], ['EUA', r.eua], ['Mundo', r.mu]].filter(([n, o]) => S.geos.has(n) && g(o) !== null);
    barChart(c, { labels: items.map(i => i[0]), horizontal: true, fmt, labelsOn: true, datasets: [{ label: title, data: items.map(i => g(i[1])), backgroundColor: items.map(i => col(GEO_COLOR[i[0]])) }] });
  });

  // crescimento acumulado
  const gro = [['Mundo', S.M.world.filter(w => inRange(w.ano)), 'tot'], ['EUA', cn, 'eua_tot'], ['Brasil', cn, 'br_tot']].filter(([n]) => S.geos.has(n)).map(([n, rows, k]) => {
    const [a, b] = firstLast(rows, r => r[k]); return a && b && a !== b ? { n, v: growth(g(a[k]), g(b[k])), a: a.ano, b: b.ano } : { n, v: null }; });
  const c7 = card(root, { title: 'Crescimento acumulado no período', q: gro.filter(x => x.a).map(x => `${x.n}: ${x.a}→${x.b}`).join(' · '), span: 6, height: 'short' });
  barChart(c7, { labels: gro.map(x => x.n), horizontal: true, fmt: v => fPctS(v, 0), labelsOn: true, datasets: [{ label: 'Crescimento', data: gro.map(x => x.v), backgroundColor: gro.map(x => col(GEO_COLOR[x.n])) }] });

  // Anvisa
  const ca = plainCard(root, { title: 'Toxinas botulínicas com registro na Anvisa', q: S.M.notes.anvisa || '', span: 6 });
  const tb = el('table', { class: 'data' }, el('thead', {}, el('tr', {}, ...['Marca', 'Registro', 'Empresa / origem', 'Observação'].map(h => el('th', { text: h })))));
  const body = el('tbody'); S.M.anvisa.forEach(a => body.append(el('tr', {}, el('td', { text: a.marca }), el('td', { text: a.registro }), el('td', { text: a.empresa }), el('td', { text: a.obs })))); tb.append(body);
  ca.append(el('div', { class: 'table-scroll' }, tb));
};

/* ---------------- 4. RANKING DE PROCEDIMENTOS ---------------- */
PAGES.procs = (root, main) => {
  const P = S.M.procs;
  const escopos = [...new Set(P.map(p => p.escopo))];
  if (!escopos.includes(S.procEscopo)) S.procEscopo = escopos[0];
  const anos = [...new Set(P.filter(p => p.escopo === S.procEscopo).map(p => p.ano))].sort();
  if (!anos.includes(S.procAno)) S.procAno = anos[anos.length - 1];
  const pf = el('div', { class: 'page-filters' }, el('span', { class: 'ttl', text: 'Filtros da aba' }),
    el('div', { class: 'fgroup' }, el('label', { class: 'fl', text: 'Escopo' }), segGroup(escopos.map(e => [e, e]), S.procEscopo, v => { S.procEscopo = v; rerender(); })),
    el('div', { class: 'fgroup' }, el('label', { class: 'fl', text: 'Ano' }), yearSelect(S.procAno, y => { S.procAno = y; rerender(); }, anos)),
    el('span', { class: 'note', style: 'color:var(--muted);font-size:12px', text: `Anos com dado para ${S.procEscopo}: ${anos.join(', ')}` }));
  main.insertBefore(pf, root);

  const sel = P.filter(p => p.escopo === S.procEscopo && p.ano === S.procAno && S.tipos.has(p.tipo));
  const withQ = sel.filter(p => g(p.qtd) !== null).sort((a, b) => g(b.qtd) - g(a.qtd));
  const t = T();
  const c1 = card(root, { title: `Procedimentos mais realizados — ${S.procEscopo}, ${S.procAno}`, q: 'Quantidade (ISAPS)', span: 6, height: withQ.length > 7 ? 'tall' : '',
    legend: [...S.tipos].map(n => ({ kind: 'box', color: col(TYPE_COLOR[n]), label: n })) });
  if (!withQ.length) emptyCard(c1, 'Sem quantidades para esta combinação de filtros.');
  else barChart(c1, { labels: withQ.map(p => p.procRaw), horizontal: true, fmt: v => fCompact(v), labelsOn: true, padRight: 64,
    datasets: [{ label: 'Quantidade', data: withQ.map(p => g(p.qtd)), backgroundColor: withQ.map(p => col(TYPE_COLOR[p.tipo] || 's1')) }] });

  const withV = sel.filter(p => g(p.vr) !== null).sort((a, b) => g(b.vr) - g(a.vr));
  const pos = t.s1, neg = document.documentElement.dataset.theme === 'dark' ? '#e66767' : '#e34948';
  const c2 = card(root, { title: 'Variação anual reportada', q: 'Quem cresce e quem cai no ano', span: 6, height: withV.length > 7 ? 'tall' : '',
    legend: [{ kind: 'box', color: pos, label: 'Alta' }, { kind: 'box', color: neg, label: 'Queda' }] });
  if (!withV.length) emptyCard(c2, 'A fonte não reporta variação para os procedimentos deste ano/escopo.');
  else barChart(c2, { labels: withV.map(p => p.procRaw), horizontal: true, fmt: v => fPctS(v, 0), labelsOn: true, padRight: 50,
    xExtra: { suggestedMin: Math.min(0, ...withV.map(p => g(p.vr))) * 1.5 - .02, suggestedMax: Math.max(0, ...withV.map(p => g(p.vr))) * 1.15 },
    datasets: [{ label: 'Variação', data: withV.map(p => g(p.vr)), backgroundColor: withV.map(p => g(p.vr) >= 0 ? pos : neg), borderSkipped: false }] });

  // líderes por ano
  const cl = plainCard(root, { title: `Líder de cada ano — ${S.procEscopo}`, q: 'Procedimento nº 1 por tipo (ranking da fonte)', span: 6 });
  const allA = [...new Set(P.filter(p => p.escopo === S.procEscopo).map(p => p.ano))].sort();
  const lt = el('table', { class: 'data' }, el('thead', {}, el('tr', {}, el('th', { text: 'Ano' }), el('th', { text: 'Cirúrgico nº 1' }), el('th', { text: 'Não cirúrgico nº 1' }))));
  const lb = el('tbody');
  const leader = (a, tp) => { const xs = P.filter(p => p.escopo === S.procEscopo && p.ano === a && p.tipo === tp); const r1 = xs.filter(p => g(p.rank) === 1).map(p => p.proc); return r1.length ? [...new Set(r1.map(x => x.replace(/ — (homens|mulheres)$/, '')))].join(', ') : '—'; };
  allA.forEach(a => lb.append(el('tr', {}, el('td', { text: a }), el('td', { text: leader(a, 'Cirúrgico') }), el('td', { text: leader(a, 'Não cirúrgico') }))));
  lt.append(lb); cl.append(lt);

  const cd = plainCard(root, { title: 'Detalhe da seleção', q: `${sel.length} registros`, span: 6 });
  const dt = el('table', { class: 'data' }, el('thead', {}, el('tr', {}, ...['Procedimento', 'Tipo', 'Rank', 'Quantidade', 'Var.', 'Observação', 'Fonte'].map((h, i) => el('th', { class: i >= 2 && i <= 4 ? 'num' : '', text: h })))));
  const db = el('tbody');
  sel.sort((a, b) => (g(a.rank) ?? 99) - (g(b.rank) ?? 99)).forEach(p => db.append(el('tr', {}, el('td', { text: p.procRaw }), el('td', { text: p.tipo }),
    el('td', { class: 'num', text: g(p.rank) ?? '—' }), el('td', { class: 'num', text: fInt(g(p.qtd)) }), el('td', { class: 'num', text: fPctS(g(p.vr)) }), el('td', { text: p.obs }), el('td', { text: p.fonte }))));
  dt.append(db); cd.append(el('div', { class: 'table-scroll' }, dt));
};

/* ---------------- 5. MERCADO & PROJEÇÕES ---------------- */
PAGES.market = (root, main) => {
  const MK = S.M.market;
  const geos = [...new Set(MK.map(m => m.geo))];
  if (!geos.includes(S.mktGeo)) S.mktGeo = geos[0];
  const grupos = [...new Set(MK.filter(m => m.geo === S.mktGeo).map(m => m.grupo))];
  if (!grupos.includes(S.mktGrupo)) S.mktGrupo = grupos[0];
  const consAll = [...new Set(MK.filter(m => m.geo === S.mktGeo && m.grupo === S.mktGrupo).map(m => m.cons))];
  if (!S.mktCons || ![...S.mktCons].some(c => consAll.includes(c))) S.mktCons = new Set(consAll);
  const gs = el('select'); grupos.forEach(x => gs.append(el('option', { value: x, selected: x === S.mktGrupo, text: `${x} (${MK.filter(m => m.geo === S.mktGeo && m.grupo === x).length})` })));
  gs.addEventListener('change', () => { S.mktGrupo = gs.value; S.mktCons = null; rerender(); });
  main.insertBefore(el('div', { class: 'page-filters' }, el('span', { class: 'ttl', text: 'Filtros da aba' }),
    el('div', { class: 'fgroup' }, el('label', { class: 'fl', text: 'Geografia' }), segGroup(geos.map(x => [x, x]), S.mktGeo, v => { S.mktGeo = v; S.mktCons = null; rerender(); })),
    el('div', { class: 'fgroup' }, el('label', { class: 'fl', text: 'Escopo (seleção única)' }), gs),
    el('div', { class: 'fgroup' }, el('label', { class: 'fl', text: 'Consultoria' }), ...chipGroup(consAll, S.mktCons, rerender))), root);

  const rows = MK.filter(m => m.geo === S.mktGeo && m.grupo === S.mktGrupo && S.mktCons.has(m.cons));
  const t = T();
  const bases = rows.map(r => g(r.base)).filter(isNum), cg = rows.map(r => g(r.cagrRep) ?? g(r.cagrCalc)).filter(isNum);
  kpi(root, { label: 'Estimativas na seleção', value: String(rows.length), sub: `${S.mktGeo} · ${S.mktGrupo}` });
  kpi(root, { label: 'Faixa do valor base', value: bases.length ? (bases.length > 1 ? `${fUsdBi(Math.min(...bases))} – ${fUsdBi(Math.max(...bases)).replace('US$ ', '')}` : fUsdBi(bases[0])) : '—', sub: 'anos-base variam por consultoria' });
  kpi(root, { label: 'CAGR mediano projetado', value: fPct(median(cg)), sub: cg.length ? `de ${fPct(Math.min(...cg))} a ${fPct(Math.max(...cg))}` : '' });
  const brm = compRow(/^mercado de estetica medica/);
  kpi(root, { label: 'Brasil como % do mercado mundial (produtos)', value: brm ? fPct(g(brm.br) / g(brm.mu)) : '—', sub: brm ? `${fUsdBi(g(brm.br))} de ${fUsdBi(g(brm.mu))} · MarketsandMarkets, anos-base diferentes` : '' });

  // dumbbell
  const dr = rows.filter(r => g(r.base) !== null || g(r.proj) !== null);
  const lab = dr.map(r => `${r.cons}${dr.filter(x => x.cons === r.cons).length > 1 ? ' · ' + r.escopo.slice(0, 22) : ''}`);
  const c1 = card(root, { title: 'Valor base → valor projetado', q: 'Uma linha por consultoria (US$ bilhões)', span: 8, height: dr.length > 6 ? 'tall' : '',
    legend: [{ kind: 'fill', color: t.s1, label: 'Base' }, { kind: 'fill', color: t.s2, label: 'Projeção' }] });
  if (!dr.length) emptyCard(c1, 'Nada para mostrar.');
  else mkChart(c1, { type: 'bar', data: { labels: lab, datasets: [
      { type: 'bar', label: 'Intervalo', data: dr.map(r => g(r.base) !== null && g(r.proj) !== null ? [g(r.base), g(r.proj)] : null), backgroundColor: t.axis, barThickness: 2, borderRadius: 0, borderSkipped: false, _hideInTable: true },
      { type: 'line', label: 'Base', showLine: false, data: dr.map(r => g(r.base)), _years: dr.map(r => r.anoBase), backgroundColor: t.s1, borderColor: t.surface, pointRadius: 6, pointHoverRadius: 8, pointBorderWidth: 2 },
      { type: 'line', label: 'Projeção', showLine: false, data: dr.map(r => g(r.proj)), _years: dr.map(r => r.anoProj), backgroundColor: t.s2, borderColor: t.surface, pointRadius: 6, pointHoverRadius: 8, pointBorderWidth: 2 }] },
    options: { indexAxis: 'y', interaction: { mode: 'index', intersect: false, axis: 'y' }, layout: { padding: { right: 16 } },
      scales: { x: scaleY(v => fDec(v, 0), { title: { display: true, text: 'US$ bilhões' } }), y: { grid: { display: false }, ticks: { autoSkip: false } } },
      plugins: { tooltip: { filter: i => i.datasetIndex > 0 && isNum(i.raw), callbacks: { label: ctx => ` ${fUsdBi(ctx.raw)}  ${ctx.dataset.label} (${ctx.dataset._years[ctx.dataIndex] ?? 's/ano'})` } } } } }, v => fUsdBi(v));

  // CAGR reportado x calculado
  const cr = rows.filter(r => g(r.cagrRep) !== null || g(r.cagrCalc) !== null);
  const c2 = card(root, { title: 'CAGR: reportado × recalculado', q: 'Recalculado = (projeção/base)^(1/anos) − 1', span: 4, height: cr.length > 6 ? 'tall' : '',
    legend: [{ kind: 'box', color: t.s1, label: 'Reportado' }, { kind: 'box', color: t.muted, label: 'Recalculado' }] });
  if (cr.length) barChart(c2, { labels: cr.map(r => r.cons), horizontal: true, fmt: v => fPct(v, 1), datasets: [
    { label: 'Reportado', data: cr.map(r => g(r.cagrRep)), backgroundColor: t.s1 }, { label: 'Recalculado', data: cr.map(r => g(r.cagrCalc)), backgroundColor: t.muted }] });
  else emptyCard(c2, 'Sem CAGR na seleção.');

  // dispersão (log) — todas as definições da geografia
  const geoRows = MK.filter(m => m.geo === S.mktGeo);
  const grs = [...new Set(geoRows.map(m => m.grupo))];
  const c3 = card(root, { title: `Dispersão das estimativas — ${S.mktGeo}`, q: 'Todas as definições de mercado, escala logarítmica', span: 6,
    legend: [{ kind: 'fill', label: 'Valor base' }, { kind: 'hollow', label: 'Projeção' }], note: 'A incerteza é o recado: definições diferentes geram números até 100× diferentes. Nunca some ou compare linhas de escopos distintos.' });
  const pts = (k) => geoRows.filter(m => g(m[k]) !== null).map(m => ({ x: g(m[k]), y: m.grupo, label: '', cons: m.cons, ano: k === 'base' ? m.anoBase : m.anoProj }));
  mkChart(c3, { type: 'scatter', data: { datasets: [
      { label: 'Valor base', data: pts('base'), backgroundColor: t.s1, borderColor: t.surface, pointRadius: 6, pointBorderWidth: 2, pointHoverRadius: 8 },
      { label: 'Projeção', data: pts('proj'), backgroundColor: t.surface, borderColor: t.s1, pointRadius: 6, pointBorderWidth: 2, pointHoverRadius: 8 }] },
    options: { layout: { padding: { right: 16 } }, scales: { x: { type: 'logarithmic', ticks: { autoSkip: false, maxRotation: 0, callback: v => [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].includes(+v) ? fDec(v, v < 1 ? 1 : 0) : '' }, title: { display: true, text: 'US$ bilhões (log)' } },
      y: { type: 'category', labels: grs, offset: true, grid: { display: false } } },
      plugins: { tooltip: { callbacks: { label: ctx => ` ${fUsdBi(ctx.raw.x)}  ${ctx.raw.cons} (${ctx.raw.ano ?? 's/ano'}) — ${ctx.dataset.label}` } } } } }, v => isNum(v) ? fDec(v, 2) : v);
  c3.tableFmtX = v => fUsdBi(v);

  // série histórica MarketsandMarkets
  const ms = S.M.mmSeries;
  const c4 = card(root, { title: 'MarketsandMarkets: série de estimativas (global)', q: 'Linha cheia = estimado · tracejada = projeção', span: 6,
    legend: [{ kind: 'fill', label: 'Estimado/projeção publicada' }, { kind: 'hollow', label: 'Implícito (derivado)' }], note: 'Escopo e método mudam entre edições do relatório: trate como ordem de grandeza.' });
  if (ms.length) {
    const ds = { label: 'Mercado global (US$ bi)', data: ms.map(m => ({ x: m.ano, y: g(m.v) })).filter(p => p.y !== null), borderColor: t.s1, backgroundColor: t.s1,
      pointBackgroundColor: ms.filter(m => g(m.v) !== null).map(m => m.v.d ? t.surface : t.s1), pointBorderColor: ms.filter(m => g(m.v) !== null).map(m => m.v.d ? t.s1 : t.surface),
      showLine: true, segment: { borderDash: c => (c.p1.parsed.x > 2024 ? [6, 5] : undefined) } };
    mkChart(c4, { type: 'scatter', data: { datasets: [ds] }, options: { interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      scales: { x: { type: 'linear', ticks: { stepSize: 5, callback: v => String(v) }, grid: { display: false } }, y: scaleY(v => fDec(v, 0), { title: { display: true, text: 'US$ bilhões' } }) },
      plugins: { tooltip: { callbacks: { title: i => String(i[0].raw.x), label: ctx => ` ${fUsdBi(ctx.raw.y)}  ${(ms.find(m => m.ano === ctx.raw.x) || {}).tipo || ''}` } } } } }, v => fDec(v, 2));
    c4.tableFmtX = v => String(v);
  } else emptyCard(c4, 'Série histórica não encontrada.');

  // tabela completa
  const ct = plainCard(root, { title: 'Estimativas da seleção', q: 'Escopo original de cada consultoria', span: 12 });
  const tt = el('table', { class: 'data' }, el('thead', {}, el('tr', {}, ...['Consultoria', 'Escopo original', 'Ano base', 'Valor base', 'Ano proj.', 'Valor proj.', 'CAGR rep.', 'CAGR recalc.', 'Observação', 'Fonte'].map((h, i) => el('th', { class: [2, 3, 4, 5, 6, 7].includes(i) ? 'num' : '', text: h })))));
  const tb = el('tbody'); rows.forEach(r => tb.append(el('tr', {}, el('td', { text: r.cons }), el('td', { text: r.escopo }), el('td', { class: 'num', text: r.anoBase ?? '—' }),
    el('td', { class: 'num', text: fUsdBi(g(r.base)) }), el('td', { class: 'num', text: r.anoProj ?? '—' }), el('td', { class: 'num', text: fUsdBi(g(r.proj)) }),
    el('td', { class: 'num', text: fPct(g(r.cagrRep)) }), el('td', { class: 'num', text: fPct(g(r.cagrCalc)) }), el('td', { text: r.obs }), el('td', { text: r.fonte }))));
  tt.append(tb); ct.append(el('div', { class: 'table-scroll' }, tt));
};

/* ---------------- 6. EMPRESAS ---------------- */
PAGES.companies = (root, main) => {
  const CO = S.M.companies; const t = T();
  const paises = [...new Set(CO.filter(c => !c.isSub).map(c => c.pais).filter(Boolean))];
  if (!S.empPais) S.empPais = new Set(paises);
  const fxIn = (key, label) => { const i = el('input', { type: 'number', step: 'any', value: S.fx[key] }); i.addEventListener('change', () => { const v = parseFloat(i.value); if (v > 0) { S.fx[key] = v; rerender(); } }); return el('label', { class: 'fx', style: 'font-size:12px;color:var(--text-2);display:inline-flex;gap:4px;align-items:center' }, label, i); };
  main.insertBefore(el('div', { class: 'page-filters' }, el('span', { class: 'ttl', text: 'Filtros da aba' }),
    el('div', { class: 'fgroup' }, el('label', { class: 'fl', text: 'País de origem' }), ...chipGroup(paises, S.empPais, rerender)),
    el('div', { class: 'fgroup' }, el('label', { class: 'fl', text: 'Câmbio (ajustável)' }), fxIn('EUR', 'US$/€ 2025'), fxIn('EUR_2022', 'US$/€ 2022'), fxIn('KRW', 'KRW por US$'))), root);

  const top = CO.filter(c => !c.isSub && S.empPais.has(c.pais)).map(c => ({ ...c, usd: usdOf(c), escopoGrupo: /grupo/i.test(c.metrica) }));
  const withV = top.filter(c => isNum(c.usd)).sort((a, b) => b.usd - a.usd);
  const nm = c => c.empresa.replace(/\s*\(.*\)$/, '') + (c.escopoGrupo ? '*' : '');
  const c1 = card(root, { title: 'Receita mais recente (US$ milhões)', q: 'Convertida pelo câmbio ao lado · ano no rótulo', span: 6, height: withV.length > 7 ? 'tall' : '',
    note: '* receita do grupo inteiro (inclui terapêutico/outras áreas), não só estética. Receitas não somam “o mercado”: os escopos são diferentes.' });
  if (withV.length) barChart(c1, { labels: withV.map(nm), horizontal: true, fmt: v => fInt(v), labelsOn: (v, k) => `${fInt(v)} (${withV[k].ano})`, padRight: 90,
    tip: ctx => { const c = withV[ctx.dataIndex]; return ` ${fUsdMi(ctx.parsed.x)} · original: ${fInt(g(c.valor))} ${c.moeda} (${c.ano}) · ${c.metrica}`; },
    datasets: [{ label: 'Receita (US$ mi)', data: withV.map(c => c.usd), backgroundColor: t.s1 }] });
  else emptyCard(c1, 'Sem receitas para os países selecionados.');

  // bolhas: tamanho x crescimento
  const sc = withV.filter(c => g(c.vr) !== null);
  const mx = median(sc.map(c => c.usd));
  const c2 = card(root, { title: 'Tamanho × crescimento', q: 'Receita (US$ mi) × variação anual', span: 6, note: 'Linhas de referência: crescimento zero e receita mediana do grupo.' });
  if (sc.length) {
    mkChart(c2, { type: 'scatter', data: { datasets: [{ label: 'Empresas', data: sc.map(c => ({ x: c.usd, y: g(c.vr), label: nm(c) })), backgroundColor: t.s1, borderColor: t.surface, pointRadius: 7, pointBorderWidth: 2, pointHoverRadius: 9 }] },
      options: { layout: { padding: { right: 20, top: 10 } }, scales: { x: { type: 'logarithmic', title: { display: true, text: 'Receita US$ mi (log)' }, ticks: { callback: v => [200, 500, 1000, 2000, 5000].includes(+v) ? fInt(v) : '' } },
        y: { ticks: { callback: v => fPctS(v, 0) }, suggestedMin: -.1, suggestedMax: .2 } },
        plugins: { pointLabels: { on: true }, refLines: { on: true, y: 0, x: mx, labels: ['Menor, crescendo', 'Maior, crescendo', 'Menor, encolhendo', 'Maior, encolhendo'] },
          tooltip: { callbacks: { label: ctx => ` ${ctx.raw.label}: ${fUsdMi(ctx.raw.x)} · ${fPctS(ctx.raw.y)}` } } } } }, v => fPctS(v));
    c2.tableFmtX = v => fUsdMi(v);
  } else emptyCard(c2, 'Sem variação anual disponível.');

  // toxina x preenchedor
  const subs = CO.filter(c => c.isSub && S.empPais.has(c.pais));
  const parents = [...new Set(subs.map(c => c.parent))];
  const pick = (p, re) => { const x = subs.find(c => c.parent === p && re.test(norm(c.segmento + ' ' + c.empresa))); return x ? usdOf(x) : null; };
  const c3 = card(root, { title: 'Toxina × preenchedor nas líderes', q: 'Receita por linha de produto (US$ mi)', span: 4, legend: [{ kind: 'box', color: t.s1, label: 'Toxina / neuromodulador' }, { kind: 'box', color: t.s2, label: 'Preenchedor / bioestimulador' }] });
  if (parents.length) barChart(c3, { labels: parents.map(p => p.replace(/\s*\(.*\)$/, '')), fmt: v => fInt(v), labelsOn: true, datasets: [
    { label: 'Toxina', data: parents.map(p => pick(p, /toxina|neuromod|botox/)), backgroundColor: t.s1 },
    { label: 'Preenchedor', data: parents.map(p => pick(p, /hialur|preench|filler|juvederm/)), backgroundColor: t.s2 }] });
  else emptyCard(c3, 'Sem aberturas por produto.');

  // AbbVie
  const ab = S.M.abbvie.filter(a => inRange(a.ano) && g(a.tot) !== null);
  const c4 = card(root, { title: 'AbbVie: portfólio estético por ano', q: 'US$ milhões · total no topo', span: 4,
    legend: [{ kind: 'box', color: t.s1, label: 'Botox Cosmetic' }, { kind: 'box', color: t.s2, label: 'Juvéderm' }, { kind: 'box', color: t.s3, label: 'Outros' }], note: '2020 ausente (aquisição em maio/2020).' });
  if (ab.length) {
    barChart(c4, { labels: ab.map(a => String(a.ano)), stacked: true, fmt: v => fInt(v), datasets: [
      { label: 'Botox Cosmetic', data: ab.map(a => g(a.bg)), _derived: ab.map(a => a.bg.d), backgroundColor: t.s1 },
      { label: 'Juvéderm', data: ab.map(a => g(a.juv)), _derived: ab.map(a => a.juv.d), backgroundColor: t.s2 },
      { label: 'Outros', data: ab.map(a => g(a.out)), _derived: ab.map(a => a.out.d), backgroundColor: t.s3 }] });
    c4.chart.options.plugins.barLabels = { on: true, only: 2, fmt: (v, k) => fInt(g(ab[k].tot)) }; c4.chart.options.layout.padding.top = 18; c4.chart.update('none');
  } else emptyCard(c4, 'Sem anos completos no período.');

  const bx = S.M.abbvie.filter(a => inRange(a.ano) && (g(a.be) !== null || g(a.bi) !== null));
  const c5 = card(root, { title: 'Botox Cosmetic: EUA × internacional', q: 'US$ milhões · 2018–2019 só EUA', span: 4, legend: [{ kind: 'box', color: t.s2, label: 'EUA' }, { kind: 'box', color: t.s1, label: 'Internacional' }] });
  if (bx.length) barChart(c5, { labels: bx.map(a => String(a.ano)), stacked: true, fmt: v => fInt(v), datasets: [
    { label: 'EUA', data: bx.map(a => g(a.be)), _derived: bx.map(a => a.be.d), backgroundColor: t.s2 }, { label: 'Internacional', data: bx.map(a => g(a.bi)), backgroundColor: t.s1 }] });
  else emptyCard(c5, 'Sem abertura EUA/internacional no período.');

  // por país
  const byP = {}; withV.forEach(c => { byP[c.pais] = byP[c.pais] || { usd: 0, n: 0 }; byP[c.pais].usd += c.usd; byP[c.pais].n++; });
  const pk = Object.keys(byP).sort((a, b) => byP[b].usd - byP[a].usd);
  const c6 = card(root, { title: 'Receita listada por país de origem', q: 'Soma das receitas da tabela (US$ mi) · nº de empresas no rótulo', span: 6, height: 'short', note: 'Indicativo: mistura receitas de escopos diferentes (ex.: Ipsen = grupo inteiro).' });
  if (pk.length) barChart(c6, { labels: pk, horizontal: true, fmt: v => fInt(v), labelsOn: (v, k) => `${fInt(v)} · ${byP[pk[k]].n} emp.`, padRight: 100, datasets: [{ label: 'US$ mi', data: pk.map(p => byP[p].usd), backgroundColor: t.s1 }] });

  const cc = plainCard(root, { title: 'Concentração e lacunas', span: 6 });
  if (S.M.notes.concentracao) cc.append(el('p', { text: S.M.notes.concentracao }));
  const sem = top.filter(c => !isNum(c.usd));
  if (sem.length) { cc.append(el('p', { class: 'note', text: 'Empresas relevantes sem receita na base:' }));
    const tb = el('table', { class: 'data' }, el('thead', {}, el('tr', {}, el('th', { text: 'Empresa' }), el('th', { text: 'País' }), el('th', { text: 'Marcas' }), el('th', { text: 'Observação' }))));
    const b = el('tbody'); sem.forEach(c => b.append(el('tr', {}, el('td', { text: c.empresa }), el('td', { text: c.pais }), el('td', { text: c.marcas }), el('td', { text: c.obs })))); tb.append(b); cc.append(tb); }

  const ct = plainCard(root, { title: 'Tabela de empresas', span: 12 });
  const tt = el('table', { class: 'data' }, el('thead', {}, el('tr', {}, ...['Empresa', 'País', 'Marcas', 'Segmento', 'Métrica', 'Valor (orig.)', 'US$ mi', 'Ano', 'Var. a.a.', 'Observação'].map((h, i) => el('th', { class: [5, 6, 7, 8].includes(i) ? 'num' : '', text: h })))));
  const tb = el('tbody'); CO.filter(c => S.empPais.has(c.pais)).forEach(c => tb.append(el('tr', {}, el('td', { text: c.empresa }), el('td', { text: c.pais }), el('td', { text: c.marcas }), el('td', { text: c.segmento }), el('td', { text: c.metrica }),
    el('td', { class: 'num', text: isNum(g(c.valor)) ? `${fInt(g(c.valor))} ${c.moeda}` : '—' }), el('td', { class: 'num', text: fInt(usdOf(c)) }), el('td', { class: 'num', text: c.ano ?? '—' }), el('td', { class: 'num', text: fPctS(g(c.vr)) }), el('td', { text: c.obs }))));
  tt.append(tb); ct.append(el('div', { class: 'table-scroll' }, tt));
};

/* ---------------- 7. ANÁLISES CRUZADAS ---------------- */
PAGES.cross = (root) => {
  const t = T();
  const idxPair = (title, q, years, aObjs, bObjs, aLab, bLab, span = 6) => {
    const c = card(root, { title, q, span, legend: [{ color: t.s1, label: aLab }, { color: t.s2, label: bLab }],
      note: 'Poucos pontos: compare a direção, não faça correlação estatística.' });
    const bi = years.findIndex((y, i) => g(aObjs[i]) !== null && g(bObjs[i]) !== null);
    if (bi < 0) { emptyCard(c, 'Sem ano em comum no período.'); return; }
    c.el.querySelector('.q').textContent = `Índice ${years[bi]} = 100 · ${q}`;
    const ix = (objs) => objs.map(o => g(o) !== null ? V(g(o) / g(objs[bi]) * 100, o.d) : V(null));
    lineChart(c, { labels: years.map(String), fmt: v => fDec(v, 0), yExtra: { beginAtZero: false }, padRight: 110,
      datasets: [lineDS(aLab, ix(aObjs), 's1'), lineDS(bLab, ix(bObjs), 's2')] });
  };
  const yrs = [...new Set([...S.M.world.map(w => w.ano), ...S.M.abbvie.map(a => a.ano)])].filter(y => inRange(y) && y >= 2018).sort();
  const wOf = (y, k) => (S.M.world.find(w => w.ano === y) || {})[k] || V(null), aOf = (y, k) => (S.M.abbvie.find(a => a.ano === y) || {})[k] || V(null);
  idxPair('Toxina: volume ISAPS × receita do Botox Cosmetic', 'volume e receita andam juntos?', yrs, yrs.map(y => wOf(y, 'tox')), yrs.map(y => aOf(y, 'bg')), 'Volume ISAPS', 'Receita Botox');
  idxPair('Ácido hialurônico: volume ISAPS × receita do Juvéderm', 'volume sobe enquanto a receita cai = preço/concorrência', yrs, yrs.map(y => wOf(y, 'ah')), yrs.map(y => aOf(y, 'juv')), 'Volume ISAPS', 'Receita Juvéderm');

  // gasto implícito por procedimento não cirúrgico
  const mm = S.M.market.filter(m => /marketsandmarkets/i.test(m.cons) && /^Produtos/.test(m.grupo));
  const nearest = (rows, y, k) => { const ok = rows.filter(r => g(r[k]) !== null); if (!ok.length) return null; return ok.reduce((b, r) => Math.abs(r.ano - y) < Math.abs(b.ano - y) ? r : b); };
  const imp = [['Mundo', 'Global', S.M.world, 'nao'], ['EUA', 'EUA', S.M.countries, 'eua_nao'], ['Brasil', 'Brasil', S.M.countries, 'br_nao']].map(([n, geo, rows, k]) => {
    const m = mm.find(x => x.geo === geo && g(x.base) !== null); if (!m) return { n, v: null };
    const r = nearest(rows, m.anoBase, k); if (!r) return { n, v: null };
    return { n, v: g(m.base) * 1e9 / g(r[k]), why: `mercado ${m.anoBase} ÷ não cirúrgicos ${r.ano}` };
  });
  const c3 = card(root, { title: 'Gasto implícito em produto por procedimento não cirúrgico', q: 'Mercado de produtos (MarketsandMarkets) ÷ procedimentos não cirúrgicos (ISAPS)', span: 6, height: 'short',
    note: 'Ordem de grandeza: o mercado inclui aparelhos/implantes e a ISAPS não conta não médicos (no Brasil isso infla o valor). ' + imp.filter(x => x.why).map(x => `${x.n}: ${x.why}`).join(' · ') });
  const iv = imp.filter(x => isNum(x.v));
  if (iv.length) barChart(c3, { labels: iv.map(x => x.n), horizontal: true, fmt: v => fInt(v), labelsOn: v => 'US$ ' + fInt(v), padRight: 80, xExtra: { ticks: { maxRotation: 0, callback: v => fInt(v) } }, datasets: [{ label: 'US$ por procedimento', data: iv.map(x => x.v), backgroundColor: iv.map(x => col(GEO_COLOR[x.n])) }] });
  else emptyCard(c3, 'Faltam dados de mercado ou de não cirúrgicos.');

  // potencial de penetração
  const pr = compRow(/^procedimentos por 1\.000/), pop = compRow(/^populacao/), tot = compRow(/^procedimentos totais/);
  const cpot = plainCard(root, { title: 'Cenário: Brasil com outra taxa de penetração', q: 'Quantos procedimentos o Brasil faria com X procedimentos por 1.000 habitantes?', span: 6 });
  if (pr && pop && g(pop.br) && g(tot?.br)) {
    const ref = g(pr.eua) ?? 18; if (!isNum(S.potRate)) S.potRate = Math.round(ref * 10) / 10;
    const out = el('div'); const lab = el('b', { text: fDec(S.potRate, 1) });
    const rng = el('input', { type: 'range', min: 5, max: 40, step: .5, value: S.potRate, 'aria-label': 'Procedimentos por 1.000 habitantes' });
    const draw = () => {
      const atual = g(tot.br), cen = S.potRate * g(pop.br) * 1000; out.textContent = '';
      out.append(el('div', { class: 'grid', style: 'margin-top:10px' },
        el('div', { class: 'span-4 kpi' }, el('div', { class: 'lbl', text: `Atual (${tot.ano})` }), el('div', { class: 'val', text: fCompact(atual) }), el('div', { class: 'delta', text: `${fDec(g(pr.br), 1)} por 1.000 hab.` })),
        el('div', { class: 'span-4 kpi' }, el('div', { class: 'lbl', text: 'Cenário' }), el('div', { class: 'val', text: fCompact(cen) }), el('div', { class: 'delta', text: `${fDec(S.potRate, 1)} por 1.000 hab.` })),
        el('div', { class: 'span-4 kpi' }, el('div', { class: 'lbl', text: 'Diferença' }), el('div', { class: 'val', text: (cen >= atual ? '+' : '−') + fCompact(Math.abs(cen - atual)) }), el('div', { class: 'delta ' + (cen >= atual ? 'up' : 'down'), text: fPctS(cen / atual - 1, 0) }))));
    };
    rng.addEventListener('input', () => { S.potRate = +rng.value; lab.textContent = fDec(S.potRate, 1); draw(); });
    cpot.append(el('div', { class: 'range-row' }, el('span', { text: 'Taxa-alvo:' }), rng, lab,
      el('button', { class: 'btn small', text: `= EUA (${fDec(ref, 1)})`, onclick: () => { S.potRate = Math.round(ref * 10) / 10; rng.value = S.potRate; lab.textContent = fDec(S.potRate, 1); draw(); } })), out,
      el('div', { class: 'note', text: `População ${fDec(g(pop.br), 0)} mi (aprox.). Cenário hipotético — só procedimentos por cirurgiões plásticos.` }));
    draw();
  } else cpot.append(el('div', { class: 'empty', text: 'Indicadores de população/penetração não encontrados.' }));
};

/* ---------------- 8. METODOLOGIA & FONTES ---------------- */
PAGES.method = (root) => {
  const M = S.M;
  if (M.warnings.length) root.append(el('div', { class: 'alert span-12' }, el('b', { text: 'Avisos da leitura: ' }), M.warnings.join(' ')));
  // heatmap de cobertura
  const years = S.years;
  const rowsDef = [
    ['Mundo — total', y => (M.world.find(w => w.ano === y) || {}).tot], ['Mundo — cirúrgicos', y => (M.world.find(w => w.ano === y) || {}).cir],
    ['Mundo — não cirúrgicos', y => (M.world.find(w => w.ano === y) || {}).nao], ['Mundo — toxina', y => (M.world.find(w => w.ano === y) || {}).tox],
    ['Mundo — ácido hialurônico', y => (M.world.find(w => w.ano === y) || {}).ah], ['Mundo — % homens', y => (M.world.find(w => w.ano === y) || {}).hom],
    ['EUA — total', y => (M.countries.find(c => c.ano === y) || {}).eua_tot], ['EUA — cirúrgicos', y => (M.countries.find(c => c.ano === y) || {}).eua_cir],
    ['Brasil — total', y => (M.countries.find(c => c.ano === y) || {}).br_tot], ['Brasil — cirúrgicos', y => (M.countries.find(c => c.ano === y) || {}).br_cir],
    ['Brasil — ranking cirurgias', y => (M.countries.find(c => c.ano === y) || {}).rank_cir],
    ['Procedimentos (Mundo)', y => { const n = M.procs.filter(p => p.ano === y && p.escopo === 'Mundo').length; return n ? V(n) : V(null); }],
    ['Procedimentos (Brasil)', y => { const n = M.procs.filter(p => p.ano === y && p.escopo === 'Brasil').length; return n ? V(n) : V(null); }],
    ['AbbVie — Botox global', y => (M.abbvie.find(a => a.ano === y) || {}).bg], ['AbbVie — Juvéderm', y => (M.abbvie.find(a => a.ano === y) || {}).juv]];
  const hc = plainCard(root, { title: 'Mapa de cobertura dos dados', q: 'R = reportado pela fonte · D = derivado/estimado · vazio = sem dado. Nas linhas “Procedimentos”, o número é a quantidade de itens no ano.', span: 12 });
  const hg = el('div', { class: 'heat', style: `grid-template-columns: minmax(170px,auto) repeat(${years.length}, minmax(34px,1fr))` });
  hg.append(el('div', {}), ...years.map(y => el('div', { class: 'hhead', text: y })));
  rowsDef.forEach(([lab, f]) => { hg.append(el('div', { class: 'hrow', text: lab }));
    years.forEach(y => { const o = f(y); const isCount = lab.startsWith('Procedimentos'); const st = !o || !isNum(o.v) ? 'n' : o.d ? 'd' : 'r';
      hg.append(el('div', { class: 'hcell ' + st, title: `${lab} · ${y}: ${st === 'n' ? 'sem dado' : st === 'd' ? 'derivado' : 'reportado'}`, text: st === 'n' ? '' : isCount ? String(o.v) : st.toUpperCase() })); }); });
  hc.append(hg, legendEl([{ kind: 'box', color: T().s1, label: 'Reportado' }, { kind: 'box', color: T().s4, label: 'Derivado/estimado' }, { kind: 'box', color: getComputedStyle(document.documentElement).getPropertyValue('--neutral-cell'), label: 'Sem dado' }]));

  // % derivados por aba
  const ds = M.derivedStats.filter(d => d.tot).sort((a, b) => b.der / b.tot - a.der / a.tot);
  const c2 = card(root, { title: 'Valores derivados por aba', q: '% das células numéricas com fundo amarelo (derivado/estimado)', span: 6, height: 'short' });
  barChart(c2, { labels: ds.map(d => d.aba), horizontal: true, fmt: v => fPct(v, 0), labelsOn: (v, k) => `${fPct(v, 0)} (${ds[k].der}/${ds[k].tot})`, padRight: 90, xExtra: { suggestedMax: .3 },
    datasets: [{ label: '% derivado', data: ds.map(d => d.der / d.tot), backgroundColor: T().s4 }] });

  const cr = plainCard(root, { title: 'Ressalvas da base', q: M.notes.montagem || '', span: 6 });
  const ul = el('ul', { class: 'insights' }); M.ressalvas.forEach(r => ul.append(el('li', {}, el('b', { text: r.t + ' — ' }), r.d))); cr.append(ul);

  const cf = plainCard(root, { title: `Fontes (${M.fontes.length})`, q: 'IDs usados na coluna “Fonte” das outras abas', span: 12 });
  const search = el('input', { class: 'search', type: 'search', placeholder: 'Buscar fonte, ID ou domínio…', value: S.fontesQ });
  const tbody = el('tbody');
  const draw = () => { tbody.textContent = ''; const q = norm(S.fontesQ);
    M.fontes.filter(f => !q || norm(f.id + ' ' + f.desc + ' ' + f.url).includes(q)).forEach(f => {
      const link = /^https?:\/\//i.test(f.url) ? el('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer', text: f.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70) + (f.url.length > 78 ? '…' : '') }) : el('span', { text: f.url });
      tbody.append(el('tr', {}, el('td', { text: f.id }), el('td', { text: f.desc }), el('td', {}, link))); }); };
  search.addEventListener('input', () => { S.fontesQ = search.value; draw(); });
  cf.append(search, el('div', { class: 'table-scroll' }, el('table', { class: 'data' }, el('thead', {}, el('tr', {}, el('th', { text: 'ID' }), el('th', { text: 'Descrição' }), el('th', { text: 'Link' }))), tbody)));
  draw();
};

/* ---------------- BOOT + CARREGAR PLANILHA ---------------- */
const LS_KEY = 'dash_estetica_xlsx_v1';
function b64ToU8(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function u8ToB64(u8) { let s = ''; const ch = 0x8000; for (let i = 0; i < u8.length; i += ch) s += String.fromCharCode.apply(null, u8.subarray(i, i + ch)); return btoa(s); }

function loadWorkbook(u8, label) {
  const wb = parseXlsx(u8);
  const M = buildModel(wb);
  if (!M.world.length && !M.market.length && !M.companies.length) throw new Error('Nenhuma das abas esperadas foi reconhecida. ' + M.warnings.join(' '));
  S.M = M;
  S.years = [...new Set([...M.world.map(w => w.ano), ...M.countries.map(c => c.ano)])].sort((a, b) => a - b);
  S.from = S.years[0]; S.to = S.years[S.years.length - 1];
  S.procAno = null; S.mktCons = null; S.empPais = null; S.potRate = null;
  $('#srcStatus').textContent = label;
  rerender();
  return M;
}
function boot() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; } })();
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = (() => { try { return localStorage.getItem(LS_KEY + '_theme'); } catch (e) { return null; } })() || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  applyChartDefaults();
  let ok = false;
  if (saved && saved.b64) { try { loadWorkbook(b64ToU8(saved.b64), `Dados: ${saved.name} (carregado em ${saved.at})`); ok = true; } catch (e) { console.warn(e); } }
  if (!ok) loadWorkbook(b64ToU8(window.EMBEDDED_XLSX_B64), 'Dados: planilha original embutida (nov/2026)');

  $('#btnLoad').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    try {
      const u8 = new Uint8Array(await f.arrayBuffer());
      const at = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const M = loadWorkbook(u8, `Dados: ${f.name} (carregado em ${at})`);
      try { localStorage.setItem(LS_KEY, JSON.stringify({ b64: u8ToB64(u8), name: f.name, at })); } catch (e) {}
      toast(`Planilha “${f.name}” carregada: ${M.world.length} anos ISAPS, ${M.procs.length} procedimentos, ${M.market.length} estimativas, ${M.companies.length} empresas.` + (M.warnings.length ? `\nAvisos: ${M.warnings.join(' ')}` : ''), 7000);
    } catch (e) { console.warn(e); toast('Não consegui ler a planilha: ' + (/zip/i.test(e.message) ? 'o arquivo não é um .xlsx válido' : e.message) + '\nOs dados anteriores foram mantidos.', 8000); }
  });
  $('#btnReset').addEventListener('click', () => { try { localStorage.removeItem(LS_KEY); } catch (e) {} loadWorkbook(b64ToU8(window.EMBEDDED_XLSX_B64), 'Dados: planilha original embutida (nov/2026)'); toast('Dados originais restaurados.'); });
  $('#btnTheme').addEventListener('click', () => { const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n;
    try { localStorage.setItem(LS_KEY + '_theme', n); } catch (e) {} applyChartDefaults(); rerender(); });
}
document.addEventListener('DOMContentLoaded', boot);
