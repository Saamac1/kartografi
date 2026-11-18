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
      if ((mm = t.match(/^atlas\s+(\S+)\s+sheet\s+(\d+)\s*x\s*(\d+)\s+grid\s+(\d+)\s*x\s*(\d+)(?:\s+fill\s+(\S+))?\s*$/i))) {
        closeRaw(); section = null;
        m = newMap(0, 0); m.name = mm[1]; m.isAtlasBlock = true; attach(m, file);
        m.atlas = { sw: +mm[2], sh: +mm[3], cols: +mm[4], rows: +mm[5], fill: mm[6] || null, layout: 'single', meta: {}, atRows: [] };
        if (pendingHeading) { m.title = pendingHeading; m.hasHeading = true; } else m.title = file.title;
        pendingHeading = null; file.maps.push(m); legacy.set(m, []); continue;
      }
      if ((mm = t.match(/^map\s+(\S+)(?:\s+size\s+(\d+)\s*x\s*(\d+))?\s*$/i))) {
        closeRaw(); section = null;
        m = newMap(mm[2] ? +mm[2] : 0, mm[3] ? +mm[3] : 0); m.name = mm[1]; m.sizeGiven = !!mm[2]; attach(m, file);
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
      map.hadLegend = map.legend.length > 0;
      if (!map.legend.length) map.legend = DEFAULT_LEGEND.map(e => Object.assign({}, e));
      if (map.isAtlasBlock) { normalize(map); continue; }
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
    s += file.maps.map(m => m.atlas ? serializeAtlasBlock(m) + (m.atlas.layout === 'files' ? '' : sheetParts(m).filter(S => !S.empty).map(S => '\n' + serializeSheet(m, S)).join('')) : serializeMap(m)).join('\n');
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
      // atlaksen lehden rivi (in MAAILMA.B10) koskee lehtikohtaista aluetta B10.NIMI
      const sheetRule = r => m.atlas && r.map && r.map.startsWith(m.name + '.') && parseSheetId(r.map.slice(m.name.length + 1));
      const rules = st.labels.filter(r => !r.map || r.map === m.name || sheetRule(r)).map(r => { const o = Object.assign({}, r); if (sheetRule(r) && o.name != null) o.name = r.map.slice(m.name.length + 1) + '.' + o.name; delete o.map; return o; });
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
  // ---- atlas (dataformaatit 8.12): iso kartta karttalehtinä NIMI.A01, NIMI.B10 …
  // Kirjain on sarake ja numero rivi; lehdet kootaan yhdeksi kartaksi ja jaetaan tallennettaessa takaisin.
  const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const colIndex = s => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const sheetId = (at, c, r) => colName(c) + String(r + 1).padStart(at.rows > 99 ? 3 : 2, '0');
  const parseSheetId = s => { const m = /^([A-Z]+)(\d+)$/.exec(s); return m ? { c: colIndex(m[1]), r: +m[2] - 1 } : null; };
  // lehtikohtaisen alueen nimi kootussa kartassa: LEHTI.ALUE (B10.LAHDE)
  const sheetOfArea = (at, name) => { const i = name.indexOf('.'); if (i < 0) return null; const p = parseSheetId(name.slice(0, i)); return p && p.c < at.cols && p.r < at.rows ? { id: name.slice(0, i), local: name.slice(i + 1), c: p.c, r: p.r } : null; };
  const atLine = /^-\s*(\d+)\s*,\s*(\d+)(\s+.*)?$/;
  const atRowsToAt = rows => rows.map(r => { const mm = /\b(as|with)\s+(\S+)/i.exec(r.rest || ''); return mm ? { x: r.x, y: r.y, [mm[1].toLowerCase()]: mm[2] } : null; }).filter(Boolean);
  function freeChar(used, pref) { for (const c of (pref || '') + '~.,#TDYnrXKCshRSV:;=+*o0123456789abcdefgijklmpqtuvwxyzABEFGHIJLMNOPQUWZ') if (!used.has(c)) return c; return null; }
  function atlasFillChar(A) {
    const at = A.atlas; if (!at.fill) return fillChar(A);
    let e = A.legend.find(l => specNames(l.spec)[0] === at.fill && !/\s/.test(l.spec));
    if (!e) e = A.legend.find(l => specNames(l.spec)[0] === at.fill);
    if (!e) { const ch = freeChar(new Set(A.legend.map(l => l.ch)), at.fill.startsWith('WATER') || at.fill.startsWith('SEA') ? '~' : at.fill.startsWith('WALL') ? '#' : '.'); e = { ch, spec: at.fill, name: '' }; A.legend.push(e); refreshNames(A); }
    return e.ch;
  }
  function assembleAtlases(file) {
    for (const A of file.maps.filter(m => m.isAtlasBlock)) {
      const at = A.atlas, W = at.cols * at.sw, H = at.rows * at.sh, seen = new Set(), sheets = [];
      if (!A.hadLegend) A.legend = [];
      for (const m of file.maps) {
        if (m === A || !m.name.startsWith(A.name + '.')) continue;
        const id = m.name.slice(A.name.length + 1), p = parseSheetId(id); if (!p) continue;
        if (p.c >= at.cols || p.r >= at.rows) { A.warnings.push(`Lehti ${m.name} on atlaksen ruudukon (${at.cols} × ${at.rows}) ulkopuolella`); continue; }
        if (seen.has(id)) { A.warnings.push(`Lehti ${m.name} on kahteen kertaan; jälkimmäinen jätettiin pois`); m.dropped = true; continue; }
        seen.add(id); sheets.push({ m, id, p });
      }
      // yhtenäinen legenda: atlaksen rivit ja lehtien omat rivit; ristiriitainen merkki saa uuden merkin
      const cmaps = new Map();
      for (const S of sheets) { const cm = {}; cmaps.set(S, cm); if (!S.m.hadLegend) continue;
        for (const e of S.m.legend) { const same = A.legend.find(l => l.ch === e.ch);
          if (same && same.spec === e.spec) continue;
          const bySpec = A.legend.find(l => l.spec === e.spec); if (bySpec) { cm[e.ch] = bySpec.ch; continue; }
          if (!same) { A.legend.push(Object.assign({}, e)); continue; }
          const nc = freeChar(new Set(A.legend.map(l => l.ch))); A.legend.push(Object.assign({}, e, { ch: nc })); cm[e.ch] = nc;
          A.warnings.push(`Merkki ${e.ch} tarkoittaa lehdellä ${S.id} eri asiaa (${e.spec}); se vaihdettiin merkiksi ${nc}`); } }
      if (!A.legend.length) A.legend = DEFAULT_LEGEND.map(e => Object.assign({}, e));
      refreshNames(A);
      const fc = atlasFillChar(A), G = Array.from({ length: H }, () => Array(W).fill(fc));
      for (const S of sheets) {
        const { m, id, p } = S, ox = p.c * at.sw, oy = p.r * at.sh, cm = cmaps.get(S), rows = m.grid;
        if ((m.sizeGiven && (m.W !== at.sw || m.H !== at.sh)) || rows.length > at.sh || rows.some(r => r.replace(/\s+$/, '').length > at.sw))
          A.warnings.push(`Lehden ${id} koko ei ole ${at.sw} × ${at.sh}; ylimenevä osa jätettiin pois`);
        for (let j = 0; j < at.sh; j++) { const r = rows[j]; if (r == null) continue; for (let i = 0; i < at.sw; i++) { const ch = r[i]; if (ch == null) continue; G[oy + j][ox + i] = cm[ch] || ch; } }
        for (const a of m.areas) A.areas.push({ x: a.x + ox, y: a.y + oy, w: a.w, h: a.h, name: id + '.' + a.name });
        const meta = { raw: [] };
        if (m.hasHeading && m.title && m.title !== id) meta.title = m.title;
        for (const r of m.raw) { if (r.head.trim().toLowerCase() === 'at:') { for (const l of r.lines) { const mm = atLine.exec(l.trim()); if (mm) at.atRows.push({ x: +mm[1] + ox, y: +mm[2] + oy, rest: mm[3] || '' }); } } else meta.raw.push(r); }
        at.meta[id] = meta; m.absorbed = true;
        if (m.src && A.src && m.src !== A.src) at.layout = 'files';
      }
      A.grid = G.map(r => r.join('')); A.W = W; A.H = H; A.at = atRowsToAt(at.atRows);
      at.present = new Set(sheets.map(S => S.id));
      normalize(A);
    }
    const before = file.maps.length;
    file.maps = file.maps.filter(m => !m.absorbed && !m.dropped);
    return before !== file.maps.length;
  }
  // lehden sisältö kootusta kartasta
  function sheetParts(A) {
    const at = A.atlas, fc = atlasFillChar(A), out = [];
    for (let r = 0; r < at.rows; r++) for (let c = 0; c < at.cols; c++) {
      const id = sheetId(at, c, r), ox = c * at.sw, oy = r * at.sh;
      const grid = A.grid.slice(oy, oy + at.sh).map(row => row.slice(ox, ox + at.sw));
      const areas = [], atRows = (at.atRows || []).filter(a => a.x >= ox && a.y >= oy && a.x < ox + at.sw && a.y < oy + at.sh).map(a => ({ x: a.x - ox, y: a.y - oy, rest: a.rest }));
      for (const a of A.areas) { const so = sheetOfArea(at, a.name); if (so && so.id === id && a.x >= ox && a.y >= oy && a.x + a.w <= ox + at.sw && a.y + a.h <= oy + at.sh) areas.push({ x: a.x - ox, y: a.y - oy, w: a.w, h: a.h, name: so.local }); }
      const meta = at.meta[id] || { raw: [] }, empty = grid.every(row => [...row].every(ch => ch === fc)) && !areas.length && !atRows.length && !(meta.raw || []).length;
      out.push({ id, c, r, grid, areas, atRows, meta, empty });
    }
    return out;
  }
  function serializeSheet(A, S) {
    let s = `## ${S.meta.title || S.id}\n\nmap ${A.name}.${S.id}\n\n\`\`\`\n${S.grid.join('\n')}\n\`\`\`\n`;
    if (S.atRows.length) s += '\nat:\n' + S.atRows.map(a => `- ${a.x},${a.y}${a.rest}`).join('\n') + '\n';
    for (const r of S.meta.raw || []) s += `\n${r.head}\n${r.lines.join('\n')}${r.lines.length ? '\n' : ''}`;
    if (S.areas.length) s += '\nareas:\n' + S.areas.map(a => `- ${a.x},${a.y} size ${a.w}x${a.h} as ${a.name}`).join('\n') + '\n';
    return s;
  }
  function serializeAtlasBlock(A) {
    const at = A.atlas; let s = '';
    if (A.hasHeading) s += `## ${A.title}\n\n`;
    s += `atlas ${A.name} sheet ${at.sw}x${at.sh} grid ${at.cols}x${at.rows}${at.fill ? ' fill ' + at.fill : ''}\n\nlegend:\n`;
    for (const e of A.legend) s += legendLine(e) + '\n';
    for (const r of A.raw || []) s += `\n${r.head}\n${r.lines.join('\n')}${r.lines.length ? '\n' : ''}`;
    // lehtirajan ylittävät ja atlaksen omat alueet; lehtikohtaiset alueet menevät lehdille
    const own = A.areas.filter(a => { const so = sheetOfArea(at, a.name); if (!so) return true; const ox = so.c * at.sw, oy = so.r * at.sh; return !(a.x >= ox && a.y >= oy && a.x + a.w <= ox + at.sw && a.y + a.h <= oy + at.sh); });
    if (own.length) s += '\nareas:\n' + own.map(a => `- ${a.x},${a.y} size ${a.w}x${a.h} as ${a.name}`).join('\n') + '\n';
    return s;
  }
  // tavallisesta kartasta atlas: lehden koko, ruudukko kartan kokoon pyöristettynä ylöspäin, täyttö
  function makeAtlas(m, sw, sh, fillTile) {
    const at = { sw, sh, cols: Math.max(1, Math.ceil(m.W / sw)), rows: Math.max(1, Math.ceil(m.H / sh)), fill: fillTile || null, layout: 'single', meta: {}, atRows: [] };
    const rest = []; for (const r of m.raw || []) { if (r.head.trim().toLowerCase() === 'at:') { for (const l of r.lines) { const mm = atLine.exec(l.trim()); if (mm) at.atRows.push({ x: +mm[1], y: +mm[2], rest: mm[3] || '' }); } } else rest.push(r); }
    m.raw = rest; m.atlas = at; m.isAtlasBlock = true;
    const fc = atlasFillChar(m), W = at.cols * sw, H = at.rows * sh;
    m.grid = Array.from({ length: H }, (_, j) => { const r = (m.grid[j] || '').slice(0, W); return r + fc.repeat(W - r.length); }); m.W = W; m.H = H;
    m.at = atRowsToAt(at.atRows); at.present = new Set(sheetParts(m).filter(S => !S.empty).map(S => S.id));
    return m;
  }
  // lehtijaon purku: atlaksesta tavallinen kartta (lehtikohtaiset alueet säilyvät nimellä LEHTI.ALUE)
  function unmakeAtlas(m) {
    const at = m.atlas; if (!at) return m;
    if (at.atRows.length) m.raw = [{ head: 'at:', lines: at.atRows.map(a => `- ${a.x},${a.y}${a.rest}`) }].concat(m.raw || []);
    for (const id of Object.keys(at.meta)) if ((at.meta[id].raw || []).length) m.warnings = (m.warnings || []).concat(`Lehden ${id} omat osiot jätettiin pois`);
    delete m.atlas; delete m.isAtlasBlock; m.sizeGiven = true; return m;
  }
  // lehtijaon muutos: uusi lehtikoko; lehtikohtaiset alueet nimetään uudelleen (B10.LAHDE → B10_LAHDE), koska tunnukset vaihtuvat
  function resplitAtlas(m, sw, sh) {
    const at = m.atlas, ren = {};
    for (const a of m.areas) { const so = sheetOfArea(at, a.name); if (so) { const nn = a.name.replace('.', '_'); ren[a.name] = nn; a.name = nn; } }
    for (const [o, n] of Object.entries(ren)) { if (m.texts[o] != null) { m.texts[n] = m.texts[o]; delete m.texts[o]; } for (const r of m.rules || []) if (r.name === o) r.name = n; }
    const fill = at.fill, atRows = at.atRows; unmakeAtlas(m); makeAtlas(m, sw, sh, fill);
    if (!m.atlas.atRows.length && atRows.length) m.atlas.atRows = atRows;
    return Object.keys(ren).length;
  }

  // ---- projekti (kartasto): yksi tai useampi karttatiedosto, yksi paperityyli ja kielitiedostot
  // Syöte: merkkijonoja tai { name, text } -olioita missä järjestyksessä tahansa.
  const KINDS = ['map', 'style', 'lang'];
  function kindOfName(name) { const n = String(name || '').toLowerCase(); if (/\.paper\.rlml(\.md)?$/.test(n)) return 'style'; if (/\.[a-z]{2,3}\.rlml(\.md)?$/.test(n)) return 'lang'; if (/\.(rlml|md)$/.test(n)) return 'map'; return null; }
  // sisältö ratkaisee, jos siinä on määrittelyjä; tyhjän tiedoston laji tulee nimestä
  function kindOfEntry(e) {
    const t = String(e.text || '');
    if (/^\s*language\s+[a-z]{2,3}\s*$/im.test(t) && kindOfText(t) === 'lang') return 'lang';
    if (/^map\s+\S+/im.test(t)) return 'map';
    if (t.split('\n').some(l => STYLE_HEAD.test(l.trim()))) return 'style';
    return e.kind || kindOfName(e.name) || (t.trim() ? 'map' : null);
  }
  // uusien tiedostojen nimien alku: ensimmäisen karttatiedoston nimi ilman päätettä, muuten kartaston nimi
  const baseName = file => { const first = (file.sources || []).map(s => s.part ? s.part.name : s.kind === 'map' || kindOfName(s.name) === 'map' ? s.name : null).find(Boolean);
    return first ? first.replace(/\.rlml(\.md)?$|\.md$/i, '') : toId(file.title || (file.maps[0] && file.maps[0].name) || 'kartasto').toLowerCase(); };
  function defaultName(file, kind, lang) {
    const b = baseName(file), used = new Set((file.sources || []).map(s => s.name));
    const mk = n => kind === 'map' ? `${b}${n}.rlml.md` : kind === 'style' ? `${b}${n}.paper.rlml.md` : `${b}${n}.${lang || 'fi'}.rlml.md`;
    let n = '', i = 2; while (used.has(mk(n))) n = '-' + i++; return mk(n);
  }
  function parseProject(input) {
    const entries = (Array.isArray(input) ? input : [input]).map(x => typeof x === 'string' ? { name: '', text: x } : Object.assign({}, x)).filter(e => e && (e.text != null));
    for (const e of entries) e.kind = kindOfEntry(e);
    const maps = entries.filter(e => e.kind === 'map' && String(e.text).trim()), warnings = [];
    const file = parseFile(maps.length ? maps[0].text : '');
    file.parts = [{ name: maps.length ? maps[0].name : '' }];
    for (const m of file.maps) m.src = file.parts[0];
    for (const e of maps.slice(1)) { const f2 = parseFile(e.text), part = { name: e.name, title: f2.title, preamble: f2.preamble }; file.parts.push(part); for (const m of f2.maps) { m.src = part; attach(m, file); file.maps.push(m); } }
    if (assembleAtlases(file)) { const used = new Set(file.maps.map(m => m.src)); file.parts = file.parts.filter((p, i) => i === 0 || used.has(p)); }
    file.styleOther = []; file.langOther = []; file.extraLangs = []; file.lang = null; file.sources = [];
    let styleSeen = false;
    for (const e of entries) {
      if (e.kind === 'map') { const part = file.parts.find(p => p.name === e.name && String(e.text).trim()); if (part && !file.sources.some(s => s.part === part)) file.sources.push({ kind: 'map', part }); }
      else if (e.kind === 'style') { applyStyle(file, parseStyle(e.text)); if (!styleSeen) { file.sources.push({ kind: 'style', name: e.name }); styleSeen = true; } else warnings.push(`Paperityyli ${e.name} yhdistettiin tiedostoon ${file.sources.find(s => s.kind === 'style').name}`); }
      else if (e.kind === 'lang') { const L = parseLang(e.text);
        if (!file.lang) { applyLang(file, L); file.sources.push({ kind: 'lang', name: e.name, lang: L.lang }); }
        else if (L.lang === file.lang) { applyLang(file, L); warnings.push(`Kielitiedosto ${e.name || ''} yhdistettiin kielen ${L.lang} tiedostoon`); }
        else file.sources.push({ kind: 'lang', name: e.name, lang: L.lang, raw: e.text }); }
      else if (String(e.text).trim()) warnings.push(`Tiedoston ${e.name || '(nimetön)'} lajia ei tunnistettu`);
    }
    file.lang = file.lang || file.maps[0].lang || 'fi';
    // jokaisella kartastolla on karttatiedosto, paperityyli ja ensisijainen kielitiedosto
    if (!file.sources.some(s => s.kind === 'map')) file.sources.unshift({ kind: 'map', part: file.parts[0] });
    for (const p of file.parts) if (!p.name) p.name = defaultName(file, 'map');
    if (!file.sources.some(s => s.kind === 'style')) file.sources.push({ kind: 'style', name: '' });
    if (!file.sources.some(s => s.kind === 'lang' && !s.raw)) file.sources.push({ kind: 'lang', name: '', lang: file.lang });
    for (const s of file.sources) if (!s.part && !s.name) s.name = defaultName(file, s.kind, s.lang);
    for (const m of file.maps) { inferStyle(m); }
    if (warnings.length) file.maps[0].warnings = (file.maps[0].warnings || []).concat(warnings);
    return file;
  }
  // kartta ilman piirtotapaa: laji päätellään palojen nimistä (seinät ja lattiat → luola, runko ja kansi → laiva)
  function inferStyle(m) {
    if (m.styleSet) return m.style;
    const bases = m.legend.map(e => specNames(e.spec)[0].split('.')[0].toUpperCase());
    // merikartan palat (vesi, niitty, metsä…) pitävät kartan merikarttana
    if (bases.some(b => ['WATER', 'GRASS', 'FOREST', 'MOUNTAIN', 'HILL', 'SAND', 'RIVER'].includes(b))) return m.style;
    const ship = bases.some(b => ['HULL', 'DECK', 'RAIL', 'CABIN', 'GANGPLANK'].includes(b)), cave = bases.some(b => ['WALL', 'FLOOR'].includes(b));
    if (ship || cave) { m.style = ship ? 'ship' : 'cave'; m.styleSet = true; refreshNames(m); }
    return m.style;
  }
  // tiedostojen sisällöt nykyisestä mallista: [{ name, kind, lang?, text }]
  // pelkästä parseFile-tuloksesta kartasto: oletusnimet tiedostoille
  function ensureSources(file) {
    if (file.sources) return file;
    const base = toId(file.title || (file.maps[0] && file.maps[0].name) || 'kartasto').toLowerCase(), part = { name: base + '.rlml.md' }, lang = file.lang || (file.maps[0] && file.maps[0].lang) || 'fi';
    file.parts = [part]; for (const m of file.maps) if (!m.src) m.src = part;
    file.sources = [{ kind: 'map', part }, { kind: 'style', name: base + '.paper.rlml.md' }, { kind: 'lang', name: `${base}.${lang}.rlml.md`, lang }];
    return file;
  }
  function projectFiles(file) {
    ensureSources(file); const out = [];
    for (const s of file.sources) {
      if (s.kind === 'map') { const p = s.part, i = file.parts.indexOf(p), maps = file.maps.filter(m => (m.src || file.parts[0]) === p);
        out.push({ name: p.name, kind: 'map', text: serializeFile({ title: i === 0 ? file.title : p.title, preamble: i === 0 ? file.preamble : (p.preamble || []), maps }) });
        // atlas lehti per tiedosto: nimi-A01.rlml.md …
        for (const A of maps) if (A.atlas && A.atlas.layout === 'files') { const base = p.name.replace(/\.rlml(\.md)?$|\.md$/i, '');
          for (const S of sheetParts(A)) if (!S.empty) out.push({ name: `${base}-${S.id}.rlml.md`, kind: 'map', sheet: S.id, text: serializeSheet(A, S) }); } }
      else if (s.kind === 'style') out.push({ name: s.name, kind: 'style', text: serializeStyle(file) });
      else if (s.raw != null) out.push({ name: s.name, kind: 'lang', lang: s.lang, text: s.raw });
      else out.push({ name: s.name, kind: 'lang', lang: s.lang, text: serializeLang(file) });
    }
    return out;
  }
  function renameSource(file, oldName, newName) { for (const s of file.sources) { if (s.part && s.part.name === oldName) s.part.name = newName; else if (s.name === oldName) s.name = newName; } }
  // uuden tiedoston pohja projektiin
  function fileTemplate(file, kind, lang) {
    if (kind === 'lang') return `language ${lang || 'en'}\n`;
    if (kind === 'style') return `# ${file.title || 'Kartasto'}: paperikartan tyyli\n\nmaps.theme paper\n`;
    let n = file.maps.length + 1; while (file.maps.some(m => m.name === 'KARTTA' + n)) n++;
    return `## Kartta ${n}\n\nmap KARTTA${n} size 24x16\n\n\`\`\`\n${('~'.repeat(24) + '\n').repeat(16)}\`\`\`\n\nlegend:\n- ~ WATER\n- . GRASS\n`;
  }
  // kartaston uusi kartta lajin mukaan: merikartta, luola tai laiva
  const SHIP_LEGEND = [[' ', 'SEA'], ['W', 'HULL'], ['V', 'HULL.window'], ['Y', 'HULL.lantern'], ['r', 'RAIL'], ['.', 'DECK'], [',', 'CABIN'], ['D', 'DOOR'], ['x', 'CRATE'], ['w', 'HELM'],
    ['=', 'GANGPLANK'], ['<', 'GANGPLANK.end as TO_SHORE'], ['>', 'HATCH as TO_HOLD'], ['m', 'DECK with MAST'], ['b', 'DECK with BARREL'], ['n', 'DECK with CANNON']];
  const CAVE_LEGEND = [['#', 'WALL'], ['M', 'WALL.moss'], ['R', 'WALL.ornament'], ['T', 'WALL.torch'], ['.', 'FLOOR'], ['D', 'DOOR'], ['<', 'STAIR.up as TO_UP'], ['>', 'STAIR.down as TO_DEEP'],
    ['P', 'FLOOR with PILLAR'], ['k', 'FLOOR with KEY'], ['g', 'FLOOR with GOLD'], ['c', 'FLOOR with CHEST']];
  function mapOfKind(kind, W, H) {
    const m = newMap(W, H, kind);
    if (kind === 'sea') m.legend = DEFAULT_LEGEND.map(e => Object.assign({}, e));
    else { m.styleSet = true; m.legend = (kind === 'ship' ? SHIP_LEGEND : CAVE_LEGEND).map(([ch, spec]) => ({ ch, spec, name: '' })); m.vars = { EDGE: kind === 'ship' ? 'SEA' : 'WALL' }; m.raw = [{ head: 'vars:', lines: [`- EDGE ${m.vars.EDGE}`] }]; refreshNames(m); }
    const fc = fillChar(m); m.grid = Array.from({ length: H }, () => fc.repeat(W));
    return m;
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
    const lab = []; for (const m of maps) for (const r of m.rules || []) { const so = m.atlas && r.name != null ? sheetOfArea(m.atlas, r.name) : null;
      lab.push('- ' + ruleToString(Object.assign({}, r, so ? { name: so.local, map: m.name + '.' + so.id } : { map: multi ? m.name : null }), true)); }
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
  // yksittäisestä kartasta kartasto: karttatiedosto, paperityyli ja kielitiedosto
  function projectOf(m, title) {
    const base = toId(title || m.title || m.name || 'kartasto').toLowerCase(), part = { name: base + '.rlml.md' };
    const f = { title: title || m.title || '', preamble: [], maps: [m], parts: [part], lang: m.lang || 'fi', styleOther: [], langOther: [],
      sources: [{ kind: 'map', part }, { kind: 'style', name: base + '.paper.rlml.md' }, { kind: 'lang', name: `${base}.${m.lang || 'fi'}.rlml.md`, lang: m.lang || 'fi' }] };
    m.src = part; m.hasHeading = false; attach(m, f); return f;
  }
  // vanha kolmen tiedoston muoto (kaikki kartat yhteen)
  function serializeProject(file) { const fs = projectFiles(file); return { map: fs.filter(f => f.kind === 'map').map(f => f.text).join('\n'), style: serializeStyle(file), lang: serializeLang(file), files: fs }; }

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

  const api = { makeAtlas, unmakeAtlas, resplitAtlas, sheetParts, sheetId, parseSheetId, colName, projectOf, projectFiles, renameSource, fileTemplate, mapOfKind, inferStyle, kindOfName, kindOfEntry, defaultName, KINDS, SHIP_LEGEND, CAVE_LEGEND, atRoots, specNames, parseProject, serializeProject, serializeStyle, serializeLang, parseStyle, parseLang, kindOfText, SEA_KINDS, DUNGEON_KINDS, attach, refreshNames, DEFAULT_LEGEND, TYPE_NAMES, STYLES, typeOf, toId, ID_RE, parse, parseFile, serialize, serializeFile, serializeMap, typeMap, blankDoc, newMap, normalize, resize, fillChar, parseRule, ruleToString, parseText, parseLegendLine, legendLine, rulesText, textsText, parseRulesText, parseTextsText };
  KG.rlml = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
