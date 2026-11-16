// Luola- ja laivakarttojen palaluokat paperipiirtoa varten.
//
// Luokat:  void   ulkopuoli (meri tai tyhjä)         solid  seinä, kallio tai runko
//          floor  kuljettava lattia                  door   ovi        stairs  portaat, tikkaat, luukku
//          exit   poistuminen kartalta (luolan suu, lankun pää)
// Valinnat: rough | straight (seinän muoto), pattern moss|runes|planks|boards|gangplank,
//           symbol NIMI (esim. torch, chest), locked, up | down, thin.
// Oletukset alla; tyylin "tiles.glyphs paper" -rivit ohittavat ne (dataformaatit 9.6).
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};
  const D = s => { const t = s.split(/\s+/); return { kind: t[0], opts: t.slice(1) }; };
  const DEFAULTS = {
    WALL: 'solid rough', 'WALL.moss': 'solid rough pattern moss', 'WALL.ornament': 'solid straight pattern runes', 'WALL.torch': 'solid rough symbol torch', ROCK: 'solid rough',
    FLOOR: 'floor', DOOR: 'door', 'DOOR.locked': 'door locked', 'STAIR.down': 'stairs down', 'STAIR.up': 'stairs up', CAVE_MOUTH: 'exit',
    SEA: 'void', WATER: 'void', VOID: 'void',
    RAIL: 'solid straight thin', HULL: 'solid straight', 'HULL.window': 'solid straight symbol window', 'HULL.port': 'solid straight symbol port', 'HULL.lantern': 'solid straight symbol lantern',
    DECK: 'floor pattern planks', CABIN: 'floor pattern boards', CRATE: 'floor symbol crate', HELM: 'floor symbol helm',
    GANGPLANK: 'floor pattern gangplank', 'GANGPLANK.end': 'exit', HATCH: 'stairs down symbol hatch', LADDER: 'stairs up symbol ladder',
  };
  // entiteetit (with …) piirretään symboleina lattialle
  const ENTITY = { MAST: 'mast', BARREL: 'barrel', CANNON: 'cannon', GEM: 'gem', GOLD: 'gold', KEY: 'key', GOBLET: 'goblet', CHEST: 'chest', AMULET: 'amulet', HIMMELI: 'himmeli', PILLAR: 'pillar', MAP_TABLE: 'table', ANCHOR: 'anchor', CREW: 'crew', SAIL: null, TREASURE: 'chest', HELM: 'helm', CRATE: 'crate' };
  const NAMES = {
    void: 'meri', solid: 'seinä', floor: 'lattia', door: 'ovi', 'door.locked': 'lukittu ovi', 'stairs.down': 'portaat alas', 'stairs.up': 'portaat ylös', exit: 'poistuminen',
    torch: 'soihtu', window: 'ikkuna', port: 'tykkiluukku', lantern: 'lyhty', crate: 'laatikko', helm: 'ruori', hatch: 'luukku', ladder: 'tikkaat',
    mast: 'masto', barrel: 'tynnyri', cannon: 'tykki', gem: 'jalokivi', gold: 'kulta', key: 'avain', goblet: 'pikari', chest: 'arkku', amulet: 'amuletti', himmeli: 'himmeli',
    pillar: 'pylväs', table: 'karttapöytä', anchor: 'ankkuri', crew: 'miehistö', moss: 'sammal', runes: 'riimut', planks: 'kansi', boards: 'hytin lattia', gangplank: 'lankku',
  };
  function parseSpec(spec) {
    const t = String(spec || '').trim().split(/\s+/); const base = t[0] || '', o = { base, with: [], as: null };
    for (let i = 1; i < t.length; i++) { if (/^with$/i.test(t[i])) { while (i + 1 < t.length && !/^(as|with)$/i.test(t[i + 1])) o.with.push(t[++i]); } else if (/^as$/i.test(t[i])) o.as = t[++i] || null; }
    return o;
  }
  function lookup(name, rules) {
    for (const r of rules || []) if (r.tile === name) return { kind: r.kind, opts: r.opts || [] };
    if (DEFAULTS[name]) return D(DEFAULTS[name]);
    const root = name.split('.')[0]; if (root !== name) { for (const r of rules || []) if (r.tile === root) return { kind: r.kind, opts: r.opts || [] }; if (DEFAULTS[root]) return D(DEFAULTS[root]); }
    return null;
  }
  // palan luokka, valinnat ja symbolit
  function classify(spec, rules) {
    const p = parseSpec(spec); let c = lookup(p.base, rules);
    if (!c) { const b = p.base.toUpperCase(); c = /WALL|HULL|ROCK|STONE|CLIFF/.test(b) ? { kind: 'solid', opts: ['rough'] } : /SEA|WATER|VOID|SKY/.test(b) ? { kind: 'void', opts: [] } : { kind: 'floor', opts: ['unknown'] }; }
    const opts = c.opts.slice(), syms = [];
    const oi = opts.indexOf('symbol'); if (oi >= 0 && opts[oi + 1]) syms.push(opts[oi + 1]);
    for (const w of p.with) { const r = lookup(w, rules); if (r && r.opts.includes('symbol')) { syms.push(r.opts[r.opts.indexOf('symbol') + 1]); continue; }
      const root = w.split('.')[0].toUpperCase(); if (ENTITY[root] !== undefined) { if (ENTITY[root]) syms.push(ENTITY[root]); } else syms.push('letter:' + root.charAt(0)); }
    const has = k => opts.includes(k), after = k => { const i = opts.indexOf(k); return i >= 0 ? opts[i + 1] : null; };
    return { kind: c.kind, base: p.base, as: p.as, rough: !has('straight') && (has('rough') || c.kind === 'solid'), straight: has('straight'), pattern: after('pattern'), symbols: syms, locked: has('locked'), dir: has('up') ? 'up' : has('down') ? 'down' : null, thin: has('thin'), unknown: has('unknown') };
  }
  function nameOf(spec) {
    const c = classify(spec, []);
    if (c.symbols.length) return NAMES[c.symbols[0]] || c.symbols[0];
    if (c.kind === 'door') return c.locked ? NAMES['door.locked'] : NAMES.door;
    if (c.kind === 'stairs') return NAMES['stairs.' + (c.dir || 'down')];
    if (c.pattern && NAMES[c.pattern]) return NAMES[c.pattern];
    if (KG.rlml && c.unknown) return String(spec).split(/\s+/)[0].toLowerCase();
    return NAMES[c.kind] || c.kind;
  }
  function classMap(doc) { const m = {}; for (const e of doc.legend) m[e.ch] = classify(e.spec, doc.tileRules); return m; }
  const api = { DEFAULTS, ENTITY, NAMES, parseSpec, classify, classMap, nameOf };
  KG.tiles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
