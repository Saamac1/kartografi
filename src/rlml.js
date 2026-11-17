// RLML-karttatiedostojen (markdown) jäsennys ja kirjoitus.
// Toimii sekä selaimessa (globaali KG) että Nodessa (require).
//
// Projekti on kolme RLML-tiedostoa (dataformaatit, luvut 8.11, 9.6 ja 10):
//   karttatiedosto   map NIMI size LxK, koodilohko, legend:, areas: (- X,Y size LxK as ALUE), at:, vars: …
//   tyylitiedosto    maps.theme paper      - KARTTA sea|cave|ship   (- default …)
//                    tiles.glyphs paper    - TILE [LAJI] [määreet] [decor]
//                    areas.labels paper    - level N | ALUE  [in KARTTA] [size N] [spacing …] [place …] [at x,y] [hide] [outline dotted]
//   kielitiedosto    language fi           KARTTA.NAME Näkyvä nimi / KARTTA.ALUE.NAME Alueen nimi
//
// Vanhat kokeilumuodot karttatiedoston sisällä (style paper, labels paper, tiles paper, text fi,
// legendin decor, labels:) luetaan edelleen ja kirjoitetaan uusiin muotoihin.
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
    { ch: 'K', spec: 'WATER with KRAKEN', name: 'kraken', decor: true },
    { ch: 'C', spec: 'CLIFF', name: 'rantakallio' },
    { ch: 's', spec: 'SAND', name: 'hiekkaranta' },
    { ch: 'h', spec: 'GRASS with HOUSE', name: 'rakennukset' },
    { ch: 'R', spec: 'GRASS with CASTLE_RUINS', name: 'linnan rauniot' },
    { ch: 'S', spec: 'ROCK with SKULL_CAVE', name: 'luurankoluola', decor: true },
    { ch: 'V', spec: 'VOLCANO', name: 'tulivuori', decor: true },
  ];
  const TYPE_NAMES = {
    water: 'vesi', grass: 'niitty', shrubs: 'pensaikko', conifer: 'havumetsä', deciduous: 'lehtimetsä',
    palm: 'palmu', mountain: 'vuori', hill: 'kukkula', river: 'joki', treasure: 'aarre', kraken: 'kraken',
    cliff: 'rantakallio', beach: 'hiekkaranta', building: 'rakennukset', ruins: 'linnan rauniot', skullcave: 'luurankoluola', volcano: 'tulivuori',
  };
  const STYLES = ['sea', 'cave', 'ship'];
  const tilesMod = () => KG.tiles || (typeof require !== 'undefined' ? (() => { try { return require('./tiles.js'); } catch (e) { return null; } })() : null);

  // Merikartan piirtotyyppi tilen kuvauksesta
  function typeOf(spec) {
    const s = String(spec || '').toUpperCase();
    if (s.includes('KRAKEN')) return 'kraken';
    if (s.includes('TREASURE')) return 'treasure';
    if (s.includes('VOLCANO')) return 'volcano';
    if (s.includes('SKULL')) return 'skullcave';
    if (s.includes('RUIN')) return 'ruins';
    if (s.includes('HOUSE') || s.includes('BUILDING')) return 'building';
    if (s.includes('PALM')) return 'palm';
    if (s.includes('RIVER')) return 'river';
    if (s.includes('MOUNTAIN')) return 'mountain';
    if (s.includes('HILL')) return 'hill';
    if (s.includes('DECIDUOUS')) return 'deciduous';
    if (s.includes('FOREST') || s.includes('CONIFER')) return 'conifer';
    if (s.includes('SHRUB') || s.includes('BUSH')) return 'shrubs';
    if (s.includes('CLIFF')) return 'cliff';
    if (s.startsWith('SAND') || s.includes('BEACH')) return 'beach';
    if (s.startsWith('WATER') || s.startsWith('SEA')) return 'water';
    return 'grass';
  }
  function toId(text) {
    const s = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return s || 'ALUE';
  }
  const ID_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

  const attach = (m, file) => { Object.defineProperty(m, 'file', { value: file, writable: true, enumerable: false, configurable: true }); return m; };
  function newMap(W, H, style) {
    return { title: '', hasHeading: false, name: 'MAP', style: style || 'sea', W, H, grid: [], legend: [], areas: [], rules: [], tileRules: [], lang: 'fi', texts: {}, at: [], atDecor: [], vars: {}, raw: [], warnings: [] };
  }
  function blankDoc(W, H) {
    const m = newMap(W, H, 'sea');
    m.title = 'KAPTEENI AALTOLAN KARTTA'; m.name = 'MERIKARTTA';
    m.grid = Array.from({ length: H }, () => '~'.repeat(W));
    m.legend = DEFAULT_LEGEND.map(e => Object.assign({}, e));
    const file = { title: m.title, preamble: [], maps: [m] }; attach(m, file);
    return m;
  }

  // ---- rivien jäsennys
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
      else if (t === 'in') r.map = tok[++i];
    }
    return r;
  }
  function ruleToString(r, withMap) {
    let s = r.name != null ? r.name : `level ${r.level}`;
    if (withMap && r.map) s += ` in ${r.map}`;
    if (r.size != null) s += ` size ${r.size}`;
    if (r.spacing) s += ` spacing ${r.spacing}`;
    if (r.place) s += ` place ${r.place}`;
    if (r.at) s += ` at ${r.at[0]},${r.at[1]}`;
    if (r.hide) s += ' hide';
    if (r.outline) s += ` outline ${r.outline}`;
    return s;
  }
  function parseText(body) {
    const m = body.trim().match(/^(\S+)\s+(?:"((?:[^"\\]|\\.)*)"|(.+?))\s*$/);
    if (!m) return null;
    return [m[1], m[2] != null ? m[2].replace(/\\(.)/g, '$1') : m[3]];
  }
  const quote = s => '"' + String(s).replace(/(["\\])/g, '\\$1') + '"';
  // legendarivi: "- x SPEC", "- ' ' SPEC", loppuun valinnainen decor
  function parseLegendLine(ln, style) {
    const m = ln.match(/^\s*-\s+(?:'(.)'|(\S))\s+(.+?)\s*$/); if (!m) return null;
    let spec = m[3], decor = false; const dm = spec.match(/^(.*?)\s+decor$/i); if (dm) { spec = dm[1]; decor = true; }
    const ch = m[1] != null ? m[1] : m[2];
    const known = DEFAULT_LEGEND.find(e => e.ch === ch && e.spec === spec);
    const e = { ch, spec, name: known ? known.name : (style && style !== 'sea' && tilesMod() ? tilesMod().nameOf(spec) : TYPE_NAMES[typeOf(spec)]) }; if (decor) e.decor = true;
    return e;
  }
  const legendLine = e => `- ${/\s/.test(e.ch) || e.ch === "'" ? `'${e.ch}'` : e.ch} ${e.spec}`;

  // ---- tiedosto
  function parseFile(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const file = { title: '', preamble: [], maps: [] };
    let m = null, section = null, pendingHeading = null, raw = null;
    const legacy = new Map();
    const closeRaw = () => { if (raw && m) { while (raw.lines.length && !raw.lines[raw.lines.length - 1].trim()) raw.lines.pop(); m.raw.push(raw); } raw = null; };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i], t = ln.trim(); let mm;
      if ((mm = t.match(/^##\s+(.+)$/))) { closeRaw(); section = null; pendingHeading = mm[1].trim(); continue; }
      if (!file.title && !file.maps.length && !m && (mm = t.match(/^#\s+(.+)$/))) { file.title = mm[1].trim(); continue; }
      if ((mm = t.match(/^map\s+(\S+)\s+size\s+(\d+)\s*x\s*(\d+)/i))) {
        closeRaw(); section = null;
        m = newMap(+mm[2], +mm[3]); m.name = mm[1]; attach(m, file);
        if (pendingHeading) { m.title = pendingHeading; m.hasHeading = true; } else m.title = file.title;
        pendingHeading = null; file.maps.push(m); legacy.set(m, []); continue;
      }
      if (!m) { if (pendingHeading && !t) continue; if (pendingHeading) { file.preamble.push('## ' + pendingHeading, ''); pendingHeading = null; } file.preamble.push(ln); continue; }
      if ((mm = t.match(/^style\s+paper\s+(\w+)$/i))) { closeRaw(); m.style = STYLES.includes(mm[1].toLowerCase()) ? mm[1].toLowerCase() : 'sea'; m.styleSet = true; section = null; continue; }
      if (t.startsWith('```')) {
        closeRaw(); const rows = [];
        for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) rows.push(lines[i]);
        if (!m.grid.length) m.grid = rows; section = null;
        continue;
      }
      if (raw) { if (!t || t.startsWith('-')) { raw.lines.push(ln); continue; } closeRaw(); }
      if (!t) continue;
      if (/^legend:$/i.test(t)) { section = 'legend'; continue; }
      if (/^areas:$/i.test(t)) { section = 'areas'; continue; }
      if (/^labels:$/i.test(t)) { section = 'legacy'; continue; }
      if (/^labels\s+paper$/i.test(t)) { section = 'rules'; continue; }
      if (/^tiles\s+paper$/i.test(t)) { section = 'tiles'; continue; }
      if ((mm = t.match(/^text\s+([a-z]{2,3})$/i))) { section = 'text'; m.lang = mm[1].toLowerCase(); continue; }
      if (!t.startsWith('-')) { section = null; raw = { head: ln, lines: [] }; parseKnownRaw(m, ln, lines, i); continue; }
      const body = t.slice(1).trim();
      if (section === 'legend') { const e = parseLegendLine(ln, m.style); if (e) m.legend.push(e); else m.warnings.push(`Legendariviä ei ymmärretty: ${t}`); }
      else if (section === 'areas') {
        mm = body.match(/^(\d+)\s*,\s*(\d+)\s+size\s+(\d+)\s*x\s*(\d+)\s+as\s+(\S+)$/i);
        if (mm && ID_RE.test(mm[5])) m.areas.push({ x: +mm[1], y: +mm[2], w: +mm[3], h: +mm[4], name: mm[5] });
        else m.warnings.push(`Alueriviä ei ymmärretty: ${t}`);
      } else if (section === 'rules') { if (body) m.rules.push(parseRule(body)); }
      else if (section === 'tiles') { const tk = body.split(/\s+/); if (tk[0]) m.tileRules.push({ tile: tk[0], kind: (tk[1] || 'floor').toLowerCase(), opts: tk.slice(2) }); }
      else if (section === 'text') { const p = parseText(body); if (p) m.texts[p[0]] = p[1]; else m.warnings.push(`Tekstiriviä ei ymmärretty: ${t}`); }
      else if (section === 'legacy' && (mm = body.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+(.+?)(?:\s+size\s+(\d+(?:\.\d+)?))?$/i))) legacy.get(m).push({ x: +mm[1], y: +mm[2], text: mm[3], size: mm[4] ? +mm[4] : null });
    }
    closeRaw();
    if (!file.maps.length) { const b = blankDoc(16, 10); attach(b, file); file.maps.push(b); b.warnings.push('Tiedostossa ei ollut karttaa'); }
    for (const map of file.maps) {
      if (!map.legend.length) map.legend = DEFAULT_LEGEND.map(e => Object.assign({}, e));
      if (!map.H) map.H = map.grid.length;
      if (!map.W) map.W = map.grid.reduce((a, r) => Math.max(a, r.length), 0);
      const lg = legacy.get(map) || [];
      for (const l of lg) {
        let id = toId(l.text), n = 2; while (map.areas.some(a => a.name === id)) id = toId(l.text) + '_' + n++;
        map.areas.push({ x: Math.max(0, Math.floor(l.x)), y: Math.max(0, Math.floor(l.y)), w: 1, h: 1, name: id });
        const r = { name: id, at: [l.x, l.y] }; if (l.size) r.size = l.size; map.rules.push(r);
        map.texts[id] = l.text;
      }
      if (lg.length) map.warnings.push(`Vanha labels:-osio muunnettiin ${lg.length} alueeksi`);
      normalize(map);
    }
    while (file.preamble.length && !file.preamble[file.preamble.length - 1].trim()) file.preamble.pop();
    while (file.preamble.length && !file.preamble[0].trim()) file.preamble.shift();
    return file;
  }
  // at:- ja vars:-osioista luetaan tiedot piirtoa varten; teksti säilyy raw-lohkona
  function parseKnownRaw(m, head, lines, i) {
    const h = head.trim().toLowerCase();
    for (let k = i + 1; k < lines.length; k++) {
      const t = lines[k].trim(); if (!t) { if (k + 1 < lines.length && lines[k + 1].trim().startsWith('-')) continue; break; }
      if (!t.startsWith('-')) break;
      const b = t.slice(1).trim(); let mm;
      if (h === 'at:' && (mm = b.match(/^(\d+)\s*,\s*(\d+)\s+(as|with)\s+(\S+)/i))) m.at.push({ x: +mm[1], y: +mm[2], [mm[3].toLowerCase()]: mm[4] });
      else if (h === 'vars:' && (mm = b.match(/^(\S+)\s+(.+)$/))) m.vars[mm[1]] = mm[2];
    }
  }

  function normalize(doc) {
    const water = doc.style && doc.style !== 'sea' ? ((doc.vars && doc.vars.EDGE) ? edgeChar(doc) : ' ') : (doc.legend.find(e => typeOf(e.spec) === 'water') || { ch: '~' }).ch;
    const g = [];
    for (let j = 0; j < doc.H; j++) { const r = (doc.grid[j] || ''); g.push(r.length >= doc.W ? r.slice(0, doc.W) : r + water.repeat(doc.W - r.length)); }
    doc.grid = g;
    for (const k of ['areas', 'rules', 'tileRules', 'at', 'raw', 'warnings']) doc[k] = doc[k] || [];
    doc.texts = doc.texts || {}; doc.vars = doc.vars || {}; doc.atDecor = doc.atDecor || []; doc.lang = doc.lang || 'fi'; doc.style = doc.style || 'sea';
    return doc;
  }
  function edgeChar(doc) { const e = doc.legend.find(l => l.spec.split(/\s+/)[0] === doc.vars.EDGE); return e ? e.ch : ' '; }
  // oletuspala, jolla tyhjät kohdat täytetään (vesi, meri tai kallio)
  function fillChar(doc) {
    if (doc.style === 'sea' || !doc.style) { const e = doc.legend.find(l => typeOf(l.spec) === 'water'); return e ? e.ch : '~'; }
    if (doc.vars && doc.vars.EDGE) return edgeChar(doc);
    const e = doc.legend.find(l => /^(SEA|WATER|WALL|ROCK)\b/i.test(l.spec)); return e ? e.ch : ' ';
  }

  function serializeMap(m) {
    let s = '';
    if (m.hasHeading) s += `## ${m.title}\n\n`;
    s += `map ${m.name || 'MAP'} size ${m.W}x${m.H}\n`;
    s += `\n\`\`\`\n${m.grid.join('\n')}\n\`\`\`\n\nlegend:\n`;
    for (const e of m.legend) s += legendLine(e) + '\n';
    for (const r of m.raw || []) s += `\n${r.head}\n${r.lines.join('\n')}${r.lines.length ? '\n' : ''}`;
    if (m.areas && m.areas.length) { s += '\nareas:\n'; for (const a of m.areas) s += `- ${a.x},${a.y} size ${a.w}x${a.h} as ${a.name}\n`; }
    return s;
  }
  function serializeFile(file) {
    const first = file.maps[0], title = first && !first.hasHeading ? first.title : file.title;
    let s = title ? `# ${title}\n\n` : '';
    if (file.preamble.length) s += file.preamble.join('\n') + '\n\n';
    s += file.maps.map(serializeMap).join('\n');
    return s;
  }
  // ---- projekti: karttatiedosto + tyylitiedosto (paper) + kielitiedosto
  const SEA_KINDS = ['water', 'grass', 'shrubs', 'conifer', 'deciduous', 'palm', 'mountain', 'hill', 'river', 'treasure', 'kraken', 'cliff', 'beach', 'building', 'ruins', 'skullcave', 'volcano'];
  const DUNGEON_KINDS = ['solid', 'floor', 'void', 'door', 'stairs', 'exit'];
  const STYLE_HEAD = /^(maps\.theme|tiles\.glyphs|areas\.labels)\s+paper\s*$/i;
  // tiedoston laji sisällöstä: ensimmäinen määrittely ratkaisee kielitiedoston (luku 10)
  function kindOfText(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    let inCode = false;
    for (const ln of lines) { const t = ln.trim(); if (t.startsWith('```')) { inCode = !inCode; continue; } if (inCode || !t || t.startsWith('#') || t.startsWith('>') || /^namespace\s/i.test(t)) continue; if (/^language\s+[a-z]{2,3}$/i.test(t)) return 'lang'; break; }
    if (/^map\s+\S+/im.test(text)) return 'map';
    if (lines.some(l => STYLE_HEAD.test(l.trim()))) return 'style';
    return 'map';
  }
  function parseStyle(text) {
    const st = { themes: {}, glyphs: [], labels: [], other: [] };
    let sec = null, other = null;
    const closeOther = () => { if (other) { while (other.length && !other[other.length - 1].trim()) other.pop(); st.other.push(other.join('\n')); } other = null; };
    let inCode = false;
    for (const ln of String(text).replace(/\r/g, '').split('\n')) {
      const t = ln.trim(); let mm;
      if (t.startsWith('```')) { inCode = !inCode; if (other) other.push(ln); continue; }
      if (inCode) { if (other) other.push(ln); continue; }
      if ((mm = t.match(STYLE_HEAD))) { closeOther(); sec = mm[1].toLowerCase(); continue; }
      if (!t || t.startsWith('#') || t.startsWith('>')) { if (other) other.push(ln); continue; }
      if (!t.startsWith('-')) { closeOther(); sec = null; other = [ln]; continue; }
      if (other) { other.push(ln); continue; }
      const body = t.slice(1).trim(), tk = body.split(/\s+/);
      if (sec === 'maps.theme') { if (tk[0] && STYLES.includes((tk[1] || '').toLowerCase())) st.themes[tk[0]] = tk[1].toLowerCase(); }
      else if (sec === 'tiles.glyphs') { if (!tk[0]) continue; const g = { tile: tk[0], kind: null, opts: [], decor: false }; let rest = tk.slice(1);
        if (rest[0] && (DUNGEON_KINDS.includes(rest[0].toLowerCase()) || SEA_KINDS.includes(rest[0].toLowerCase()))) { g.kind = rest[0].toLowerCase(); rest = rest.slice(1); }
        g.decor = rest.some(x => x.toLowerCase() === 'decor'); g.opts = rest.filter(x => x.toLowerCase() !== 'decor'); st.glyphs.push(g); }
      else if (sec === 'areas.labels') { if (body) st.labels.push(parseRule(body)); }
    }
    closeOther();
    return st;
  }
  function parseLang(text) {
    const out = { lang: 'fi', keys: {} }; let inCode = false;
    for (const ln of String(text).replace(/\r/g, '').split('\n')) {
      const t = ln.trim(); let mm; if (t.startsWith('```')) { inCode = !inCode; continue; } if (inCode || !t || t.startsWith('>') || t.startsWith('#')) continue;
      if ((mm = t.match(/^language\s+([a-z]{2,3})$/i))) { out.lang = mm[1].toLowerCase(); continue; }
      if ((mm = t.match(/^([A-Z_][A-Za-z0-9_.]*)\s+(.+)$/))) out.keys[mm[1]] = mm[2];
    }
    return out;
  }
  // tilen nimen haku kuten tilen ominaisuuksissa: tarkin nimi, sitten perusnimi
  const glyphFor = (rows, name) => { const parts = String(name).split('.'); for (let n = parts.length; n > 0; n--) { const k = parts.slice(0, n).join('.'); const r = rows.find(g => g.tile === k); if (r) return r; } return null; };
  // at:-rivien sijoitettujen kohteiden juurinimet (with CREW.MATE → CREW)
  const atRoots = m => [...new Set((m.at || []).filter(a => a.with).map(a => a.with.split('.')[0].toUpperCase()))];
  const specNames = spec => { const tk = String(spec).split(/\s+/), out = [tk[0]]; for (let i = 1; i < tk.length; i++) if (tk[i].toLowerCase() === 'with') { for (i++; i < tk.length && !/^(as|wire|with)$/i.test(tk[i]); i++) if (/^[A-Z]/.test(tk[i])) out.push(tk[i]); i--; } return out; };
  function applyStyle(file, st) {
    for (const m of file.maps) {
      const th = st.themes[m.name] || st.themes.default; if (th) { m.style = th; m.styleSet = true; }
      for (const e of m.legend) { const names = specNames(e.spec); if (names.some(n => { const g = glyphFor(st.glyphs, n); return g && g.decor; })) e.decor = true; }
      // at:-rivein sijoitetut kohteet (with CREW.MATE): decor juurinimelle (CREW) jättää ne pois selitteestä
      const roots = atRoots(m); m.atDecor = m.atDecor || [];
      for (const g of st.glyphs) { const r = g.tile.toUpperCase(); if (g.decor && roots.includes(r) && !m.atDecor.includes(r)) m.atDecor.push(r); }
      const tr = st.glyphs.filter(g => g.kind).map(g => ({ tile: g.tile, kind: g.kind, opts: g.opts.slice() }));
      if (tr.length) { const have = new Set(tr.map(r => r.tile)); m.tileRules = tr.concat((m.tileRules || []).filter(r => !have.has(r.tile))); }
      const rules = st.labels.filter(r => !r.map || r.map === m.name).map(r => { const o = Object.assign({}, r); delete o.map; return o; });
      if (rules.length) m.rules = (m.rules || []).concat(rules);
      if (m.style !== 'sea' || m.styleSet) refreshNames(m);
    }
    file.styleOther = (file.styleOther || []).concat(st.other);
  }
  function applyLang(file, L) {
    const maps = file.maps.slice().sort((a, b) => b.name.length - a.name.length), used = new Set();
    for (const k of Object.keys(L.keys)) {
      if (!k.endsWith('.NAME')) continue; const stem = k.slice(0, -5);
      const m = maps.find(x => stem === x.name || stem.startsWith(x.name + '.')); if (!m) continue;
      used.add(k);
      if (stem === m.name) { m.title = L.keys[k]; m.hasHeading = m.hasHeading || file.maps.length > 1; }
      else { m.texts[stem.slice(m.name.length + 1)] = L.keys[k]; }
      m.lang = L.lang;
    }
    file.lang = L.lang;
    file.langOther = (file.langOther || []).concat(Object.keys(L.keys).filter(k => !used.has(k)).map(k => `${k} ${L.keys[k]}`));
  }
  // texts: tiedostojen sisällöt missä järjestyksessä tahansa (kartta, tyyli, kieli)
  function parseProject(texts) {
    const list = (Array.isArray(texts) ? texts : [texts]).filter(t => t && String(t).trim());
    const maps = list.filter(t => kindOfText(t) === 'map'), styles = list.filter(t => kindOfText(t) === 'style'), langs = list.filter(t => kindOfText(t) === 'lang');
    const file = parseFile(maps[0] || '');
    for (const extra of maps.slice(1)) { const f2 = parseFile(extra); for (const m of f2.maps) { attach(m, file); file.maps.push(m); } }
    file.styleOther = []; file.langOther = []; file.lang = file.maps[0].lang || 'fi';
    for (const t of styles) applyStyle(file, parseStyle(t));
    for (const t of langs) applyLang(file, parseLang(t));
    return file;
  }
  function serializeStyle(file) {
    const maps = file.maps, multi = maps.length > 1; let s = '';
    const themed = maps.filter(m => m.styleSet || m.style !== 'sea');
    if (themed.length) { s += 'maps.theme paper\n'; for (const m of themed) s += `- ${m.name} ${m.style}\n`; }
    const rows = new Map();
    for (const m of maps) for (const r of m.tileRules || []) if (!rows.has(r.tile)) rows.set(r.tile, [r.tile, r.kind].concat(r.opts || []));
    const decorRow = n => { if (rows.has(n)) { if (!rows.get(n).includes('decor')) rows.get(n).push('decor'); } else rows.set(n, [n, 'decor']); };
    for (const m of maps) for (const e of m.legend) if (e.decor) { const names = specNames(e.spec); decorRow(names[names.length - 1]); }
    for (const m of maps) for (const n of m.atDecor || []) decorRow(n);
    if (rows.size) { s += (s ? '\n' : '') + 'tiles.glyphs paper\n'; for (const r of rows.values()) s += `- ${r.join(' ')}\n`; }
    const lab = []; for (const m of maps) for (const r of m.rules || []) lab.push('- ' + ruleToString(Object.assign({}, r, { map: multi ? m.name : null }), true));
    if (lab.length) s += (s ? '\n' : '') + 'areas.labels paper\n' + lab.join('\n') + '\n';
    for (const o of file.styleOther || []) s += (s ? '\n' : '') + o + '\n';
    if (!s) return '';
    return `# ${file.title || (maps[0] && maps[0].title) || 'Kartat'}: paperikartan tyyli\n\n` + s;
  }
  function serializeLang(file) {
    const lang = file.lang || (file.maps[0] && file.maps[0].lang) || 'fi', lines = [];
    for (const m of file.maps) {
      if (m.title && (m.hasHeading || file.maps.length === 1)) lines.push(`${m.name}.NAME ${m.title}`);
      for (const k of Object.keys(m.texts || {})) lines.push(`${m.name}.${k}.NAME ${m.texts[k]}`);
    }
    for (const o of file.langOther || []) lines.push(o);
    return lines.length ? `language ${lang}\n` + lines.join('\n') + '\n' : '';
  }
  function serializeProject(file) { return { map: serializeFile(file), style: serializeStyle(file), lang: serializeLang(file) }; }

  // yksittäisen kartan rajapinta (vanhat kutsut): ensimmäinen kartta, tiedosto mukana
  function parse(text) { return parseFile(text).maps[0]; }
  function serialize(doc) {
    if (doc.file && doc.file.maps.includes(doc)) return serializeFile(doc.file);
    return serializeFile({ title: doc.title, preamble: [], maps: [doc] });
  }

  const rulesText = doc => (doc.rules || []).map(r => '- ' + ruleToString(r)).join('\n');
  const textsText = doc => Object.keys(doc.texts || {}).map(k => `- ${k} ${quote(doc.texts[k])}`).join('\n');
  function parseRulesText(t) { return t.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean).map(parseRule); }
  function parseTextsText(t) { const o = {}; for (const l of t.split('\n')) { const p = parseText(l.trim().replace(/^-\s*/, '')); if (p) o[p[0]] = p[1]; } return o; }

  // palojen nimet kartan tyylin mukaan (tyylin vaihtuessa)
  function refreshNames(doc) { for (const e of doc.legend) { const known = DEFAULT_LEGEND.find(d => d.ch === e.ch && d.spec === e.spec); e.name = known && doc.style === 'sea' ? known.name : (doc.style !== 'sea' && tilesMod() ? tilesMod().nameOf(e.spec) : TYPE_NAMES[typeOf(e.spec)]); } }
  function typeMap(doc) { const m = {}; for (const e of doc.legend) { const r = glyphFor(doc.tileRules || [], specNames(e.spec)[0]); m[e.ch] = r && SEA_KINDS.includes(r.kind) ? r.kind : typeOf(e.spec); } return m; }

  function resize(doc, W, H) {
    const fc = fillChar(doc), g = [];
    for (let j = 0; j < H; j++) { const r = doc.grid[j] || ''; g.push(r.length >= W ? r.slice(0, W) : r + fc.repeat(W - r.length)); }
    doc.W = W; doc.H = H; doc.grid = g;
    doc.areas = (doc.areas || []).filter(a => a.x < W && a.y < H).map(a => Object.assign(a, { w: Math.min(a.w, W - a.x), h: Math.min(a.h, H - a.y) }));
    return doc;
  }

  const api = { atRoots, specNames, parseProject, serializeProject, serializeStyle, serializeLang, parseStyle, parseLang, kindOfText, SEA_KINDS, DUNGEON_KINDS, attach, refreshNames, DEFAULT_LEGEND, TYPE_NAMES, STYLES, typeOf, toId, ID_RE, parse, parseFile, serialize, serializeFile, serializeMap, typeMap, blankDoc, newMap, normalize, resize, fillChar, parseRule, ruleToString, parseText, parseLegendLine, legendLine, rulesText, textsText, parseRulesText, parseTextsText };
  KG.rlml = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
