// RLML-kartasta mustavalkoinen vektorikartta (SVG) tulostusta varten.
// Yksikkö: yksi ruutu = 16 yksikköä. Viivavahvuudet annetaan millimetreinä
// ja muunnetaan yksiköiksi ruudun fyysisen koon (cellMM) mukaan.
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};
  const rlml = KG.rlml || (typeof require !== 'undefined' && require('./rlml.js'));
  const font = KG.font || (typeof require !== 'undefined' && require('./font.js'));
  const areasM = KG.areas || (typeof require !== 'undefined' && require('./areas.js'));
  const CS = 16, MG = 24;

  // ---- deterministinen satunnaisuus (paikkasidonnainen, jotta muokkaus ei sekoita muuta karttaa)
  function h32(a, b, c) { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return h >>> 0; }
  const hf = (a, b, c) => h32(a, b, c) / 4294967296;
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function noise(x, y, s) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sm = t => t * t * (3 - 2 * t); const a = hf(ix, iy, s), b = hf(ix + 1, iy, s), c = hf(ix, iy + 1, s), d = hf(ix + 1, iy + 1, s); const u = sm(fx), v = sm(fy); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

  // ---- polkuapurit
  const f = v => (Math.round(v * 100) / 100).toString();
  const pt = q => f(q[0]) + ' ' + f(q[1]);
  const P = (p, close) => p.length ? 'M' + p.map(pt).join('L') + (close ? 'Z' : '') : '';
  const seg = (a, b, c, d) => `M${f(a)} ${f(b)}L${f(c)} ${f(d)}`;
  function smoothD(p, closed) {
    const n = p.length; if (n < 3) return P(p, closed);
    const g = i => closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
    let d = 'M' + pt(p[0]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += 'C' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' + pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
    }
    return d + (closed ? 'Z' : '');
  }
  function quadPts(p0, c, p1, n) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); } return o; }
  function chaikin(p, n, closed) { for (let k = 0; k < n; k++) { const q = [], m = p.length; if (!closed) q.push(p[0]); for (let i = 0; i < (closed ? m : m - 1); i++) { const a = p[i], b = p[(i + 1) % m]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } if (!closed) q.push(p[m - 1]); p = q; } return p; }
  // vaakaviivoitus monikulmion sisään (analyyttisesti, ei leikkauspolkuja)
  function hatchD(poly, sp, ph, xmin) {
    ph = ph || 0; xmin = xmin == null ? -1e9 : xmin;
    let y0 = 1e9, y1 = -1e9; for (const q of poly) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    let d = '';
    for (let y = Math.ceil((y0 - ph) / sp) * sp + ph; y < y1; y += sp) {
      const xs = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const x1 = Math.max(xs[k], xmin), x2 = xs[k + 1]; if (x2 - x1 > .3) d += `M${f(x1)} ${f(y)}H${f(x2)}`; }
    }
    return d;
  }
  function ngon(x, y, r, n, rot) { const p = []; for (let i = 0; i < n; i++) { const a = (rot || 0) + i / n * Math.PI * 2; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return p; }
  const N8 = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];

  const DEFAULTS = { cellMM: 5, wMain: .3, wCoast: .6, wThin: .15, wSea: .18, spSea: .55, spSym: .45, legend: true, compass: true, title: true, frame: true };

  function scene(doc, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const k = CS / o.cellMM, mm = v => v * k;
    const wM = mm(o.wMain), wC = mm(o.wCoast), wT = mm(o.wThin), wS = mm(o.wSea), spS = mm(o.spSea), spY = mm(o.spSym);
    const W = doc.W, H = doc.H, MW = W * CS, MH = H * CS;
    const tm = rlml.typeMap(doc);
    const T = []; for (let j = 0; j < H; j++) { T.push([]); const r = doc.grid[j] || ''; for (let i = 0; i < W; i++) T[j].push(tm[r[i]] || 'water'); }
    const type = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 'water' : T[j][i];
    const land = (i, j) => { const t = type(i, j); return t !== 'water' && t !== 'kraken'; };
    const el = (d, w, fill) => d ? `<path d="${d}" fill="${fill || 'none'}" stroke="#000" stroke-width="${f(w == null ? wM : w)}"/>` : '';
    const white = d => `<path d="${d}" fill="#fff" stroke="none"/>`;
    const shape = (d, w) => `<path d="${d}" fill="#fff" stroke="#000" stroke-width="${f(w == null ? wM : w)}"/>`;
    const out = [];

    // ---- rantaviiva: marching squares ruutujen keskipisteistä, pehmennys ja rouhinta
    const TAB = { 1: ['LB'], 2: ['BR'], 3: ['LR'], 4: ['TR'], 5: ['LT', 'BR'], 6: ['TB'], 7: ['LT'], 8: ['LT'], 9: ['TB'], 10: ['TR', 'LB'], 11: ['TR'], 12: ['LR'], 13: ['BR'], 14: ['LB'] };
    const segs = [];
    for (let j = -1; j < H; j++) for (let i = -1; i < W; i++) {
      const c = (land(i, j) ? 8 : 0) | (land(i + 1, j) ? 4 : 0) | (land(i + 1, j + 1) ? 2 : 0) | (land(i, j + 1) ? 1 : 0); if (!TAB[c]) continue;
      const E = { T: [(i + 1) * CS, (j + .5) * CS], B: [(i + 1) * CS, (j + 1.5) * CS], L: [(i + .5) * CS, (j + 1) * CS], R: [(i + 1.5) * CS, (j + 1) * CS] };
      for (const s of TAB[c]) segs.push([E[s[0]], E[s[1]]]);
    }
    const key = p => p[0] + ',' + p[1], adj = {}; segs.forEach((s, n) => { for (const p of s) (adj[key(p)] = adj[key(p)] || []).push(n); });
    const used = new Set(), loops = [];
    function rough(p, lv, amp, cap) {
      for (let l = 0; l < lv; l++) { const q = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, oo = (hf(Math.round(mx * 8), Math.round(my * 8), 40 + l) - .5) * Math.min(L * amp, cap); q.push(a, [mx - dy / L * oo, my + dx / L * oo]); } p = q; cap *= .6; }
      return p;
    }
    for (let n = 0; n < segs.length; n++) {
      if (used.has(n)) continue; used.add(n); const lp = [segs[n][0], segs[n][1]]; let cur = segs[n][1];
      for (;;) { const nx = (adj[key(cur)] || []).find(m => !used.has(m)); if (nx === undefined) break; used.add(nx); const s = segs[nx]; cur = key(s[0]) === key(cur) ? s[1] : s[0]; if (key(cur) === key(lp[0])) break; lp.push(cur); }
      loops.push(chaikin(rough(chaikin(lp, 1, true), 4, .8, 14), 1, true));
    }
    function landSpans(y) { const xs = []; for (const lp of loops) { const n = lp.length; for (let i = 0; i < n; i++) { const a = lp[i], b = lp[(i + 1) % n]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } } xs.sort((a, b) => a - b); const s = []; for (let i = 0; i + 1 < xs.length; i += 2) s.push([xs[i] - 3, xs[i + 1] + 3]); return s; }

    // ---- syvyys (etäisyys maasta ruutuina) ja meren viivoitus: matalikko tummin
    const D = []; for (let j = 0; j < H; j++) { D.push([]); for (let i = 0; i < W; i++) D[j].push(land(i, j) ? 0 : 99); }
    for (let it = 0; it < 60; it++) { let ch = false; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (!D[j][i]) continue; let m = D[j][i]; for (const [a, b] of N8) { const x = i + a, y = j + b; if (x >= 0 && y >= 0 && x < W && y < H) m = Math.min(m, D[y][x] + (a && b ? 1.41 : 1)); } if (m < D[j][i]) { D[j][i] = m; ch = true; } } if (!ch) break; }
    function depth(x, y) { const u = Math.min(W - 1.001, Math.max(0, x / CS - .5)), v = Math.min(H - 1.001, Math.max(0, y / CS - .5)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, g = (a, b) => D[Math.min(H - 1, b)][Math.min(W - 1, a)]; return g(i, j) * (1 - fu) * (1 - fv) + g(i + 1, j) * fu * (1 - fv) + g(i, j + 1) * (1 - fu) * fv + g(i + 1, j + 1) * fu * fv; }
    const dc = (x, y) => { const d = depth(x, y); return d + (noise(x / 38, y / 38, 5) - .5) * 1.9 * Math.min(1, d / 1.5) + (noise(x / 11 + 5, y / 11 + 9, 6) - .5) * .4; };
    const hl = d => d < 1.2 ? 1 : d < 2.1 ? 2 : d < 3 ? 3 : d < 4 ? 4 : d < 5.1 ? 6 : d < 6.3 ? 8 : 0;

    // selite, kompassi ja otsikko (alalaita)
    const present = new Set(); for (const r of T) for (const t of r) present.add(t);
    const legendItems = ['conifer', 'deciduous', 'shrubs', 'palm', 'mountain', 'hill', 'river', 'treasure', 'kraken'].filter(t => present.has(t));
    legendItems.push('shallow', 'deep');
    const LGrows = Math.ceil(legendItems.length / 2);
    const LG = o.legend ? { w: 19.5 * CS, h: 2.6 * CS + LGrows * 19 } : null;
    if (LG) { LG.x = MW - LG.w - 1.2 * CS; LG.y = MH - LG.h - 1.2 * CS; }
    const CP = o.compass ? { r: 34, x: LG ? LG.x - 3.4 * CS : MW - 4 * CS, y: MH - 4.2 * CS } : null;

    { let d = '';
      for (let n = 0; ; n++) {
        const y = 2 + n * spS; if (y > MH - 2) break;
        const sp = landSpans(y), RS = rng(h32(n, 7, 55)); let run = null; const runs = [];
        for (let x = 2; x <= MW - 2; x += 1.25) {
          const L = hl(dc(x, y));
          const ok = L && n % L === 0 && !sp.some(([a, b]) => x > a && x < b) && !(CP && Math.hypot(x - CP.x, y - CP.y) < CP.r + 4) && !(LG && x > LG.x - 3 && x < LG.x + LG.w + 3 && y > LG.y - 3 && y < LG.y + LG.h + 3);
          if (ok) { if (!run) run = [x, x]; run[1] = x; } else if (run) { runs.push(run); run = null; }
        }
        if (run) runs.push(run);
        for (const [a, b] of runs) { let x = a; while (x < b) { const e = Math.min(b, x + 30 + RS() * 100); if (e - x > 1.5) d += `M${f(x)} ${f(y)}H${f(e)}`; x = e + 1.5 + RS() * 4; } }
      }
      out.push(el(d, wS)); }
    for (const lp of loops) out.push(`<path d="${P(lp, true)}" fill="#fff" stroke="#000" stroke-width="${f(wC)}"/>`);

    // ---- joet: puu suulta latvoille, haarat pehmeinä käyrinä
    { const RC = {}, rk = (i, j) => i + ',' + j;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (T[j][i] === 'river') RC[rk(i, j)] = [(i + .5) * CS + (hf(i, j, 11) - .5) * 6, (j + .5) * CS + (hf(i, j, 12) - .5) * 5, i, j];
      const done = new Set();
      for (const k0 in RC) {
        if (done.has(k0)) continue;
        const comp = [], st = [k0]; done.add(k0);
        while (st.length) { const c = st.pop(); comp.push(c); const [, , i, j] = RC[c]; for (const [a, b] of N8) { const kk = rk(i + a, j + b); if (RC[kk] && !done.has(kk)) { done.add(kk); st.push(kk); } } }
        let root = null, wdir = null;
        for (const c of comp) { const [, , i, j] = RC[c]; for (const [a, b] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (!root && !land(i + a, j + b)) { root = c; wdir = [a, b]; } }
        if (!root) root = comp[0];
        // Dijkstra: suorat askeleet halvempia kuin vinot
        const dist = { [root]: 0 }, par = { [root]: null }, open = [root];
        while (open.length) { open.sort((a, b) => dist[a] - dist[b]); const c = open.shift(); const [, , i, j] = RC[c];
          for (const [a, b] of N8) { const kk = rk(i + a, j + b); if (!RC[kk]) continue; const nd = dist[c] + (a && b ? 1.5 : 1); if (dist[kk] === undefined || nd < dist[kk]) { dist[kk] = nd; par[kk] = c; if (!open.includes(kk)) open.push(kk); } } }
        const kids = {}; for (const c in par) if (par[c]) (kids[par[c]] = kids[par[c]] || []).push(c);
        const far = {}; const depthOf = c => far[c] !== undefined ? far[c] : (far[c] = 1 + Math.max(0, ...(kids[c] || []).map(depthOf)));
        depthOf(root);
        const r0 = RC[root], mouth = wdir ? [r0[0] + wdir[0] * 11, r0[1] + wdir[1] * 11] : null;
        const drawn = new Set(); let first = true;
        const branch = start => { const pts = []; let c = start; while (c) { pts.push(RC[c].slice(0, 2)); if (drawn.has(c)) break; drawn.add(c); c = par[c]; } return pts; };
        // haarat järjestyksessä pisimmästä lyhimpään
        const leaves = Object.keys(par).filter(c => !kids[c]).sort((a, b) => dist[b] - dist[a]);
        for (const lf of leaves) {
          const pts = branch(lf); if (first && mouth) pts.push(mouth);
          if (pts.length < 2) continue;
          const d = smoothD(pts, false); out.push(el(d, wM));
          if (first && pts.length > 3) { const tail = pts.slice(Math.floor(pts.length * .35)).map(([x, y]) => [x + 2.3, y + .4]); out.push(el(smoothD(tail, false), wT)); }
          first = false;
        }
      } }

    // ---- symbolit (piirtojärjestys ylhäältä alas, valkoinen täyttö piilottaa takana olevat viivat)
    const SYM = [];
    const S = {
      mountain(cx, b, s, r) { const h = 19 * s, w = 11 * s, L = [cx - w, b], Pk = [cx + (r() - .5) * 3 * s, b - h], R = [cx + w, b], M = [Pk[0] + (R[0] - Pk[0]) * .15 + 2 * s, b];
        return white(P([L, Pk, R], true)) + el(hatchD([Pk, R, M], spY), wT) + el(P([L, Pk, R])); },
      hill(cx, b, s) { const a = [cx - 9.5 * s, b], c1 = [cx - 5 * s, b - 9 * s], m = [cx + 1 * s, b - 7 * s], c2 = [cx + 6.5 * s, b - 6.2 * s], e = [cx + 9.5 * s, b];
        const d = `M${pt(a)}Q${pt(c1)} ${pt(m)}Q${pt(c2)} ${pt(e)}`; const right = quadPts(m, c2, e, 8).concat([[cx + 2 * s, b]]);
        return white(d + 'Z') + el(hatchD(right, spY), wT) + el(d); },
      conifer(x, b, s) { const h = 12 * s, w = 4.4 * s, top = [x, b - h], r = [x + w, b - 2 * s], l = [x - w, b - 2 * s], mr = [x + w * .62, b - h * .55], ml = [x - w * .62, b - h * .55];
        let g = ''; for (let n = 0; n < 2; n++) g += seg(x + 1, b + .5 + n * 2, x + w * (1.7 - n * .5), b + .5 + n * 2);
        const tri = [top, mr, [x + w * .35, b - h * .55], r, l, [x - w * .35, b - h * .55], ml];
        return el(g, wT) + white(P(tri, true)) + el(hatchD([top, mr, [x + w * .35, b - h * .55], r, [x + .4, b - 2 * s]], spY, .6), wT) + el(P(tri, true) + seg(x, b - 2 * s, x, b)); },
      deciduous(x, b, s, r) { const R = 4.8 * s, cy = b - 3.6 * s - R, n = 8, p = [];
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2, q = R * (.84 + r() * .26); p.push([x + Math.cos(a) * q, cy + Math.sin(a) * q * .9]); }
        let d = 'M' + pt(p[0]), poly = [];
        for (let i = 0; i < n; i++) { const a = p[i], c = p[(i + 1) % n], mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, ox = mx - x, oy = my - cy, L = Math.hypot(ox, oy) || 1, bulge = R * .38, cp = [mx + ox / L * bulge, my + oy / L * bulge]; d += 'Q' + pt(cp) + ' ' + pt(c); poly = poly.concat(quadPts(a, cp, c, 4).slice(0, 4)); }
        let g = ''; for (let i = 0; i < 2; i++) g += seg(x + 1, b + .5 + i * 2, x + R * (1.5 - i * .5), b + .5 + i * 2);
        const trunk = `M${f(x - .9 * s)} ${f(b)}Q${f(x - .5 * s)} ${f(cy + R * .5)} ${f(x - .3 * s)} ${f(cy + R * .3)}M${f(x + .9 * s)} ${f(b)}Q${f(x + .5 * s)} ${f(cy + R * .5)} ${f(x + .3 * s)} ${f(cy + R * .3)}`;
        return el(g, wT) + el(trunk) + white(d + 'Z') + el(hatchD(poly, spY, .6, x + R * .1), wT) + el(d + 'Z'); },
      shrubs(x, b, s, r) { const w = 3.3 * s, h = 3 * s; let d = `M${f(x - w * 1.5)} ${f(b)}`, poly = [[x - w * 1.5, b]];
        for (let i = 0; i < 3; i++) { const x0 = x - w * 1.5 + i * w, x1 = x0 + w, hh = h * (.75 + r() * .45), cp = [(x0 + x1) / 2, b - hh * 1.5]; d += `Q${pt(cp)} ${f(x1)} ${f(b - (i < 2 ? h * .25 : 0))}`; poly = poly.concat(quadPts([x0, b], cp, [x1, b], 5).slice(1)); }
        return white(d + 'Z') + el(seg(x - w * .5, b + 1.2, x + w * 1.9, b + 1.2), wT) + el(hatchD(poly, spY, .3, x + w * .6), wT) + el(d); },
      palm(x, b, s, r) {
        const lean = (r() < .5 ? -1 : 1) * (2.5 + r() * 2.5) * s, h = 16 * s, top = [x + lean, b - h], c = [x + lean * .1, b - h * .55];
        const tw = .9 * s, sideL = `M${f(x - tw)} ${f(b)}Q${f(c[0] - tw * .8)} ${f(c[1])} ${f(top[0] - tw * .5)} ${f(top[1])}`, sideR = `M${f(x + tw)} ${f(b)}Q${f(c[0] + tw * .8)} ${f(c[1])} ${f(top[0] + tw * .5)} ${f(top[1])}`;
        const spine = quadPts([x, b], c, top, 10); let rings = '';
        for (let i = 2; i < 10; i += 2) { const [px, py] = spine[i], w = tw * (1 - i / 20); rings += `M${f(px - w)} ${f(py + .5)}Q${f(px)} ${f(py + 1.3)} ${f(px + w)} ${f(py + .5)}`; }
        let g = el(seg(x - 1, b + 1, x + 9 * s, b + 1) + seg(x + 2, b + 3, x + 6 * s, b + 3), wT);
        g += white(`M${f(x - tw)} ${f(b)}Q${f(c[0] - tw * .8)} ${f(c[1])} ${f(top[0] - tw * .5)} ${f(top[1])}L${f(top[0] + tw * .5)} ${f(top[1])}Q${f(c[0] + tw * .8)} ${f(c[1])} ${f(x + tw)} ${f(b)}Z`) + el(sideL + sideR) + el(rings, wT);
        const angs = [-165, -125, -90 + 20 * (r() - .5), -55, -15];
        const fronds = angs.map(ang => { const a = ang * Math.PI / 180, L = (8.5 + r() * 3) * s, dx = Math.cos(a), dy = Math.sin(a);
          const tip = [top[0] + dx * L, top[1] + dy * L * .35 + L * .6], cp = [top[0] + dx * L * .6, top[1] + dy * L * .5 - L * .3];
          return { tip, cp, L }; }).sort((u, v) => u.tip[1] - v.tip[1]);
        for (const { tip, cp, L } of fronds) {
          const sp = quadPts(top, cp, tip, 12), up = [], dn = [];
          for (let i = 0; i <= 12; i++) { const t = i / 12, a = sp[Math.max(0, i - 1)], c2 = sp[Math.min(12, i + 1)], tx = c2[0] - a[0], ty = c2[1] - a[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl, w = 1.9 * s * Math.sin(Math.PI * Math.min(1, t * 1.15)) + .1;
            up.push([sp[i][0] + nx * w, sp[i][1] + ny * w]); dn.push([sp[i][0] - nx * w, sp[i][1] - ny * w]); }
          let lf = ''; for (let i = 2; i < 12; i += 2) { const t = i / 12, back = 1.1 * s; const tx = sp[i + 1][0] - sp[i - 1][0], ty = sp[i + 1][1] - sp[i - 1][1], tl = Math.hypot(tx, ty) || 1;
            for (const q of [up[i], dn[i]]) lf += seg(sp[i][0], sp[i][1], q[0] - tx / tl * back * (1 - t * .5), q[1] - ty / tl * back * (1 - t * .5)); }
          g += white(smoothD(up.concat(dn.reverse()), true)) + el(`M${pt(top)}Q${pt(cp)} ${pt(tip)}`) + el(lf, wT);
        }
        for (const [ox, oy] of [[-1.1, 1.2], [1, 1.4], [0, 2.2]]) g += `<circle cx="${f(top[0] + ox * s)}" cy="${f(top[1] + oy * s)}" r="${f(1 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wT)}"/>`;
        return g; },
      treasure(x, y) { return el([-.7, .7].map(oo => seg(x - 5 + oo, y - 5, x + 5 + oo, y + 5) + seg(x + 5 + oo, y - 5, x - 5 + oo, y + 5)).join('')); },
    };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const t = T[j][i], cx = (i + .5) * CS, b = (j + 1) * CS - 2, r = rng(h32(i, j, 77));
      if (t === 'mountain') { const s = .75 + r() * .6, x = cx + (r() - .5) * 5, y = b + (r() - .5) * 3; SYM.push([y, S.mountain(x, y, s, r)]); if (r() < .35) { const y2 = b + 3; SYM.push([y2, S.mountain(cx + (r() < .5 ? -7 : 7), y2, .45 + r() * .25, r)]); } }
      else if (t === 'hill') { const y = b - 2 + (r() - .5) * 3; SYM.push([y, S.hill(cx + (r() - .5) * 4, y, .7 + r() * .5)]); }
      else if (t === 'conifer') { const n = 1 + Math.floor(r() * 3); for (let q = 0; q < n; q++) { const y = (j + .35) * CS + r() * CS * .7; SYM.push([y, S.conifer(cx + (r() - .5) * 12, y, .6 + r() * .7)]); } }
      else if (t === 'deciduous') { const n = 1 + Math.floor(r() * 2.4); for (let q = 0; q < n; q++) { const x = cx + (r() - .5) * 11, y = (j + .4) * CS + r() * CS * .6; SYM.push([y, r() < .2 ? S.conifer(x, y, .6 + r() * .4) : S.deciduous(x, y, .7 + r() * .5, r)]); } }
      else if (t === 'shrubs') { const n = 3 + Math.floor(r() * 3); for (let q = 0; q < n; q++) { const y = (j + .3) * CS + r() * CS * .75; SYM.push([y, S.shrubs(cx + (r() - .5) * 13, y, .6 + r() * .55, r)]); } }
      else if (t === 'palm') { const n = r() < .4 ? 2 : 1; for (let q = 0; q < n; q++) { const y = (j + .55) * CS + r() * CS * .4; SYM.push([y, S.palm(cx + (r() - .5) * 10, y, .9 + r() * .35, r)]); } }
      else if (t === 'grass' && r() < .12) { let nb = 0; for (const [a, c] of N8) if (land(i + a, j + c)) nb++; if (nb > 4) { const x = cx + (r() - .5) * 8; SYM.push([b, el(`M${f(x - 2.5)} ${f(b - 4)}Q${f(x - 1.5)} ${f(b - 2)} ${f(x - .5)} ${f(b - .5)}M${f(x)} ${f(b - 5)}L${f(x)} ${f(b - .5)}M${f(x + 2.5)} ${f(b - 4)}Q${f(x + 1.5)} ${f(b - 2)} ${f(x + .5)} ${f(b - .5)}`, wT)]); } }
      else if (t === 'treasure') SYM.push([(j + .5) * CS + 6, S.treasure(cx, (j + .5) * CS)]);
    }
    SYM.sort((a, b) => a[0] - b[0]).forEach(s => out.push(s[1]));

    // ---- kraken: jättikalmari, vesirajan alapuoli rajattu pois
    function tentacle(bx, by, a0, len, w0, curl, ph, club, sc) {
      const N = 18, pts = []; let x = bx, y = by;
      for (let i = 0; i <= N; i++) { const s = i / N, a = a0 + curl * s * s * 2.6 + .32 * Math.sin(1.1 + ph + s * 3.2) * s; const w = club ? (s < .7 ? w0 * (.55 - .2 * s) : w0 * (.9 * Math.sin((s - .7) / .3 * Math.PI) + .15)) : w0 * Math.pow(1 - s, .85) + .35; pts.push([x, y, a, w, s]); x += Math.cos(a) * len / N; y += Math.sin(a) * len / N; }
      const Lf = [], Rt = []; for (const [x2, y2, a, w] of pts) { const nx = -Math.sin(a), ny = Math.cos(a); Lf.push([x2 + nx * w, y2 + ny * w]); Rt.push([x2 - nx * w, y2 - ny * w]); }
      let g = shape(smoothD(Lf.concat(Rt.reverse()), true), wM / sc); const sg = curl > 0 ? 1 : -1; let d = '';
      for (let i = 1; i < N; i++) { const [x2, y2, a, w, s] = pts[i]; if (club && s < .7) continue; const nx = -Math.sin(a) * sg, ny = Math.cos(a) * sg, rr = Math.max(.7, w * .3); d += `M${f(x2 + nx * w * .5 + rr)} ${f(y2 + ny * w * .5)}a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0`; }
      return g + el(d, wT / sc);
    }
    let kn = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (T[j][i] === 'kraken') {
      const KS = 1.25, cx = (i + .5) * CS, cy = (j + .9) * CS, wl = x => 352 + (((x / 4) | 0) % 2 ? 1 : -1) * .8;
      const clip = [[470, 170], [646, 170]]; for (let x = 646; x >= 470; x -= 8) clip.push([x, wl(x)]);
      let g = `<clipPath id="kclip${kn}"><path d="${P(clip, true)}"/></clipPath><g transform="translate(${f(cx)} ${f(cy)}) scale(${KS}) translate(-558 -352)"><g clip-path="url(#kclip${kn})">`;
      g += tentacle(540, 354, -2.25, 72, 6, -1.1, 0, false, KS) + tentacle(574, 354, -.95, 62, 6, 1.1, 1, false, KS) + tentacle(548, 356, -1.85, 92, 5, -.7, 2, true, KS) + tentacle(566, 356, -1.3, 88, 5, .8, 3, true, KS);
      const bx = 558, by = 356, tx = 582, ty = 262, ax = tx - bx, ay = ty - by, L = Math.hypot(ax, ay), ux = ax / L, uy = ay / L, nx = -uy, ny = ux, at = (s, oo) => [bx + ax * s + nx * oo, by + ay * s + ny * oo];
      g += shape(P([at(.68, -8), at(.82, -17), [tx, ty], at(.82, 17), at(.68, 8)], true), wM / KS) + el(P([at(.68, 0), [tx, ty]]), wT / KS);
      const sd = [[0, 17], [.2, 20.5], [.4, 19], [.6, 14], [.8, 7]], ml = sd.map(([s, oo]) => at(s, -oo)), mr = sd.map(([s, oo]) => at(s, oo)).reverse();
      g += shape(smoothD(ml.concat([[tx, ty]], mr), true), wM / KS);
      let d = ''; for (let s = .16; s < .8; s += .06) { const w = 20 * (1 - s * .85); d += P([at(s, w * .3), at(s - .03, w * .95)]); } g += el(d, wT / KS);
      d = ''; for (const [s, oo, rr] of [[.3, -6, 2], [.45, -9, 1.5], [.55, -3, 1.7], [.38, 2, 1.3], [.62, -7, 1.2]]) { const c = at(s, oo); d += `M${f(c[0] + rr)} ${f(c[1])}a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0`; } g += el(d, wT / KS);
      const e = at(.11, -9);
      g += `<ellipse cx="${f(e[0])}" cy="${f(e[1])}" rx="6.5" ry="5" transform="rotate(${f(Math.atan2(uy, ux) * 180 / Math.PI)} ${f(e[0])} ${f(e[1])})" fill="#fff" stroke="#000" stroke-width="${f(wM / KS)}"/><circle cx="${f(e[0])}" cy="${f(e[1])}" r="2.8" fill="#000"/><circle cx="${f(e[0] - 1)}" cy="${f(e[1] - 1)}" r=".8" fill="#fff"/>`;
      g += tentacle(528, 357, -2.9, 58, 7, 1.5, 4, false, KS) + tentacle(586, 357, -.25, 48, 7, -1.5, 5, false, KS) + tentacle(552, 358, -2.2, 40, 6.5, 1.7, 6, false, KS);
      g += '</g>';
      d = ''; for (let x = 486; x < 632; x += 13) d += `M${f(x)} ${f(wl(x) + 6)}Q${f(x + 4)} ${f(wl(x) + 2.5)} ${f(x + 8)} ${f(wl(x) + 6)}`;
      g += el(smoothD(Array.from({ length: 21 }, (_, q) => [478 + q * 8.2, wl(478 + q * 8.2)]), false), wM / KS) + el(d, wT / KS) + '</g>';
      out.push(g); kn++;
    }

    // ---- alueiden nimet: sijoitus tyylisääntöjen mukaan, törmäyksiä vältellen
    const txt = (s, x, y, size, oo) => font.text(s, x, y, size, Object.assign({ w: wM, halo: wM * 4 + 1.5 }, oo || {}));
    const placed = [];
    if (LG) placed.push({ x0: LG.x, y0: LG.y, x1: LG.x + LG.w, y1: LG.y + LG.h });
    if (CP) placed.push({ x0: CP.x - CP.r, y0: CP.y - CP.r - 14, x1: CP.x + CP.r, y1: CP.y + CP.r });
    const titleW = doc.title ? font.textPath(doc.title, 0, 0, 14, 5, 'l').w : 0, titleX = Math.max(1.6 * CS + titleW / 2, Math.min(MW / 2, (CP ? CP.x - CP.r - 2 * CS : MW) - titleW / 2));
    if (o.title && doc.title) placed.push({ x0: titleX - titleW / 2, y0: MH - 2.3 * CS - 3, x1: titleX + titleW / 2, y1: MH - 2.3 * CS + 17 });
    const AM = areasM.model(doc), labelsOut = [], outlines = [];
    const busy = { mountain: 3, conifer: 1, deciduous: 1, palm: 1, treasure: 4, kraken: 4, hill: 1, river: 1 };
    for (const name of AM.order.slice().sort((a, b) => AM.byName[a].level - AM.byName[b].level || AM.byName[b].size - AM.byName[a].size)) {
      const A = AM.byName[name]; if (!A.size) continue;
      const st = areasM.styleFor(doc, AM, name);
      if (st.outline) { let d = ''; for (const c of A.cells) { const x = c % W, y = (c / W) | 0, X = x * CS, Y = y * CS, has = (i, j) => i >= 0 && j >= 0 && i < W && j < H && A.cells.has(j * W + i);
          if (!has(x, y - 1)) d += seg(X, Y, X + CS, Y); if (!has(x, y + 1)) d += seg(X, Y + CS, X + CS, Y + CS); if (!has(x - 1, y)) d += seg(X, Y, X, Y + CS); if (!has(x + 1, y)) d += seg(X + CS, Y, X + CS, Y + CS); }
        outlines.push(`<path d="${d}" fill="none" stroke="#000" stroke-width="${f(wT)}" stroke-dasharray="${f(wT * .1)} ${f(mm(1.2))}"/>`); }
      if (st.hide) continue;
      const text = areasM.displayName(doc, name), size = st.size || 10, gap = st.spacing === 'wide' ? size * .75 : size * .35, tw = font.textPath(text, 0, 0, size, gap, 'l').w;
      let landN = 0; for (const c of A.cells) if (land(c % W, (c / W) | 0)) landN++;
      const place = st.at ? 'at' : (st.place || (landN > A.size * .25 ? 'land' : 'water'));
      let anchor;
      if (place === 'at') anchor = [st.at[0] + .5, st.at[1] + .5];
      else if (place === 'center') anchor = [A.bbox.x + A.bbox.w / 2, A.bbox.y + A.bbox.h / 2];
      else {
        const want = place === 'land'; let sx = 0, sy = 0, n = 0; for (const c of A.cells) { const x = c % W, y = (c / W) | 0; if (land(x, y) === want) { sx += x; sy += y; n++; } }
        if (!n) anchor = [A.bbox.x + A.bbox.w / 2, A.bbox.y + A.bbox.h / 2];
        else if (want) { const cx = sx / n, cy = sy / n; let best = null, bd = 1e9; for (const c of A.cells) { const x = c % W, y = (c / W) | 0; if (!land(x, y)) continue; const dd = Math.hypot(x - cx, y - cy); if (dd < bd) { bd = dd; best = [x + .5, y + .5]; } } anchor = best; }
        else { let best = null, bd = -1; for (const c of A.cells) { const x = c % W, y = (c / W) | 0; if (land(x, y)) continue; const dd = D[y][x] - Math.hypot(x + .5 - (A.bbox.x + A.bbox.w / 2), y + .5 - (A.bbox.y + A.bbox.h / 2)) * .05; if (dd > bd) { bd = dd; best = [x + .5, y + .5]; } } anchor = best; }
      }
      const offs = place === 'at' ? [[0, 0]] : [[0, 0], [0, .9], [0, -.9], [1.2, 0], [-1.2, 0], [0, 1.8], [0, -1.8], [2.4, 0], [-2.4, 0], [1.2, .9], [-1.2, .9], [1.2, -.9], [-1.2, -.9], [0, 2.7], [0, -2.7]];
      let best = null, bs = 1e18;
      for (const [ox, oy] of offs) {
        const cx = (anchor[0] + ox) * CS, cy = (anchor[1] + oy) * CS, b = { x0: cx - tw / 2 - 3, y0: cy - size / 2 - 3, x1: cx + tw / 2 + 3, y1: cy + size / 2 + 3 };
        let sc = Math.hypot(ox, oy) * 2;
        for (const p of placed) { const ix = Math.min(b.x1, p.x1) - Math.max(b.x0, p.x0), iy = Math.min(b.y1, p.y1) - Math.max(b.y0, p.y0); if (ix > 0 && iy > 0) sc += 1000 + ix * iy; }
        if (b.x0 < 0 || b.y0 < 0 || b.x1 > MW || b.y1 > MH) sc += 500;
        for (let y = Math.floor(b.y0 / CS); y <= Math.floor(b.y1 / CS); y++) for (let x = Math.floor(b.x0 / CS); x <= Math.floor(b.x1 / CS); x++) {
          const t = type(x, y); sc += busy[t] || 0; if (place === 'land' && !land(x, y)) sc += 1.5; if (place === 'water' && land(x, y)) sc += 3;
          if (!(x >= 0 && y >= 0 && x < W && y < H && A.cells.has(y * W + x))) sc += 2; }
        if (sc < bs) { bs = sc; best = { cx, cy, b }; }
      }
      placed.push(best.b);
      labelsOut.push(txt(text, best.cx, best.cy - size / 2, size, { gap }));
    }
    out.push(...outlines, ...labelsOut);

    // ---- kompassiruusu
    if (CP) { const { x: cx, y: cy, r } = CP; let g = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * .75)}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * .66)}" fill="none" stroke="#000" stroke-width="${f(wT)}"/>`;
      const ray = (n, L, w) => { const a = n * Math.PI / 8 - Math.PI / 2, t = [cx + Math.cos(a) * L, cy + Math.sin(a) * L], l = [cx + Math.cos(a - Math.PI / 2) * w, cy + Math.sin(a - Math.PI / 2) * w], rr = [cx + Math.cos(a + Math.PI / 2) * w, cy + Math.sin(a + Math.PI / 2) * w]; return shape(P([l, t, rr, [cx, cy]], true)) + el(hatchD([[cx, cy], rr, t], spY * .9), wT) + el(seg(cx, cy, t[0], t[1]), wT); };
      for (let n = 1; n < 16; n += 2) g += ray(n, r * .42, 2.5);
      for (let n = 0; n < 16; n += 2) g += ray(n, n % 4 === 0 ? r : r * .62, n % 4 === 0 ? 6.5 : 4);
      g += `<circle cx="${f(cx)}" cy="${f(cy)}" r="2.5" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/>`;
      out.push(g + txt('N', cx, cy - r - 12, 9)); }

    // ---- selite
    if (LG) { const { x: x0, y: y0, w, h } = LG;
      let g = `<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" fill="#fff" stroke="#000" stroke-width="${f(wC)}"/><rect x="${f(x0 + 4)}" y="${f(y0 + 4)}" width="${f(w - 8)}" height="${f(h - 8)}" fill="none" stroke="#000" stroke-width="${f(wT)}"/>`;
      g += txt('SELITE', x0 + w / 2, y0 + 11, 9, { gap: 4 }) + el(seg(x0 + 40, y0 + 25, x0 + w - 40, y0 + 25), wT);
      const lr = rng(3), col = [x0 + 22, x0 + w / 2 + 14], row = n => y0 + 44 + n * 19;
      const box = (x, y, sp) => { const p = [[x - 10, y - 10], [x + 10, y - 10], [x + 10, y], [x - 10, y]]; return el(hatchD(p, sp, .9), wS) + el(P(p, true), wT); };
      const draw = {
        conifer: (x, y) => S.conifer(x - 3, y, .8) + S.conifer(x + 4, y + 1, .65), deciduous: (x, y) => S.deciduous(x, y, .9, lr), shrubs: (x, y) => S.shrubs(x, y - 1, .85, lr),
        palm: (x, y) => S.palm(x, y - 1, .75, lr), mountain: (x, y) => S.mountain(x, y, .75, lr), hill: (x, y) => S.hill(x, y - 1, .9),
        river: (x, y) => el(smoothD([[x - 10, y - 9], [x - 3, y - 5], [x + 2, y - 6], [x + 10, y - 1]], false)) + el(smoothD([[x - 1, y - 4.4], [x + 3, y - 4.2], [x + 10.5, y + 1]], false), wT),
        treasure: (x, y) => S.treasure(x, y - 5),
        kraken: (x, y) => tentacle(x - 4, y, -1.4, 16, 2.4, -1.2, 0, false, 1) + tentacle(x + 3, y, -1.8, 13, 2.2, 1.3, 2, false, 1) + el(seg(x - 10, y, x + 10, y)),
        shallow: (x, y) => box(x, y, spS), deep: (x, y) => box(x, y, spS * 4),
      };
      const names = Object.assign({}, rlml.TYPE_NAMES, { shallow: 'matalikko', deep: 'syvä vesi' });
      legendItems.forEach((t, n) => { const c = n < LGrows ? 0 : 1, rr = n < LGrows ? n : n - LGrows; g += draw[t](col[c], row(rr)) + txt(names[t], col[c] + 16, row(rr) - 7, 7, { align: 'l', gap: 2.2, halo: 0 }); });
      out.push(g); }

    if (o.title && doc.title) out.push(txt(doc.title, titleX, MH - 2.3 * CS, 14, { gap: 5 }));
    if (o.frame) out.push(`<rect x="-10" y="-10" width="${MW + 20}" height="${MH + 20}" fill="none" stroke="#000" stroke-width="${f(wC)}"/><rect x="-5" y="-5" width="${MW + 10}" height="${MH + 10}" fill="none" stroke="#000" stroke-width="${f(wT)}"/>`);

    return { body: out.join('\n'), VW: MW + 2 * MG, VH: MH + 2 * MG, MG, k, cellMM: o.cellMM, W, H };
  }

  function wrap(sc, inner) {
    return `<rect width="${sc.VW}" height="${sc.VH}" fill="#fff"/><g transform="translate(${sc.MG} ${sc.MG})">${inner || sc.body}</g>`;
  }
  // Koko kuva yhtenä SVG:nä millimetrikoossa
  function svgWhole(sc, title) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(sc.VW / sc.k)}mm" height="${f(sc.VH / sc.k)}mm" viewBox="0 0 ${sc.VW} ${sc.VH}" stroke-linecap="round" stroke-linejoin="round">${title ? `<title>${title}</title>` : ''}${wrap(sc)}</svg>`;
  }

  const api = { scene, svgWhole, wrap, DEFAULTS, CS, MG };
  KG.renderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
