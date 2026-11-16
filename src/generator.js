// Satunnainen saaristokartta RLML-muodossa. Sama siemen ja koko tuottavat aina saman kartan.
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};
  const rlml = KG.rlml || (typeof require !== 'undefined' && require('./rlml.js'));
  function h32(a, b, c) { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return h >>> 0; }
  function vn(x, y, s) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sm = t => t * t * (3 - 2 * t), hf = (a, b) => h32(a, b, s) / 4294967296; const a = hf(ix, iy), b = hf(ix + 1, iy), c = hf(ix, iy + 1), d = hf(ix + 1, iy + 1); const u = sm(fx), v = sm(fy); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
  function fbm(x, y, s) { let t = 0, a = .5, f = 1, n = 0; for (let o = 0; o < 4; o++) { t += vn(x * f, y * f, s + o * 7) * a; n += a; a *= .5; f *= 2; } return t / n; }
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const NAMES = ['Norsusaari', 'Palmusaari', 'Kallosaari', 'Lokkiluoto', 'Rummusaari', 'Korppisaari', 'Merikotkan saari', 'Hylkysaari', 'Kilpikonnasaari', 'Tuulisaari'];
  const MOUNTAINS = ['Vaaravuori', 'Ukonvuori', 'Kotkankallio', 'Huurrehuippu', 'Myrskyvaara'];
  const syvaPt = (deep, kr) => deep.find(([d, i, j]) => !kr || Math.hypot(i - kr[1], j - kr[2]) > 12);
  const N8 = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];

  function generate(opt) {
    const W = opt.W || 64, H = opt.H || 44, seed = (opt.seed | 0) || 1, R = rng(seed * 7919 + 13), S = seed * 101;
    // saarten keskukset satunnaisesti, mutta tasaisesti hajautettuina
    const nb = Math.max(3, Math.round(W * H / 470)), blobs = [];
    for (let t = 0; blobs.length < nb && t < 400; t++) {
      const x = 7 + R() * (W - 14), y = 6 + R() * (H - 16), rx = (3.5 + R() * Math.min(W, H) * .2), ry = rx * (.6 + R() * .3);
      if (blobs.some(b => Math.hypot((b[0] - x) / (b[2] + rx), (b[1] - y) / (b[3] + ry)) < .85)) continue;
      blobs.push([x, y, rx, ry, .32 + R() * .3]);
    }
    const free = opt.reserve === false ? [] : [[W - 31, H - 12, W - 1, H - 1], [0, H - 6, Math.floor(W * .55), H - 1]];
    const inFree = (i, j) => free.some(([a, b, c, d]) => i >= a && i <= c && j >= b && j <= d);
    const h = [];
    for (let j = 0; j < H; j++) { h.push([]); for (let i = 0; i < W; i++) {
      let b = -9; for (const [x, y, rx, ry, am] of blobs) b = Math.max(b, am * (1 - ((i - x) / rx) ** 2 - ((j - y) / ry) ** 2));
      let v = b + (fbm(i / 8, j / 8, S + 1) - .5) * 1.1 + (fbm(i / 3.2, j / 3.2, S + 2) - .5) * .38;
      v = Math.max(v, (fbm(i / 4, j / 4, S + 3) - .7) * 1.4);
      const ed = Math.min(i, j, W - 1 - i, H - 1 - j); if (ed < 6) v -= (6 - ed) * .09;
      if (i < 2 || j < 2 || i > W - 3 || j > H - 3 || inFree(i, j)) v = -1;
      h[j].push(v);
    } }
    const M = h.map(r => r.map(v => v > 0 ? '.' : '~'));
    const land = (i, j) => i >= 0 && j >= 0 && i < W && j < H && M[j][i] !== '~' && M[j][i] !== 'K';
    const comp = h.map(r => r.map(() => -1)), comps = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (land(i, j) && comp[j][i] < 0) {
      const id = comps.length, q = [[i, j]], cells = []; comp[j][i] = id;
      while (q.length) { const [a, b] = q.pop(); cells.push([a, b]); for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = a + da, y = b + db; if (land(x, y) && comp[y][x] < 0) { comp[y][x] = id; q.push([x, y]); } } }
      comps.push(cells);
    }
    const order = comps.map((c, n) => n).sort((a, b) => comps[b].length - comps[a].length);
    const coastAdj = (i, j) => N8.some(([a, b]) => !land(i + a, j + b));
    const pct = comps.map(c => { const v = c.map(([i, j]) => h[j][i]).sort((a, b) => a - b); return [v[Math.floor(v.length * .9)], v[Math.floor(v.length * .79)]]; });
    const southern = j => j > H * .42;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!land(i, j)) continue;
      const e = h[j][i], v = fbm(i / 6 + 40, j / 6, S + 9), n = comp[j][i], sz = comps[n].length, [p90, p79] = pct[n];
      if (e >= p90 && sz > 20) M[j][i] = '^';
      else if (e >= p79 && sz > 12) M[j][i] = 'n';
      else if (coastAdj(i, j) && southern(j) && n !== order[0] && R() < .32) M[j][i] = 'Y';
      else if (coastAdj(i, j)) M[j][i] = R() < .2 ? ',' : '.';
      else if (v > .6) M[j][i] = 'T';
      else if (v < .36) M[j][i] = 'D';
      else if (v < .43) M[j][i] = ',';
    }
    // joet korkeimmilta vuorilta alamäkeen mereen
    function river(si, sj) {
      let i = si, j = sj; const seen = new Set();
      for (let st = 0; st < 120; st++) {
        seen.add(i + ',' + j);
        let best = null, bv = 1e9;
        for (const [a, b] of N8) { const x = i + a, y = j + b; if (seen.has(x + ',' + y)) continue; const val = land(x, y) ? h[y][x] + R() * .04 + (a && b ? .01 : 0) : -5; if (val < bv) { bv = val; best = [x, y]; } }
        if (!best || !land(best[0], best[1]) || M[best[1]][best[0]] === 'r') return;
        [i, j] = best; if (M[j][i] !== '^') M[j][i] = 'r';
      }
    }
    for (const n of order.slice(0, 3)) {
      const cells = comps[n].filter(([i, j]) => M[j][i] === '^').sort((a, b) => h[b[1]][b[0]] - h[a[1]][a[0]]);
      if (cells.length) river(...cells[0]);
      if (n === order[0] && cells.length > 6) river(...cells[Math.floor(cells.length / 2)]);
    }
    // aarre pääsaaren sisämaahan
    if (order.length) { const main = comps[order[0]]; let best = null, bd = -1;
      for (const [i, j] of main) { if (M[j][i] !== '.' && M[j][i] !== ',') continue; let d = 99; for (let b = -6; b <= 6; b++) for (let a = -6; a <= 6; a++) if (!land(i + a, j + b)) d = Math.min(d, Math.hypot(a, b)); const sc = Math.min(d, 3.5) + R() * .5; if (sc > bd) { bd = sc; best = [i, j]; } }
      if (best) M[best[1]][best[0]] = 'X'; }
    // syvyys, kraken ja syvänteen nimi
    const D = h.map((r, j) => r.map((_, i) => land(i, j) ? 0 : 99));
    for (let it = 0; it < 60; it++) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (!D[j][i]) continue; let m = D[j][i]; for (const [a, b] of N8) { const x = i + a, y = j + b; if (x >= 0 && y >= 0 && x < W && y < H) m = Math.min(m, D[y][x] + (a && b ? 1.41 : 1)); } D[j][i] = m; }
    const deep = []; for (let j = 6; j < H - 8; j++) for (let i = 7; i < W - 7; i++) if (!land(i, j) && !inFree(i, j) && !inFree(i + 5, j + 3)) deep.push([D[j][i], i, j]);
    deep.sort((a, b) => b[0] - a[0]);
    const areas = [], texts = {}, rules = [];
    const kr = deep.find(([d]) => d >= 4) || deep[0];
    if (kr && opt.kraken !== false) M[kr[2]][kr[1]] = 'K';
    // saarten alueet: rajaava suorakulmio yhdellä ruudulla väljennettynä
    const pick = NAMES.slice(); for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
    const bbox = cells => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const [i, j] of cells) { x0 = Math.min(x0, i); y0 = Math.min(y0, j); x1 = Math.max(x1, i); y1 = Math.max(y1, j); } return { x0, y0, x1, y1 }; };
    const named = order.filter(n => comps[n].length >= 25).slice(0, 4);
    const palmIsland = named.slice(1).sort((a, b) => comps[b].filter(([i, j]) => M[j][i] === 'Y').length - comps[a].filter(([i, j]) => M[j][i] === 'Y').length)[0];
    const used = new Set(), rects = [];
    named.forEach((n, q) => {
      let nm = n === palmIsland && comps[n].some(([i, j]) => M[j][i] === 'Y') ? 'Palmusaari' : pick.find(p => !used.has(p) && p !== 'Palmusaari');
      used.add(nm); const b = bbox(comps[n]);
      rects.push({ x0: Math.max(0, b.x0 - 1), y0: Math.max(0, b.y0 - 1), x1: Math.min(W - 1, b.x1 + 1), y1: Math.min(H - 1, b.y1 + 1), id: rlml.toId(nm), text: nm, own: comps[n].length, comp: n });
    });
    if (syvaPt(deep, kr)) { const [, i, j] = syvaPt(deep, kr); rects.push({ x0: Math.max(0, i - 5), y0: Math.max(0, j - 2), x1: Math.min(W - 1, i + 5), y1: Math.min(H - 1, j + 2), id: 'SYNKKA_SYVA', text: 'Synkkä syvä', own: 0, water: true }); }
    // osittaiset päällekkäisyydet pois: pienempää kavennetaan
    const ov = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
    const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
    const area = a => (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1);
    for (let it = 0; it < 30; it++) { let ch = false;
      for (const a of rects) for (const b of rects) { if (a === b || !ov(a, b) || inside(a, b) || inside(b, a)) continue;
        const s = a.water || (!b.water && area(a) <= area(b)) ? a : b, o = s === a ? b : a;
        const opts = [Object.assign({}, s, { x1: o.x0 - 1 }), Object.assign({}, s, { x0: o.x1 + 1 }), Object.assign({}, s, { y1: o.y0 - 1 }), Object.assign({}, s, { y0: o.y1 + 1 })].filter(r => r.x1 >= r.x0 && r.y1 >= r.y0);
        const keep = r => { if (s.water) return area(r); let n = 0; for (const [i, j] of comps[s.comp]) if (i >= r.x0 && i <= r.x1 && j >= r.y0 && j <= r.y1) n++; return n * 1000 + area(r); };
        opts.sort((p, q) => keep(q) - keep(p)); if (opts[0]) Object.assign(s, opts[0]); else s.dead = true; ch = true; }
      if (!ch) break; }
    for (const r of rects) { if (r.dead) continue; areas.push({ x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1, name: r.id }); texts[r.id] = r.text; if (r.water) rules.push({ name: r.id, place: 'water', size: 9 }); }
    // pääsaaren vuoristo omaksi alueekseen
    if (named.length) { const mc = comps[named[0]].filter(([i, j]) => M[j][i] === '^'); const isl = rects.find(r => r.comp === named[0]);
      if (mc.length >= 4 && isl && !isl.dead) { const b = bbox(mc), nm = MOUNTAINS[Math.floor(R() * MOUNTAINS.length)];
        const r = { x: Math.max(b.x0, isl.x0), y: Math.max(b.y0, isl.y0) }; r.w = Math.min(b.x1, isl.x1) - r.x + 1; r.h = Math.min(b.y1, isl.y1) - r.y + 1;
        if (r.w > 0 && r.h > 0) { areas.push(Object.assign(r, { name: rlml.toId(nm) })); texts[rlml.toId(nm)] = nm; } } }
    rules.unshift({ level: 0, size: 11, spacing: 'wide' }, { level: 1, size: 8.5 });
    const doc = rlml.blankDoc(W, H);
    doc.grid = M.map(r => r.join('')); doc.areas = areas; doc.rules = rules; doc.texts = texts; doc.name = 'MERIKARTTA';
    return doc;
  }
  const api = { generate };
  KG.generator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
