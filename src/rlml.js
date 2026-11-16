// RLML-karttatiedoston (markdown) jäsennys ja kirjoitus.
// Toimii sekä selaimessa (globaali KG) että Nodessa (require).
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};

  // Oletuslegenda: merkki, RLML-tile, nimi selitteessä ja paletissa
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

  // RLML-tilen kuvauksesta piirtotyyppi
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

  function blankDoc(W, H) {
    return {
      title: 'KAPTEENI AALTOLAN KARTTA', name: 'MERIKARTTA', W, H,
      grid: Array.from({ length: H }, () => '~'.repeat(W)),
      legend: DEFAULT_LEGEND.map(e => Object.assign({}, e)),
      labels: [],
    };
  }

  function parse(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const doc = { title: '', name: 'MAP', W: 0, H: 0, grid: [], legend: [], labels: [] };
    let i = 0, section = null;
    for (; i < lines.length; i++) {
      const ln = lines[i];
      const t = ln.trim();
      let m;
      if (!doc.title && (m = t.match(/^#\s+(.+)$/))) { doc.title = m[1].trim(); continue; }
      if ((m = t.match(/^map\s+(\S+)\s+size\s+(\d+)\s*x\s*(\d+)/i))) { doc.name = m[1]; doc.W = +m[2]; doc.H = +m[3]; section = null; continue; }
      if (t.startsWith('```')) {
        const rows = [];
        for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) rows.push(lines[i]);
        if (!doc.grid.length) doc.grid = rows;
        continue;
      }
      if (/^legend:\s*$/i.test(t)) { section = 'legend'; continue; }
      if (/^labels:\s*$/i.test(t)) { section = 'labels'; continue; }
      if (/^[a-z]+:\s*$/i.test(t)) { section = 'other'; continue; }
      if (section === 'legend' && (m = ln.match(/^\s*-\s(\S)\s+(.+?)\s*$/))) {
        const known = DEFAULT_LEGEND.find(e => e.ch === m[1] && e.spec === m[2]);
        doc.legend.push({ ch: m[1], spec: m[2], name: known ? known.name : TYPE_NAMES[typeOf(m[2])] });
        continue;
      }
      if (section === 'labels' && (m = t.match(/^-\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+(.+?)(?:\s+size\s+(\d+(?:\.\d+)?))?$/i))) {
        doc.labels.push({ x: +m[1], y: +m[2], text: m[3], size: m[4] ? +m[4] : 10 });
      }
    }
    if (!doc.legend.length) doc.legend = DEFAULT_LEGEND.map(e => Object.assign({}, e));
    if (!doc.H) doc.H = doc.grid.length;
    if (!doc.W) doc.W = doc.grid.reduce((a, r) => Math.max(a, r.length), 0);
    normalize(doc);
    return doc;
  }

  // Varmistaa että ruudukko on täsmälleen W×H; puuttuva täytetään vedellä
  function normalize(doc) {
    const water = (doc.legend.find(e => typeOf(e.spec) === 'water') || { ch: '~' }).ch;
    const g = [];
    for (let j = 0; j < doc.H; j++) {
      const r = (doc.grid[j] || '');
      g.push(r.length >= doc.W ? r.slice(0, doc.W) : r + water.repeat(doc.W - r.length));
    }
    doc.grid = g;
    return doc;
  }

  function serialize(doc) {
    let s = '';
    if (doc.title) s += `# ${doc.title}\n\n`;
    s += `map ${doc.name || 'MAP'} size ${doc.W}x${doc.H}\n\n\`\`\`\n${doc.grid.join('\n')}\n\`\`\`\n\nlegend:\n`;
    for (const e of doc.legend) s += `- ${e.ch} ${e.spec}\n`;
    if (doc.labels && doc.labels.length) {
      s += '\nlabels:\n';
      for (const l of doc.labels) s += `- ${l.x},${l.y} ${l.text}${l.size && l.size !== 10 ? ' size ' + l.size : ''}\n`;
    }
    return s;
  }

  function typeMap(doc) {
    const m = {};
    for (const e of doc.legend) m[e.ch] = typeOf(e.spec);
    return m;
  }

  function resize(doc, W, H) {
    const water = (doc.legend.find(e => typeOf(e.spec) === 'water') || { ch: '~' }).ch;
    const g = [];
    for (let j = 0; j < H; j++) {
      const r = doc.grid[j] || '';
      g.push(r.length >= W ? r.slice(0, W) : r + water.repeat(W - r.length));
    }
    doc.W = W; doc.H = H; doc.grid = g;
    doc.labels = doc.labels.filter(l => l.x < W && l.y < H);
    return doc;
  }

  const api = { DEFAULT_LEGEND, TYPE_NAMES, typeOf, parse, serialize, typeMap, blankDoc, normalize, resize };
  KG.rlml = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
