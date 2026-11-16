// RLML-karttatiedoston (markdown) jäsennys ja kirjoitus.
// Toimii sekä selaimessa (globaali KG) että Nodessa (require).
//
// Osiot:
//   map NIMI size LxK + koodilohko   ruudukko
//   legend:                         - <merkki> <TILE>
//   areas:                          - x,y size LxK as NIMI      (sama nimi useasti = yhdiste)
//   labels paper                    - level N | NIMI  [size N] [spacing wide|normal] [place land|water|center] [at x,y] [hide] [outline dotted]
//   text fi                         - NIMI "Näkyvä teksti"      (lainausmerkit vapaaehtoiset)
//   labels: (vanha)                 - x,y TEKSTI size N         -> muunnetaan alueiksi
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};

  const DEFAULT_LEGEND = [
    { ch: '~', spec: 'WATER', name: 'vesi' },
    { ch: '.', spec: 'GRASS', name: 'niitty' },
    { ch: ',', spec: 'SHRUBS', name: 'pensaikko' },
    { ch: 'T', spec: 'FOREST.conifer', name: 'havumetsä' },
    { ch: 'D', spec: 'FOREST.deciduous', name: 'lehtimetsä' },
    { ch: 'Y', spec: 'SAND with PALM', name: 'palmu' },
    { ch: '^', spec: 'MOUNTAIN', name: 'vuori' },
    { ch: 'n', spec: 'HILL', name: 'kukkula' },
    { ch: 'r', spec: 'RIVER', name: 'joki' },
    { ch: 'X', spec: 'GRASS with TREASURE', name: 'aarre' },
    { ch: 'K', spec: 'WATER with KRAKEN', name: 'kraken' },
  ];
  const TYPE_NAMES = {
    water: 'vesi', grass: 'niitty', shrubs: 'pensaikko', conifer: 'havumetsä', deciduous: 'lehtimetsä',
    palm: 'palmu', mountain: 'vuori', hill: 'kukkula', river: 'joki', treasure: 'aarre', kraken: 'kraken',
  };

  function typeOf(spec) {
    const s = String(spec || '').toUpperCase();
    if (s.includes('KRAKEN')) return 'kraken';
    if (s.includes('TREASURE')) return 'treasure';
    if (s.includes('PALM')) return 'palm';
    if (s.includes('RIVER')) return 'river';
    if (s.includes('MOUNTAIN')) return 'mountain';
    if (s.includes('HILL')) return 'hill';
    if (s.includes('DECIDUOUS')) return 'deciduous';
    if (s.includes('FOREST') || s.includes('CONIFER')) return 'conifer';
    if (s.includes('SHRUB') || s.includes('BUSH')) return 'shrubs';
    if (s.startsWith('WATER') || s.includes('SEA')) return 'water';
    return 'grass';
  }

  // Näkyvästä nimestä tunniste: "Synkkä syvä" -> SYNKKA_SYVA
  function toId(text) {
    const s = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return s || 'ALUE';
  }
  const ID_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

  function blankDoc(W, H) {
    return {
      title: 'KAPTEENI AALTOLAN KARTTA', name: 'MERIKARTTA', W, H,
      grid: Array.from({ length: H }, () => '~'.repeat(W)),
      legend: DEFAULT_LEGEND.map(e => Object.assign({}, e)),
      areas: [], rules: [], lang: 'fi', texts: {}, warnings: [],
    };
  }

  // "labels paper" -säännön jäsennys yhdeltä riviltä (ilman alun viivaa)
  function parseRule(body) {
    const tok = body.trim().split(/\s+/); const r = {};
    let i = 0;
    if (/^level$/i.test(tok[0])) { r.level = +tok[1]; i = 2; } else { r.name = tok[0]; i = 1; }
    for (; i < tok.length; i++) {
      const t = tok[i].toLowerCase();
      if (t === 'size') r.size = +tok[++i];
      else if (t === 'spacing') r.spacing = tok[++i].toLowerCase();
      else if (t === 'place') r.place = tok[++i].toLowerCase();
      else if (t === 'at') { const m = (tok[++i] || '').match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/); if (m) r.at = [+m[1], +m[2]]; }
      else if (t === 'hide') r.hide = true;
      else if (t === 'outline') r.outline = (tok[++i] || 'dotted').toLowerCase();
    }
    return r;
  }
  function ruleToString(r) {
    let s = r.name != null ? r.name : `level ${r.level}`;
    if (r.size != null) s += ` size ${r.size}`;
    if (r.spacing) s += ` spacing ${r.spacing}`;
    if (r.place) s += ` place ${r.place}`;
    if (r.at) s += ` at ${r.at[0]},${r.at[1]}`;
    if (r.hide) s += ' hide';
    if (r.outline) s += ` outline ${r.outline}`;
    return s;
  }
  // "text"-rivi: NIMI "teksti" tai NIMI teksti
  function parseText(body) {
    const m = body.trim().match(/^(\S+)\s+(?:"((?:[^"\\]|\\.)*)"|(.+?))\s*$/);
    if (!m) return null;
    return [m[1], m[2] != null ? m[2].replace(/\\(.)/g, '$1') : m[3]];
  }
  const quote = s => '"' + String(s).replace(/(["\\])/g, '\\$1') + '"';

  function parse(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const doc = { title: '', name: 'MAP', W: 0, H: 0, grid: [], legend: [], areas: [], rules: [], lang: 'fi', texts: {}, warnings: [] };
    const legacy = [];
    let section = null;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i], t = ln.trim();
      let m;
      if (!t) continue;
      if (!doc.title && !doc.W && (m = t.match(/^#\s+(.+)$/))) { doc.title = m[1].trim(); continue; }
      if ((m = t.match(/^map\s+(\S+)\s+size\s+(\d+)\s*x\s*(\d+)/i))) { doc.name = m[1]; doc.W = +m[2]; doc.H = +m[3]; section = null; continue; }
      if (t.startsWith('```')) {
        const rows = [];
        for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) rows.push(lines[i]);
        if (!doc.grid.length) doc.grid = rows;
        continue;
      }
      if (/^legend:$/i.test(t)) { section = 'legend'; continue; }
      if (/^areas:$/i.test(t)) { section = 'areas'; continue; }
      if (/^labels:$/i.test(t)) { section = 'legacy'; continue; }
      if (/^labels\s+paper$/i.test(t)) { section = 'rules'; continue; }
      if ((m = t.match(/^text\s+([a-z]{2,3})$/i))) { section = 'text'; doc.lang = m[1].toLowerCase(); continue; }
      if (!t.startsWith('-')) { section = 'other'; continue; }
      const body = t.slice(1).trim();
      if (section === 'legend' && (m = ln.match(/^\s*-\s(\S)\s+(.+?)\s*$/))) {
        const known = DEFAULT_LEGEND.find(e => e.ch === m[1] && e.spec === m[2]);
        doc.legend.push({ ch: m[1], spec: m[2], name: known ? known.name : TYPE_NAMES[typeOf(m[2])] });
      } else if (section === 'areas') {
        m = body.match(/^(\d+)\s*,\s*(\d+)\s+size\s+(\d+)\s*x\s*(\d+)\s+as\s+(\S+)$/i);
        if (m && ID_RE.test(m[5])) doc.areas.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], name: m[5] });
        else doc.warnings.push(`Alueriviä ei ymmärretty: ${t}`);
      } else if (section === 'rules') {
        if (body) doc.rules.push(parseRule(body));
      } else if (section === 'text') {
        const p = parseText(body); if (p) doc.texts[p[0]] = p[1]; else doc.warnings.push(`Tekstiriviä ei ymmärretty: ${t}`);
      } else if (section === 'legacy' && (m = body.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+(.+?)(?:\s+size\s+(\d+(?:\.\d+)?))?$/i))) {
        legacy.push({ x: +m[1], y: +m[2], text: m[3], size: m[4] ? +m[4] : null });
      }
    }
    if (!doc.legend.length) doc.legend = DEFAULT_LEGEND.map(e => Object.assign({}, e));
    if (!doc.H) doc.H = doc.grid.length;
    if (!doc.W) doc.W = doc.grid.reduce((a, r) => Math.max(a, r.length), 0);
    // vanha labels: -> yhden ruudun alue + sijainti tyyliin + teksti
    for (const l of legacy) {
      let id = toId(l.text), n = 2; while (doc.areas.some(a => a.name === id)) id = toId(l.text) + '_' + n++;
      doc.areas.push({ x: Math.max(0, Math.floor(l.x)), y: Math.max(0, Math.floor(l.y)), w: 1, h: 1, name: id });
      const r = { name: id, at: [l.x, l.y] }; if (l.size) r.size = l.size; doc.rules.push(r);
      doc.texts[id] = l.text;
    }
    if (legacy.length) doc.warnings.push(`Vanha labels:-osio muunnettiin ${legacy.length} alueeksi`);
    normalize(doc);
    return doc;
  }

  function normalize(doc) {
    const water = (doc.legend.find(e => typeOf(e.spec) === 'water') || { ch: '~' }).ch;
    const g = [];
    for (let j = 0; j < doc.H; j++) {
      const r = (doc.grid[j] || '');
      g.push(r.length >= doc.W ? r.slice(0, doc.W) : r + water.repeat(doc.W - r.length));
    }
    doc.grid = g;
    doc.areas = doc.areas || []; doc.rules = doc.rules || []; doc.texts = doc.texts || {}; doc.lang = doc.lang || 'fi';
    return doc;
  }

  function serialize(doc) {
    let s = '';
    if (doc.title) s += `# ${doc.title}\n\n`;
    s += `map ${doc.name || 'MAP'} size ${doc.W}x${doc.H}\n\n\`\`\`\n${doc.grid.join('\n')}\n\`\`\`\n\nlegend:\n`;
    for (const e of doc.legend) s += `- ${e.ch} ${e.spec}\n`;
    if (doc.areas && doc.areas.length) { s += '\nareas:\n'; for (const a of doc.areas) s += `- ${a.x},${a.y} size ${a.w}x${a.h} as ${a.name}\n`; }
    if (doc.rules && doc.rules.length) { s += '\nlabels paper\n'; for (const r of doc.rules) s += `- ${ruleToString(r)}\n`; }
    const tk = Object.keys(doc.texts || {});
    if (tk.length) { s += `\ntext ${doc.lang || 'fi'}\n`; for (const k of tk) s += `- ${k} ${quote(doc.texts[k])}\n`; }
    return s;
  }
  // Nimet-välilehden tekstikentät
  const rulesText = doc => (doc.rules || []).map(r => '- ' + ruleToString(r)).join('\n');
  const textsText = doc => Object.keys(doc.texts || {}).map(k => `- ${k} ${quote(doc.texts[k])}`).join('\n');
  function parseRulesText(t) { return t.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean).map(parseRule); }
  function parseTextsText(t) { const o = {}; for (const l of t.split('\n')) { const p = parseText(l.trim().replace(/^-\s*/, '')); if (p) o[p[0]] = p[1]; } return o; }

  function typeMap(doc) { const m = {}; for (const e of doc.legend) m[e.ch] = typeOf(e.spec); return m; }

  function resize(doc, W, H) {
    const water = (doc.legend.find(e => typeOf(e.spec) === 'water') || { ch: '~' }).ch;
    const g = [];
    for (let j = 0; j < H; j++) { const r = doc.grid[j] || ''; g.push(r.length >= W ? r.slice(0, W) : r + water.repeat(W - r.length)); }
    doc.W = W; doc.H = H; doc.grid = g;
    doc.areas = (doc.areas || []).filter(a => a.x < W && a.y < H).map(a => Object.assign(a, { w: Math.min(a.w, W - a.x), h: Math.min(a.h, H - a.y) }));
    return doc;
  }

  const api = { DEFAULT_LEGEND, TYPE_NAMES, typeOf, toId, ID_RE, parse, serialize, typeMap, blankDoc, normalize, resize, parseRule, ruleToString, parseText, rulesText, textsText, parseRulesText, parseTextsText };
  KG.rlml = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
