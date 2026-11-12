'use strict';
/* =========================================================================
   PARTE 1 — Leitura do .xlsx no navegador + modelo de dados
   ========================================================================= */

// ---------- utilidades ----------
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const isNum = v => typeof v === 'number' && isFinite(v);
const colToNum = s => { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };

// fundo amarelo = valor derivado/estimado (legenda da aba Leia-me)
function isYellowFill(rgb) {
  if (!rgb) return false;
  const h = rgb.length === 8 ? rgb.slice(2) : rgb;
  if (!/^[0-9a-f]{6}$/i.test(h)) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return r >= 230 && g >= 190 && b <= 215 && (r - b) >= 30;
}

// ---------- parser XLSX (OOXML) ----------
function parseXlsx(u8) {
  const files = fflate.unzipSync(u8);
  const dec = new TextDecoder('utf-8');
  const keyOf = p => Object.keys(files).find(k => k.toLowerCase() === p.toLowerCase());
  const xml = p => { const k = keyOf(p); return k ? new DOMParser().parseFromString(dec.decode(files[k]), 'application/xml') : null; };
  const byTag = (node, tag) => node ? Array.from(node.getElementsByTagName(tag)) : [];
  const attrEnds = (el, suffix) => { for (const a of el.attributes) if (a.name === suffix || a.name.endsWith(':' + suffix)) return a.value; return null; };

  // shared strings
  const ss = [];
  const sst = xml('xl/sharedStrings.xml');
  byTag(sst, 'si').forEach(si => {
    // ignora textos fonéticos (rPh)
    let t = '';
    byTag(si, 't').forEach(tn => { if (tn.parentNode.nodeName !== 'rPh') t += tn.textContent; });
    ss.push(t);
  });

  // estilos -> preenchimento
  const fills = [], xfFill = [];
  const st = xml('xl/styles.xml');
  if (st) {
    const fillsEl = byTag(st, 'fills')[0];
    byTag(fillsEl, 'fill').forEach(f => {
      const pf = byTag(f, 'patternFill')[0];
      const fg = byTag(f, 'fgColor')[0];
      fills.push(pf && pf.getAttribute('patternType') === 'solid' && fg ? (fg.getAttribute('rgb') || '') : '');
    });
    const cx = byTag(st, 'cellXfs')[0];
    byTag(cx, 'xf').forEach(x => xfFill.push(+(x.getAttribute('fillId') || 0)));
  }

  // workbook + relações
  const wbx = xml('xl/workbook.xml');
  if (!wbx) throw new Error('Arquivo não parece ser um .xlsx válido (xl/workbook.xml ausente).');
  const rels = {};
  byTag(xml('xl/_rels/workbook.xml.rels'), 'Relationship').forEach(r => rels[r.getAttribute('Id')] = r.getAttribute('Target'));

  const sheets = {};
  byTag(wbx, 'sheet').forEach(sh => {
    const name = sh.getAttribute('name');
    let target = rels[attrEnds(sh, 'id')];
    if (!target) return;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const doc = xml(target);
    if (!doc) return;
    const cells = new Map();
    let maxRow = 0, maxCol = 0;
    byTag(doc, 'c').forEach(c => {
      const ref = c.getAttribute('r'); if (!ref) return;
      const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) return;
      const col = colToNum(m[1]), row = +m[2];
      const t = c.getAttribute('t'); const s = +(c.getAttribute('s') || 0);
      const vEl = byTag(c, 'v')[0];
      const fEl = byTag(c, 'f')[0];
      const f = fEl && fEl.textContent ? fEl.textContent : null;
      let v = null;
      if (t === 's') v = vEl ? ss[+vEl.textContent] ?? null : null;
      else if (t === 'inlineStr') v = byTag(c, 't').map(x => x.textContent).join('');
      else if (t === 'str') v = vEl ? vEl.textContent : null;
      else if (t === 'b') v = vEl ? vEl.textContent === '1' : null;
      else if (t === 'e') v = null;
      else if (vEl && vEl.textContent !== '') { const n = Number(vEl.textContent); v = isFinite(n) ? n : vEl.textContent; }
      const fill = fills[xfFill[s]] || '';
      if (v === '' && f) v = null;
      if (v === null && !fill && !f) return;
      cells.set(row + ':' + col, { v, d: isYellowFill(fill), fill, f: v === null ? f : null });
      if (v !== null || f) { maxRow = Math.max(maxRow, row); maxCol = Math.max(maxCol, col); }
    });
    sheets[name] = { name, cells, maxRow, maxCol,
      get(r, c) { return cells.get(r + ':' + c) || null; },
      val(r, c) { const x = cells.get(r + ':' + c); return x ? x.v : null; } };
  });
  evalMissingFormulas(sheets);
  return sheets;
}

// ---------- avaliador de fórmulas (só para células sem valor em cache) ----------
// Excel/LibreOffice/Google Sheets gravam o resultado das fórmulas; alguns geradores (ex.: scripts) não.
// Cobre aritmética, referências (inclusive entre abas) e IF/IFERROR/ISNUMBER/AND/OR/SUM/ROUND/ABS.
function evalMissingFormulas(sheets) {
  const ERR = { err: true };
  const byName = {}; Object.values(sheets).forEach(s => byName[s.name.toLowerCase()] = s);
  const busy = new Set(); let failed = 0;
  function cellValue(sh, r, c) {
    const cell = sh.cells.get(r + ':' + c);
    if (!cell) return null;
    if (cell.v === null && cell.f) {
      const k = sh.name + '!' + r + ':' + c;
      if (busy.has(k)) return ERR;
      busy.add(k);
      let out; try { out = evaluate(cell.f, sh); } catch (e) { out = ERR; }
      busy.delete(k);
      if (out === ERR || out === null || out === undefined || (typeof out === 'number' && !isFinite(out))) { cell.f = null; failed++; return ERR; }
      cell.v = out; cell.f = null;
    }
    return cell.v;
  }
  function evaluate(src, sh) {
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|"((?:[^"]|"")*)"|((?:'[^']+'|[A-Za-z_][\w.]*)!)?\$?([A-Z]{1,3})\$?(\d+)(?![\w(])|([A-Za-z_][\w.]*)\s*\(|(<=|>=|<>|[-+*/^(),<>=&%]))/y;
    const toks = []; let i = 0; const s = src.replace(/^=/, '');
    while (i < s.length) {
      re.lastIndex = i; const m = re.exec(s);
      if (!m) { if (/^\s+$/.test(s.slice(i))) break; throw ERR; }
      i = re.lastIndex;
      if (m[1] !== undefined) toks.push({ t: 'n', v: parseFloat(m[1]) });
      else if (m[2] !== undefined) toks.push({ t: 's', v: m[2].replace(/""/g, '"') });
      else if (m[4] !== undefined) toks.push({ t: 'r', sh: m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, '') : null, c: colToNum(m[4]), r: +m[5] });
      else if (m[6] !== undefined) toks.push({ t: 'f', v: m[6].toUpperCase() });
      else toks.push({ t: 'o', v: m[7] });
    }
    let p = 0;
    const peek = () => toks[p], eat = v => { const x = toks[p]; if (!x || (v && x.v !== v)) throw ERR; p++; return x; };
    const N = x => { if (x === ERR) throw ERR; if (x === null || x === '') return 0; if (typeof x === 'boolean') return x ? 1 : 0; if (typeof x === 'number') return x; const n = Number(x); if (isFinite(n)) return n; throw ERR; };
    function expr() { let a = concat(); while (peek() && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v) && peek().t === 'o') { const o = eat().v, b = concat();
      a = o === '=' ? a == b : o === '<>' ? a != b : o === '<' ? N(a) < N(b) : o === '>' ? N(a) > N(b) : o === '<=' ? N(a) <= N(b) : N(a) >= N(b); } return a; }
    function concat() { let a = add(); while (peek() && peek().v === '&') { eat(); a = String(a ?? '') + String(add() ?? ''); } return a; }
    function add() { let a = mul(); while (peek() && peek().t === 'o' && (peek().v === '+' || peek().v === '-')) { const o = eat().v; const b = mul(); a = o === '+' ? N(a) + N(b) : N(a) - N(b); } return a; }
    function mul() { let a = pow(); while (peek() && peek().t === 'o' && (peek().v === '*' || peek().v === '/')) { const o = eat().v; const b = pow(); if (o === '/' && N(b) === 0) throw ERR; a = o === '*' ? N(a) * N(b) : N(a) / N(b); } return a; }
    function pow() { let a = unary(); while (peek() && peek().v === '^') { eat(); a = Math.pow(N(a), N(unary())); } return a; }
    function unary() { if (peek() && peek().t === 'o' && (peek().v === '-' || peek().v === '+')) { const o = eat().v; const v = unary(); return o === '-' ? -N(v) : N(v); }
      let v = prim(); if (peek() && peek().v === '%') { eat(); v = N(v) / 100; } return v; }
    function args() { const out = []; if (peek() && peek().v === ')') { eat(); return out; }
      for (;;) { const start = p; out.push({ start }); skipArg(); if (peek() && peek().v === ',') { eat(); continue; } eat(')'); return out; } }
    function skipArg() { let depth = 0; while (p < toks.length) { const x = toks[p]; if (x.t === 'f' || x.v === '(') depth++; else if (x.v === ')') { if (depth === 0) return; depth--; } else if (x.v === ',' && depth === 0) return; p++; } }
    function evalAt(start) { const save = p; p = start; let v; try { v = expr(); } catch (e) { v = ERR; } p = save; return v; }
    function prim() {
      const x = eat();
      if (x.t === 'n' || x.t === 's') return x.v;
      if (x.t === 'r') { const target = x.sh ? byName[x.sh.toLowerCase()] : sh; if (!target) throw ERR; const v = cellValue(target, x.r, x.c); if (v === ERR) throw ERR; return v; }
      if (x.t === 'o' && x.v === '(') { const v = expr(); eat(')'); return v; }
      if (x.t === 'f') {
        const A = args(); const after = p; const ev = k => { const v = evalAt(A[k].start); p = after; return v; };
        const fn = x.v.replace(/^_XLFN\./, '');
        if (fn === 'IF') { const c = ev(0); if (c === ERR) throw ERR; const v = (c && c !== 0) ? (A[1] ? ev(1) : true) : (A[2] ? ev(2) : false); if (v === ERR) throw ERR; return v; }
        if (fn === 'IFERROR') { const v = ev(0); if (v !== ERR && !(typeof v === 'number' && !isFinite(v))) return v; const w = ev(1); if (w === ERR) throw ERR; return w; }
        const vals = A.map((_, k) => ev(k));
        if (fn === 'ISNUMBER') return typeof vals[0] === 'number' && isFinite(vals[0]);
        if (vals.some(v => v === ERR)) throw ERR;
        if (fn === 'AND') return vals.every(Boolean);
        if (fn === 'OR') return vals.some(Boolean);
        if (fn === 'SUM') return vals.reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
        if (fn === 'ROUND') { const f = Math.pow(10, N(vals[1])); return Math.round(N(vals[0]) * f) / f; }
        if (fn === 'ABS') return Math.abs(N(vals[0]));
        throw ERR;
      }
      throw ERR;
    }
    const v = expr(); if (p < toks.length) throw ERR; return v;
  }
  Object.values(sheets).forEach(sh => sh.cells.forEach((cell, key) => { if (cell.v === null && cell.f) { const [r, c] = key.split(':').map(Number); cellValue(sh, r, c); } }));
  sheets.__formulaFailures = failed;
}

// ---------- leitura de tabelas por cabeçalho ----------
function findSheet(wb, name) {
  const n = norm(name);
  return Object.values(wb).find(s => norm(s.name) === n) || Object.values(wb).find(s => norm(s.name).includes(n)) || null;
}
function findHeaderRow(sh, firstCol, from = 1) {
  const n = norm(firstCol);
  for (let r = from; r <= sh.maxRow; r++) if (norm(sh.val(r, 1)) === n) return r;
  return -1;
}
function headerMap(sh, r) {
  const map = {};
  for (let c = 1; c <= sh.maxCol + 1; c++) { const v = sh.val(r, c); if (v !== null && v !== '') map[norm(v)] = c; }
  return map;
}
function colFinder(map) {
  return (...names) => {
    for (const n of names) { const k = norm(n); if (map[k]) return map[k]; }
    for (const n of names) { const k = norm(n); const hit = Object.keys(map).find(h => h.startsWith(k)); if (hit) return map[hit]; }
    return null;
  };
}
const toYear = v => { const n = parseInt(String(v ?? '').trim(), 10); return n >= 1990 && n <= 2100 && /^\s*\d{4}\s*$/.test(String(v)) ? n : null; };
const num = (sh, r, c) => { if (!c) return { v: null, d: false }; const x = sh.get(r, c); return { v: x && isNum(x.v) ? x.v : null, d: !!(x && x.d) }; };
const txt = (sh, r, c) => { if (!c) return ''; const v = sh.val(r, c); return v === null || v === undefined ? '' : String(v); };
const V = (v, d = false) => ({ v: isNum(v) ? v : null, d: !!d });
const has = o => o && isNum(o.v);
const sumV = (...xs) => xs.every(has) ? V(xs.reduce((a, x) => a + x.v, 0), xs.some(x => x.d)) : V(null);
const subV = (a, b) => has(a) && has(b) ? V(a.v - b.v, a.d || b.d) : V(null);
const divV = (a, b) => has(a) && has(b) && b.v !== 0 ? V(a.v / b.v, a.d || b.d) : V(null);

// ---------- modelo ----------
function buildModel(wb) {
  const warn = [];
  const formulaFailures = wb.__formulaFailures || 0; delete wb.__formulaFailures;
  const M = { world: [], countries: [], procs: [], market: [], mmSeries: [], companies: [], abbvie: [], comp: [], anvisa: [],
    fontes: [], ressalvas: [], notes: {}, derivedStats: [], warnings: warn, sheetNames: Object.keys(wb) };

  // ISAPS_Global
  let sh = findSheet(wb, 'ISAPS_Global');
  if (!sh) warn.push('Aba ISAPS_Global não encontrada.');
  else {
    const h = findHeaderRow(sh, 'Ano');
    const C = colFinder(headerMap(sh, h));
    const c = { cir: C('Cirúrgicos'), nao: C('Não cirúrgicos'), tot: C('Total'), vof: C('Var. % oficial ISAPS'), tox: C('Toxina botulínica'),
      ah: C('Ácido hialurônico'), hom: C('% procedimentos em homens'), tipo: C('Tipo do dado'), obs: C('Observações'), fonte: C('Fonte') };
    for (let r = h + 1; r <= sh.maxRow; r++) {
      const ano = toYear(sh.val(r, 1)); if (!ano) { if (norm(sh.val(r, 1)).startsWith('indicadores')) break; continue; }
      const cir = num(sh, r, c.cir), nao = num(sh, r, c.nao);
      let tot = num(sh, r, c.tot); const calc = sumV(cir, nao);
      if (!has(tot)) tot = calc; // total publicado: mantém a marcação da própria célula
      M.world.push({ ano, cir, nao, tot, varOf: num(sh, r, c.vof), tox: num(sh, r, c.tox), ah: num(sh, r, c.ah), hom: num(sh, r, c.hom),
        tipo: txt(sh, r, c.tipo), obs: txt(sh, r, c.obs), fonte: txt(sh, r, c.fonte) });
    }
    M.world.sort((a, b) => a.ano - b.ano);
    M.world.forEach((w, i) => { const p = M.world[i - 1]; w.varCalc = p && has(p.tot) && has(w.tot) ? V(w.tot.v / p.tot.v - 1, w.tot.d || p.tot.d) : V(null); });
  }
  const worldBy = y => M.world.find(w => w.ano === y);

  // Paises_EUA_Brasil
  sh = findSheet(wb, 'Paises_EUA_Brasil');
  if (!sh) warn.push('Aba Paises_EUA_Brasil não encontrada.');
  else {
    const h = findHeaderRow(sh, 'Ano');
    const C = colFinder(headerMap(sh, h));
    const c = { et: C('EUA total'), ec: C('EUA cirúrgicos'), bt: C('Brasil total'), bc: C('Brasil cirúrgicos'), bn: C('Brasil não cirúrgicos'),
      mt: C('Mundo total'), bp: C('Brasil % do mundo'), ep: C('EUA % do mundo'), rt: C('Ranking Brasil (total)'), rc: C('Ranking Brasil (cirurgias)'),
      obs: C('Observações'), fonte: C('Fonte') };
    for (let r = h + 1; r <= sh.maxRow; r++) {
      const ano = toYear(sh.val(r, 1)); if (!ano) { if (norm(sh.val(r, 1)).startsWith('indicadores')) break; continue; }
      const w = worldBy(ano);
      const eua_tot = num(sh, r, c.et), eua_cir = num(sh, r, c.ec), br_tot = num(sh, r, c.bt), br_cir = num(sh, r, c.bc);
      let br_nao = subV(br_tot, br_cir); if (!has(br_nao)) br_nao = num(sh, r, c.bn);
      let mundo = w ? w.tot : num(sh, r, c.mt);
      let br_pct = divV(br_tot, mundo); if (!has(br_pct)) br_pct = num(sh, r, c.bp);
      let eua_pct = divV(eua_tot, mundo); if (!has(eua_pct)) eua_pct = num(sh, r, c.ep);
      M.countries.push({ ano, eua_tot, eua_cir, eua_nao: subV(eua_tot, eua_cir), br_tot, br_cir, br_nao, mundo, br_pct, eua_pct,
        br_pct_cir: w ? divV(br_cir, w.cir) : V(null), br_eua: divV(br_tot, eua_tot),
        rank_tot: num(sh, r, c.rt), rank_cir: num(sh, r, c.rc), obs: txt(sh, r, c.obs), fonte: txt(sh, r, c.fonte) });
    }
    M.countries.sort((a, b) => a.ano - b.ano);
  }

  // Procedimentos
  sh = findSheet(wb, 'Procedimentos');
  if (!sh) warn.push('Aba Procedimentos não encontrada.');
  else {
    const h = findHeaderRow(sh, 'Ano');
    const C = colFinder(headerMap(sh, h));
    const c = { esc: C('Escopo'), tipo: C('Tipo'), proc: C('Procedimento'), rank: C('Ranking'), qtd: C('Quantidade'), vr: C('Var. % a.a. (reportada)', 'Var. %'), obs: C('Observação'), fonte: C('Fonte') };
    for (let r = h + 1; r <= sh.maxRow; r++) {
      const ano = toYear(sh.val(r, 1)); if (!ano) continue;
      const procRaw = txt(sh, r, c.proc).trim(); if (!procRaw) continue;
      M.procs.push({ ano, escopo: txt(sh, r, c.esc).trim() || 'Mundo', tipo: txt(sh, r, c.tipo).trim(), procRaw,
        proc: procRaw.replace(/\s*\(implante\)\s*$/i, ''), rank: num(sh, r, c.rank), qtd: num(sh, r, c.qtd), vr: num(sh, r, c.vr),
        obs: txt(sh, r, c.obs), fonte: txt(sh, r, c.fonte) });
    }
  }

  // Mercado_Projecoes
  sh = findSheet(wb, 'Mercado_Projecoes');
  if (!sh) warn.push('Aba Mercado_Projecoes não encontrada.');
  else {
    const h = findHeaderRow(sh, 'Consultoria');
    const C = colFinder(headerMap(sh, h));
    const c = { esc: C('Escopo'), geo: C('Geografia'), ab: C('Ano base'), vb: C('Valor base (US$ bi)', 'Valor base'), ap: C('Ano projeção'),
      vp: C('Valor projetado (US$ bi)', 'Valor projetado'), cr: C('CAGR reportado'), obs: C('Observação'), fonte: C('Fonte') };
    for (let r = h + 1; r <= sh.maxRow; r++) {
      const cons = txt(sh, r, 1).trim();
      if (!cons) { if (M.market.length) break; else continue; }
      const esc = txt(sh, r, c.esc).trim();
      const base = num(sh, r, c.vb), proj = num(sh, r, c.vp), ab = num(sh, r, c.ab).v, ap = num(sh, r, c.ap).v;
      const cagrCalc = has(base) && has(proj) && ab && ap && ap > ab ? V(Math.pow(proj.v / base.v, 1 / (ap - ab)) - 1) : V(null);
      M.market.push({ cons, escopo: esc, grupo: scopeGroup(esc), geo: txt(sh, r, c.geo).trim() || 'Global', anoBase: ab, base, anoProj: ap, proj,
        cagrRep: num(sh, r, c.cr), cagrCalc, obs: txt(sh, r, c.obs), fonte: txt(sh, r, c.fonte) });
    }
    // série histórica MarketsandMarkets
    const h2 = (() => { for (let r = h + 1; r <= sh.maxRow; r++) if (norm(sh.val(r, 1)) === 'ano' && norm(sh.val(r, 2)).startsWith('valor')) return r; return -1; })();
    if (h2 > 0) {
      const C2 = colFinder(headerMap(sh, h2));
      const cv = C2('Valor (US$ bi)', 'Valor'), ct = C2('Tipo'), cc = C2('Como foi obtido');
      for (let r = h2 + 1; r <= sh.maxRow; r++) {
        const ano = toYear(sh.val(r, 1)); if (!ano) continue;
        const v = num(sh, r, cv); const tipo = txt(sh, r, ct);
        if (/implic/i.test(tipo)) v.d = true;
        M.mmSeries.push({ ano, v, tipo, como: txt(sh, r, cc) });
      }
      M.mmSeries.sort((a, b) => a.ano - b.ano);
      const t = M.mmSeries.find(x => /mai|dez/i.test(x.como)); M.notes.mmRel = t ? t.como : '';
    }
  }

  // Empresas
  sh = findSheet(wb, 'Empresas');
  if (!sh) warn.push('Aba Empresas não encontrada.');
  else {
    const h = findHeaderRow(sh, 'Empresa');
    const C = colFinder(headerMap(sh, h));
    const c = { pais: C('País de origem'), sede: C('Sede'), marcas: C('Principais marcas estéticas', 'Principais marcas'), seg: C('Segmento'), met: C('Métrica'),
      val: C('Valor (mi)', 'Valor'), moeda: C('Moeda'), ano: C('Ano'), vr: C('Var. % a.a.'), obs: C('Observação'), fonte: C('Fonte') };
    for (let r = h + 1; r <= sh.maxRow; r++) {
      const emp = txt(sh, r, 1).trim();
      if (!emp) continue;
      if (!c.pais || (!sh.val(r, c.pais) && !sh.val(r, c.val))) { if (/concentra/i.test(emp)) M.notes.concentracao = emp; continue; }
      const sub = emp.includes(' — ') || emp.includes(' - ');
      M.companies.push({ empresa: emp, parent: sub ? emp.split(/ — | - /)[0].trim() : emp, isSub: sub, pais: txt(sh, r, c.pais).trim(), sede: txt(sh, r, c.sede),
        marcas: txt(sh, r, c.marcas), segmento: txt(sh, r, c.seg), metrica: txt(sh, r, c.met), valor: num(sh, r, c.val), moeda: txt(sh, r, c.moeda).trim(),
        ano: num(sh, r, c.ano).v, vr: num(sh, r, c.vr), obs: txt(sh, r, c.obs), fonte: txt(sh, r, c.fonte) });
    }
  }

  // AbbVie_Serie
  sh = findSheet(wb, 'AbbVie_Serie');
  if (!sh) warn.push('Aba AbbVie_Serie não encontrada.');
  else {
    const h = findHeaderRow(sh, 'Ano');
    const C = colFinder(headerMap(sh, h));
    const c = { be: C('Botox Cosmetic EUA'), bi: C('Botox Cosmetic Internacional'), bg: C('Botox Cosmetic Global'), juv: C('Juvéderm Global', 'Juvéderm'),
      out: C('Outros estética'), tot: C('Total estética'), ter: C('Botox Terapêutico (referência)', 'Botox Terapêutico'), obs: C('Observação') };
    for (let r = h + 1; r <= sh.maxRow; r++) {
      const ano = toYear(sh.val(r, 1)); if (!ano) continue;
      const be = num(sh, r, c.be), bi = num(sh, r, c.bi);
      let bg = num(sh, r, c.bg); if (!has(bg)) bg = sumV(be, bi);
      const juv = num(sh, r, c.juv), out = num(sh, r, c.out);
      let tot = num(sh, r, c.tot); if (!has(tot)) tot = sumV(bg, juv, out);
      M.abbvie.push({ ano, be, bi, bg, juv, out, tot, ter: num(sh, r, c.ter), obs: txt(sh, r, c.obs) });
    }
    M.abbvie.sort((a, b) => a.ano - b.ano);
  }

  // Brasil_Comparativo
  sh = findSheet(wb, 'Brasil_Comparativo');
  if (!sh) warn.push('Aba Brasil_Comparativo não encontrada.');
  else {
    const h = findHeaderRow(sh, 'Indicador');
    const C = colFinder(headerMap(sh, h));
    const c = { br: C('Brasil'), eua: C('EUA'), mu: C('Mundo'), ano: C('Ano'), obs: C('Observação') };
    for (let r = h + 1; r <= sh.maxRow; r++) {
      const ind = txt(sh, r, 1).trim();
      if (!ind) { if (M.comp.length) break; continue; }
      M.comp.push({ ind, key: norm(ind), br: num(sh, r, c.br), eua: num(sh, r, c.eua), mu: num(sh, r, c.mu), ano: txt(sh, r, c.ano), obs: txt(sh, r, c.obs) });
    }
    const hm = findHeaderRow(sh, 'Marca', h + 1);
    if (hm > 0) {
      const Cm = colFinder(headerMap(sh, hm));
      const cr = Cm('Registro Anvisa'), ce = Cm('Empresa / origem', 'Empresa'), co = Cm('Observação');
      for (let r = hm + 1; r <= sh.maxRow; r++) {
        const m = txt(sh, r, 1).trim(); if (!m) continue;
        if (!txt(sh, r, cr)) { M.notes.anvisa = m; continue; }
        M.anvisa.push({ marca: m, registro: txt(sh, r, cr), empresa: txt(sh, r, ce), obs: txt(sh, r, co) });
      }
    }
  }

  // Fontes
  sh = findSheet(wb, 'Fontes');
  if (sh) {
    const h = findHeaderRow(sh, 'ID');
    for (let r = h + 1; r <= sh.maxRow; r++) { const id = txt(sh, r, 1).trim(); if (id) M.fontes.push({ id, desc: txt(sh, r, 2), url: txt(sh, r, 3) }); }
  }

  // Leia-me (ressalvas)
  sh = findSheet(wb, 'Leia-me');
  if (sh) {
    const h = findHeaderRow(sh, 'RESSALVAS IMPORTANTES');
    if (h > 0) for (let r = h + 1; r <= sh.maxRow; r++) { const t = txt(sh, r, 1); if (t) M.ressalvas.push({ t, d: txt(sh, r, 2) }); }
    M.notes.montagem = txt(sh, 2, 1);
  }

  // % de valores derivados por aba (células numéricas da área de dados)
  // tabelas = blocos que começam numa linha de cabeçalho (fundo azul-escuro) e vão até a 1ª linha vazia na coluna A
  Object.values(wb).forEach(s => {
    if (/leia|fontes/i.test(norm(s.name))) return;
    let tot = 0, der = 0;
    for (let r = 1; r <= s.maxRow; r++) {
      const a = s.get(r, 1);
      const isHeader = a && a.fill && /1F3864$/i.test(a.fill);
      if (!isHeader) continue;
      const hm = headerMap(s, r);
      const skipCols = new Set(Object.entries(hm).filter(([k]) => /^ano/.test(k)).map(([, c]) => c));
      let rr = r + 1;
      for (; rr <= s.maxRow; rr++) {
        const lead = s.val(rr, 1);
        if (lead === null || lead === '') break;
        for (let c = 2; c <= s.maxCol; c++) {
          if (skipCols.has(c)) continue;
          const cell = s.get(rr, c);
          if (cell && isNum(cell.v)) { tot++; if (cell.d) der++; }
        }
      }
      r = rr;
    }
    if (tot) M.derivedStats.push({ aba: s.name, tot, der });
  });

  if (formulaFailures) warn.push(`${formulaFailures} fórmula(s) sem valor calculado não puderam ser avaliadas — abra e salve a planilha no Excel para gravar os resultados.`);
  if (!M.world.length) warn.push('Nenhum ano encontrado em ISAPS_Global — confira se o cabeçalho “Ano” está na coluna A.');
  return M;
}

function scopeGroup(esc) {
  const n = norm(esc);
  if (/gasto/.test(n)) return 'Gasto de pacientes';
  if (/neurotox/.test(n)) return 'Neurotoxinas';
  if (/servic|amplo|clinicas/.test(n)) return 'Amplo (inclui serviços)';
  if (/produto/.test(n) || n === 'estetica medica') return 'Produtos (injetáveis, aparelhos, implantes)';
  if (/dispositiv/.test(n)) return 'Dispositivos';
  return 'Produtos (injetáveis, aparelhos, implantes)';
}
