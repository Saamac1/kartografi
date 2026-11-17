// Luola- ja laivakarttojen piirto paperille (style paper cave | ship).
// Sama mustaviivainen tyyli kuin merikartassa: kallio ja meri vaakaviivoitettuina,
// luonnonseinät rosoisina, muuratut seinät ja laivan runko suorina.
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};
  const req = n => (typeof require !== 'undefined' ? require(n) : null);
  const R = () => KG.renderer || req('./renderer.js');
  const T = () => KG.tiles || req('./tiles.js');
  const F = () => KG.font || req('./font.js');
  const A = () => KG.areas || req('./areas.js');
  const CS = 16, MG = 24, TH = 34, LROW = 19;

  function legendEntries(doc, cls) {
    const used = new Set(); for (const r of doc.grid) for (const ch of r) used.add(ch);
    const out = [], seen = new Set(), add = (key, name) => { if (!seen.has(key)) { seen.add(key); out.push({ key, name }); } }, N = T().NAMES;
    for (const e of doc.legend) {
      if (!used.has(e.ch) || e.decor) continue; const c = cls[e.ch]; if (!c) continue;
      if (c.kind === 'door') add(c.locked ? 'door.locked' : 'door', N[c.locked ? 'door.locked' : 'door']);
      if (c.kind === 'stairs') { const sy = c.symbols.find(s => s === 'hatch' || s === 'ladder'); add(sy || 'stairs.' + (c.dir || 'down'), N[sy || 'stairs.' + (c.dir || 'down')]); }
      if (c.kind === 'exit') add('exit', N.exit);
      if (c.pattern && ['moss', 'runes'].includes(c.pattern)) add('pattern.' + c.pattern, N[c.pattern]);
      for (const s of c.symbols) if (!['hatch', 'ladder'].includes(s) && !s.startsWith('letter:')) add(s, N[s] || s);
    }
    for (const a of doc.at || []) if (a.with) { const root = a.with.split('.')[0].toUpperCase(), s = T().ENTITY[root]; if (s) add(s, N[s] || s); }
    return out;
  }
  function dims(doc, o) {
    const cls = T().classMap(doc), n = o.legend === false ? 0 : legendEntries(doc, cls).length, MW = doc.W * CS, cols = Math.max(1, Math.floor(MW / 150));
    const LH = n ? 30 + Math.ceil(n / cols) * LROW : 0;
    return { VW: MW + 2 * MG, VH: TH + doc.H * CS + (LH ? 18 + LH : 0) + 2 * MG, LH, cols };
  }

  function scene(doc, o) {
    const U = R().util, { f, pt, P, seg, smoothD, hatchD, noise, hf, rng, N8 } = U;
    const k = CS / o.cellMM, mm = v => v * k;
    const wM = mm(o.wMain), wC = mm(o.wCoast), wT = mm(o.wThin), wS = mm(o.wSea), spS = mm(o.spSea), spY = mm(o.spSym);
    const W = doc.W, H = doc.H, MW = W * CS, MH = H * CS, ship = doc.style === 'ship';
    const cls = T().classMap(doc);
    const edgeCls = (() => { const e = doc.vars && doc.vars.EDGE; const l = e && doc.legend.find(x => x.spec.split(/\s+/)[0] === e); return l ? cls[l.ch] : { kind: ship ? 'void' : 'solid', rough: !ship, symbols: [] }; })();
    const C = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? edgeCls : (cls[doc.grid[j][i]] || { kind: 'floor', symbols: [], unknown: true });
    const isOpen = (i, j) => ['floor', 'door', 'stairs', 'exit'].includes(C(i, j).kind);
    const isVoid = (i, j) => C(i, j).kind === 'void';
    const el = (d, w, fill) => d ? `<path d="${d}" fill="${fill || 'none'}" stroke="#000" stroke-width="${f(w == null ? wM : w)}"/>` : '';
    const shape = (d, w) => `<path d="${d}" fill="#fff" stroke="#000" stroke-width="${f(w == null ? wM : w)}"/>`;
    const out = [];

    // ---- rajaviivat ruutujen reunoja pitkin; rosoisuus seinäruudun mukaan
    function loopsOf(inside, roughOf) {
      const E = [], key = (x, y) => x + ',' + y;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        if (!inside(i, j)) continue;
        if (!inside(i, j - 1)) E.push([i + 1, j, i, j, roughOf(i, j - 1)]);
        if (!inside(i - 1, j)) E.push([i, j, i, j + 1, roughOf(i - 1, j)]);
        if (!inside(i, j + 1)) E.push([i, j + 1, i + 1, j + 1, roughOf(i, j + 1)]);
        if (!inside(i + 1, j)) E.push([i + 1, j + 1, i + 1, j, roughOf(i + 1, j)]);
      }
      const from = {}; E.forEach((e, n) => (from[key(e[0], e[1])] = from[key(e[0], e[1])] || []).push(n));
      const used = new Set(), loops = [];
      for (let n = 0; n < E.length; n++) {
        if (used.has(n)) continue; const lp = []; let c = n;
        while (c !== undefined && !used.has(c)) { used.add(c); const e = E[c]; lp.push(e); const nx = (from[key(e[2], e[3])] || []).find(m => !used.has(m)); c = nx; }
        // pisteet: kulmat ja kaksi välipistettä jokaiselle reunalle, paino = rosoisuus
        const pts = [];
        for (let q = 0; q < lp.length; q++) { const [x0, y0, x1, y1, w] = lp[q], wp = lp[(q - 1 + lp.length) % lp.length][4];
          pts.push([x0 * CS, y0 * CS, Math.min(w, wp)]); for (const t of [1 / 3, 2 / 3]) pts.push([(x0 + (x1 - x0) * t) * CS, (y0 + (y1 - y0) * t) * CS, w]); }
        // siirto ja pehmennys painon mukaan
        for (const p of pts) if (p[2]) { p[0] += ((noise(p[0] / 26, p[1] / 26, 31) - .5) * 9 + (noise(p[0] / 7, p[1] / 7, 32) - .5) * 3.5) * p[2]; p[1] += ((noise(p[0] / 26 + 7, p[1] / 26, 33) - .5) * 9 + (noise(p[0] / 7, p[1] / 7 + 5, 34) - .5) * 3.5) * p[2]; }
        for (let it = 0; it < 2; it++) { const q = pts.map(p => p.slice()); for (let i = 0; i < pts.length; i++) { const w = pts[i][2]; if (!w) continue; const a = q[(i - 1 + q.length) % q.length], b = q[(i + 1) % q.length]; pts[i][0] += ((a[0] + b[0]) / 2 - q[i][0]) * .5 * w; pts[i][1] += ((a[1] + b[1]) / 2 - q[i][1]) * .5 * w; } }
        loops.push(pts.map(p => [p[0], p[1]]));
      }
      return loops;
    }
    const spans = (loops, y, m) => { const xs = []; for (const lp of loops) for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } xs.sort((a, b) => a - b); const s = []; for (let i = 0; i + 1 < xs.length; i += 2) s.push([xs[i] - m, xs[i + 1] + m]); return s; };
    const inS = (s, x) => s.some(([a, b]) => x > a && x < b);
    const roughW = (i, j) => { const c = C(i, j); return c.kind === 'solid' && !c.straight && !ship ? 1 : 0; };
    const openLoops = loopsOf(isOpen, roughW);
    const hullLoops = ship ? loopsOf((i, j) => !isVoid(i, j), () => 0) : [];

    // etäisyys (ruutuina) avoimeen tilaan tai laivaan
    function distField(target) {
      const Dd = []; for (let j = 0; j < H; j++) { Dd.push([]); for (let i = 0; i < W; i++) Dd[j].push(target(i, j) ? 0 : 99); }
      for (let it = 0; it < 40; it++) { let ch = false; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (!Dd[j][i]) continue; let m = Dd[j][i]; for (const [a, b] of N8) { const x = i + a, y = j + b; if (x >= 0 && y >= 0 && x < W && y < H) m = Math.min(m, Dd[y][x] + (a && b ? 1.41 : 1)); } if (m < Dd[j][i]) { Dd[j][i] = m; ch = true; } } if (!ch) break; }
      return (x, y) => { const u = Math.min(W - 1.001, Math.max(0, x / CS - .5)), v = Math.min(H - 1.001, Math.max(0, y / CS - .5)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, g = (a, b) => Dd[Math.min(H - 1, b)][Math.min(W - 1, a)]; return g(i, j) * (1 - fu) * (1 - fv) + g(i + 1, j) * fu * (1 - fv) + g(i, j + 1) * (1 - fu) * fv + g(i + 1, j + 1) * fu * fv; };
    }
    function hatchRun(test, step, lvl, lw, solid) {
      let d = '';
      for (let n = 0; ; n++) { const y = 1 + n * step; if (y > MH - 1) break; const RS = rng(h(n)); let run = null; const runs = [];
        for (let x = 1; x <= MW - 1; x += 1.25) { const L = lvl(x, y); const ok = L && n % L === 0 && test(x, y); if (ok) { if (!run) run = [x, x]; run[1] = x; } else if (run) { runs.push(run); run = null; } }
        if (run) runs.push(run);
        for (const [a, b] of runs) { if (solid) { d += `M${f(a)} ${f(y)}H${f(b)}`; continue; } let x = a; while (x < b) { const e = Math.min(b, x + 30 + RS() * 90); if (e - x > 1.5) d += `M${f(x)} ${f(y)}H${f(e)}`; x = e + 1.5 + RS() * 4; } } }
      return el(d, lw);
    }
    const h = n => U.h32(n, 9, 77);
    const spanCache = new Map(), oSp = y => { const key = 'o' + y; if (!spanCache.has(key)) spanCache.set(key, spans(openLoops, y, 2.5)); return spanCache.get(key); };
    const hSp = y => { const key = 'h' + y; if (!spanCache.has(key)) spanCache.set(key, spans(hullLoops, y, 2.5)); return spanCache.get(key); };
    if (!ship) {
      // kallio: viivoitus seinän lähellä, harvenee ja loppuu kauempana
      const dO = distField(isOpen);
      out.push(hatchRun((x, y) => !inS(oSp(y), x), spS, (x, y) => { const dd = dO(x, y) + (noise(x / 30, y / 30, 41) - .5) * .9 + (noise(x / 9, y / 9, 42) - .5) * .35; return dd < 1.15 ? 1 : dd < 1.8 ? 2 : dd < 2.5 ? 3 : 0; }, wS));
    } else {
      const dH = distField((i, j) => !isVoid(i, j));
      out.push(hatchRun((x, y) => !inS(hSp(y), x), spS, (x, y) => { const dd = dH(x, y) + (noise(x / 38, y / 38, 5) - .5) * 1.2; return dd < 1.4 ? 1 : dd < 2.4 ? 2 : dd < 3.4 ? 3 : dd < 4.6 ? 4 : 6; }, wS));
      out.push(hatchRun((x, y) => inS(hSp(y), x) && !inS(oSp(y), x), spY * .8, () => 1, wT, true));
    }
    const evenodd = loops => loops.map(lp => P(lp, true)).join('');
    out.push(`<path d="${evenodd(openLoops)}" fill="#fff" fill-rule="evenodd" stroke="none"/>`);

    // ---- lattioiden kuviot ja ruudukko
    { let d = '', g = '';
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = C(i, j), x = i * CS, y = j * CS;
        if (c.pattern === 'planks') { for (const t of [1 / 3, 2 / 3]) d += seg(x, y + CS * t, x + CS, y + CS * t); const sx = x + CS * (.25 + ((i * 7 + j * 3) % 3) * .25); d += seg(sx, y + CS / 3, sx, y + 2 * CS / 3); }
        else if (c.pattern === 'boards') { for (const t of [.25, .5, .75]) d += seg(x + CS * t, y, x + CS * t, y + CS); }
        else if (c.pattern === 'gangplank') { const vert = isOpen(i, j - 1) || isOpen(i, j + 1) || C(i, j + 1).kind === 'exit'; if (vert) { d += seg(x + 2, y, x + 2, y + CS) + seg(x + CS - 2, y, x + CS - 2, y + CS); for (const t of [.25, .5, .75]) d += seg(x + 2, y + CS * t, x + CS - 2, y + CS * t); } else { d += seg(x, y + 2, x + CS, y + 2) + seg(x, y + CS - 2, x + CS, y + CS - 2); for (const t of [.25, .5, .75]) d += seg(x + CS * t, y + 2, x + CS * t, y + CS - 2); } }
        if (o.grid && isOpen(i, j)) { if (isOpen(i + 1, j)) g += seg(x + CS, y, x + CS, y + CS); if (isOpen(i, j + 1)) g += seg(x, y + CS, x + CS, y + CS); } }
      out.push(el(d, wT * .8));
      if (g) out.push(`<path d="${g}" fill="none" stroke="#000" stroke-width="${f(wT * .7)}" stroke-dasharray="${f(wT * .1)} ${f(mm(.9))}"/>`); }

    // ---- seinien kuviot (sammal, riimut) kallion puolelle seinäpinnan viereen
    const faceDir = (i, j) => { for (const [a, b] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (isOpen(i + a, j + b)) return [a, b]; return null; };
    { let d = '';
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = C(i, j); if (c.kind !== 'solid' || !c.pattern) continue; const fd = faceDir(i, j); if (!fd) continue;
        const cx = (i + .5) * CS - fd[0] * 3, cy = (j + .5) * CS - fd[1] * 3, r = rng(U.h32(i, j, 5));
        if (c.pattern === 'moss') for (let q = 0; q < 5; q++) { const x = cx + (r() - .5) * 12 + fd[0] * 4, y = cy + (r() - .5) * 12 + fd[1] * 4; d += `M${f(x - 1.6)} ${f(y)}Q${f(x)} ${f(y - 2.2)} ${f(x + 1.6)} ${f(y)}`; }
        if (c.pattern === 'runes') { const RN = [[[0, -3, 0, 3], [0, -3, 2, -1]], [[-1.5, -3, 1.5, 3], [1.5, -3, -1.5, 3]], [[0, -3, 0, 3], [-2, -1, 0, 1, 2, -1]], [[-2, -3, 0, 0, 2, -3], [0, 0, 0, 3]], [[0, -3, 0, 3], [0, -1, 2, -2.5], [0, 1, 2, -.5]]];
          for (let q = -1; q <= 1; q++) { const g = RN[Math.floor(r() * RN.length)], ox = cx + (fd[1] ? q * 4.5 : 0), oy = cy + (fd[0] ? q * 4.5 : 0); for (const s of g) { const pts = []; for (let n = 0; n < s.length; n += 2) pts.push([ox + s[n] * .8, oy + s[n + 1] * .8]); d += P(pts); } } } }
      out.push(el(d, wT)); }
    out.push(el(evenodd(hullLoops), wC), el(evenodd(openLoops), ship ? wM : wC));

    // ---- symbolit
    const S = {
      chest: (x, y, s) => shape(P([[x - 5 * s, y - 2 * s], [x + 5 * s, y - 2 * s], [x + 5 * s, y + 4 * s], [x - 5 * s, y + 4 * s]], true)) + shape(`M${f(x - 5 * s)} ${f(y - 2 * s)}Q${f(x)} ${f(y - 6 * s)} ${f(x + 5 * s)} ${f(y - 2 * s)}Z`) + el(seg(x - 5 * s, y + .3 * s, x + 5 * s, y + .3 * s), wT) + `<rect x="${f(x - .9 * s)}" y="${f(y - .4 * s)}" width="${f(1.8 * s)}" height="${f(2 * s)}" fill="#000"/>`,
      key: (x, y, s) => `<circle cx="${f(x - 3.5 * s)}" cy="${f(y)}" r="${f(2 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/>` + el(seg(x - 1.5 * s, y, x + 5 * s, y) + seg(x + 3 * s, y, x + 3 * s, y + 2 * s) + seg(x + 5 * s, y, x + 5 * s, y + 2.4 * s)),
      gold: (x, y, s) => [[-2.6, 1.2], [2.4, 1.6], [0, -1], [-.3, 2.6]].map(([a, b]) => `<ellipse cx="${f(x + a * s)}" cy="${f(y + b * s)}" rx="${f(2.3 * s)}" ry="${f(1.3 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wT * 1.3)}"/>`).join(''),
      gem: (x, y, s) => shape(P([[x - 4 * s, y - 1 * s], [x - 2 * s, y - 3.5 * s], [x + 2 * s, y - 3.5 * s], [x + 4 * s, y - 1 * s], [x, y + 4 * s]], true)) + el(P([[x - 4 * s, y - 1 * s], [x + 4 * s, y - 1 * s]]) + P([[x - 2 * s, y - 3.5 * s], [x - 1.2 * s, y - 1 * s], [x, y + 4 * s], [x + 1.2 * s, y - 1 * s], [x + 2 * s, y - 3.5 * s]]), wT),
      goblet: (x, y, s) => shape(`M${f(x - 3.5 * s)} ${f(y - 4 * s)}H${f(x + 3.5 * s)}Q${f(x + 3.5 * s)} ${f(y + .5 * s)} ${f(x)} ${f(y + .5 * s)}Q${f(x - 3.5 * s)} ${f(y + .5 * s)} ${f(x - 3.5 * s)} ${f(y - 4 * s)}Z`) + el(seg(x, y + .5 * s, x, y + 3.5 * s) + seg(x - 2.5 * s, y + 3.8 * s, x + 2.5 * s, y + 3.8 * s)),
      amulet: (x, y, s) => el(`M${f(x - 3.5 * s)} ${f(y - 5 * s)}Q${f(x - 3 * s)} ${f(y - .5 * s)} ${f(x)} ${f(y)}Q${f(x + 3 * s)} ${f(y - .5 * s)} ${f(x + 3.5 * s)} ${f(y - 5 * s)}`, wT) + `<circle cx="${f(x)}" cy="${f(y + 2 * s)}" r="${f(2.6 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/><circle cx="${f(x)}" cy="${f(y + 2 * s)}" r="${f(1 * s)}" fill="#000"/>`,
      himmeli: (x, y, s) => { const t = [x, y - 5.5 * s], b = [x, y + 5.5 * s], l = [x - 4 * s, y], r = [x + 4 * s, y], fl = [x - 1.5 * s, y + 1.2 * s], fr = [x + 1.8 * s, y - 1 * s];
        return shape(P([t, r, b, l], true), wT) + el(P([t, fl, b]) + P([l, fl, r]) + P([t, fr, b]) + P([l, fr, r]), wT); },
      pillar: (x, y, s) => { const r = 4.6 * s, p = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return shape(P(p, true)) + el(hatchD(p, spY, 0, x + r * .15), wT) + el(P(p, true)); },
      barrel: (x, y, s) => shape(`M${f(x - 3.5 * s)} ${f(y - 4.5 * s)}Q${f(x - 5 * s)} ${f(y)} ${f(x - 3.5 * s)} ${f(y + 4.5 * s)}H${f(x + 3.5 * s)}Q${f(x + 5 * s)} ${f(y)} ${f(x + 3.5 * s)} ${f(y - 4.5 * s)}Z`) + el(seg(x - 4.2 * s, y - 2 * s, x + 4.2 * s, y - 2 * s) + seg(x - 4.2 * s, y + 2 * s, x + 4.2 * s, y + 2 * s), wT),
      cannon: (x, y, s, i, j) => { let dir = [1, 0]; for (let rr = 1; rr <= 3; rr++) { const hit = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([a, b]) => !isOpen(i + a * rr, j + b * rr)); if (hit) { dir = hit; break; } }
        const [dx, dy] = dir, nx = -dy, ny = dx, q = (a, b) => [x + dx * a * s + nx * b * s, y + dy * a * s + ny * b * s];
        return shape(P([q(-4, -2.2), q(6, -1.4), q(6, 1.4), q(-4, 2.2)], true)) + `<circle cx="${f(q(-4.5, 0)[0])}" cy="${f(q(-4.5, 0)[1])}" r="${f(1.4 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/>` + el(P([q(-2, -3.6), q(-2, 3.6)]) + P([q(1.5, -3.2), q(1.5, 3.2)]), wT); },
      mast: (x, y, s) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4.5 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(2.2 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wT)}"/>` + el(seg(x - 7 * s, y, x - 4.5 * s, y) + seg(x + 4.5 * s, y, x + 7 * s, y), wT),
      helm: (x, y, s) => { let d = ''; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; d += seg(x + Math.cos(a) * 1.5 * s, y + Math.sin(a) * 1.5 * s, x + Math.cos(a) * 6.2 * s, y + Math.sin(a) * 6.2 * s); }
        return el(d, wT) + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4.5 * s)}" fill="none" stroke="#000" stroke-width="${f(wM)}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(1.5 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wT)}"/>`; },
      crate: (x, y, s) => { const a = 5 * s; return shape(P([[x - a, y - a], [x + a, y - a], [x + a, y + a], [x - a, y + a]], true)) + el(seg(x - a, y - a, x + a, y + a) + seg(x + a, y - a, x - a, y + a) + P([[x - a + 1.6 * s, y - a + 1.6 * s], [x + a - 1.6 * s, y - a + 1.6 * s], [x + a - 1.6 * s, y + a - 1.6 * s], [x - a + 1.6 * s, y + a - 1.6 * s]], true), wT); },
      table: (x, y, s) => shape(P([[x - 6 * s, y - 4 * s], [x + 6 * s, y - 4 * s], [x + 6 * s, y + 4 * s], [x - 6 * s, y + 4 * s]], true)) + el(P([[x - 3 * s, y - 2 * s], [x + 3 * s, y - 2.4 * s], [x + 3.4 * s, y + 2 * s], [x - 2.6 * s, y + 2.4 * s]], true) + seg(x - 1 * s, y - .5 * s, x + 1.5 * s, y + .8 * s), wT),
      anchor: (x, y, s) => el(seg(x, y - 4 * s, x, y + 4 * s) + seg(x - 2.5 * s, y - 2.5 * s, x + 2.5 * s, y - 2.5 * s) + `M${f(x - 4.5 * s)} ${f(y + 1.5 * s)}Q${f(x - 4 * s)} ${f(y + 5 * s)} ${f(x)} ${f(y + 4.5 * s)}Q${f(x + 4 * s)} ${f(y + 5 * s)} ${f(x + 4.5 * s)} ${f(y + 1.5 * s)}`) + `<circle cx="${f(x)}" cy="${f(y - 5 * s)}" r="${f(1.2 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wT)}"/>`,
      crew: (x, y, s) => `<circle cx="${f(x)}" cy="${f(y - 2.5 * s)}" r="${f(2.2 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/>` + shape(P([[x - 3.6 * s, y - 3.8 * s], [x, y - 7.2 * s], [x + 3.6 * s, y - 3.8 * s]], true), wT) + el(seg(x, y - .3 * s, x, y + 3.5 * s) + seg(x - 3 * s, y + 1.2 * s, x + 3 * s, y + 1.2 * s) + P([[x - 2.5 * s, y + 6 * s], [x, y + 3.5 * s], [x + 2.5 * s, y + 6 * s]]), wT),
      torch: (x, y, s, i, j) => { const fd = faceDir(i, j) || [0, 1], bx = (i + .5) * CS + fd[0] * CS * .5, by = (j + .5) * CS + fd[1] * CS * .5, tx = bx + fd[0] * 3.5, ty = by + fd[1] * 3.5;
        return el(seg(bx, by, tx, ty)) + shape(`M${f(tx)} ${f(ty - 5.5 * s)}Q${f(tx + 2.6 * s)} ${f(ty - 1.5 * s)} ${f(tx)} ${f(ty + .5 * s)}Q${f(tx - 2.6 * s)} ${f(ty - 1.5 * s)} ${f(tx)} ${f(ty - 5.5 * s)}Z`, wT) + el(seg(tx - 3 * s, ty - 2 * s, tx - 4.4 * s, ty - 2.6 * s) + seg(tx + 3 * s, ty - 2 * s, tx + 4.4 * s, ty - 2.6 * s) + seg(tx, ty - 6.5 * s, tx, ty - 8 * s), wT); },
      window: (x, y, s) => shape(P([[x - 3 * s, y - 3 * s], [x + 3 * s, y - 3 * s], [x + 3 * s, y + 3 * s], [x - 3 * s, y + 3 * s]], true)) + el(seg(x, y - 3 * s, x, y + 3 * s) + seg(x - 3 * s, y, x + 3 * s, y), wT),
      port: (x, y, s) => shape(P([[x - 3.5 * s, y - 3.5 * s], [x + 3.5 * s, y - 3.5 * s], [x + 3.5 * s, y + 3.5 * s], [x - 3.5 * s, y + 3.5 * s]], true)) + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.6 * s)}" fill="#000"/>`,
      lantern: (x, y, s) => { let d = ''; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; d += seg(x + Math.cos(a) * 3.6 * s, y + Math.sin(a) * 3.6 * s, x + Math.cos(a) * 5.4 * s, y + Math.sin(a) * 5.4 * s); } return el(d, wT) + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2.6 * s)}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/>`; },
    };
    const letter = (ch, x, y) => F().text(ch, x, y - 3.5, 7, { w: wT * 1.4 });
    function door(i, j, c) { const x = i * CS, y = j * CS, horiz = !isOpen(i - 1, j) && !isOpen(i + 1, j);
      const r = horiz ? [x + 1, y + CS * .36, CS - 2, CS * .28] : [x + CS * .36, y + 1, CS * .28, CS - 2];
      let g = `<rect x="${f(r[0])}" y="${f(r[1])}" width="${f(r[2])}" height="${f(r[3])}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/>`;
      if (c.locked) g += `<circle cx="${f(x + CS / 2)}" cy="${f(y + CS / 2 - .6)}" r="1.1" fill="#000"/>` + el(seg(x + CS / 2, y + CS / 2, x + CS / 2, y + CS / 2 + 1.8), wM);
      return g; }
    function openDir(i, j) { const pref = [[0, 1], [1, 0], [-1, 0], [0, -1]]; for (const [a, b] of pref) { const c = C(i + a, j + b); if (c.kind === 'floor' || c.kind === 'door') return [a, b]; } for (const [a, b] of pref) if (isOpen(i + a, j + b)) return [a, b]; return [0, 1]; }
    function stairs(i, j, c) {
      const [dx, dy] = openDir(i, j), cx = (i + .5) * CS, cy = (j + .5) * CS, nx = -dy, ny = dx, q = (a, b) => [cx + dx * a + nx * b, cy + dy * a + ny * b];
      if (c.symbols.includes('hatch')) { const a = 5.5; let d = P([q(-a, -a), q(a, -a), q(a, a), q(-a, a)], true); for (const t of [-a / 3, a / 3]) d += P([q(t, -a), q(t, a)]) + P([q(-a, t), q(a, t)]); return shape(P([q(-a, -a), q(a, -a), q(a, a), q(-a, a)], true)) + el(d, wT); }
      if (c.symbols.includes('ladder')) { let d = P([q(-7, -3.5), q(7, -3.5)]) + P([q(-7, 3.5), q(7, 3.5)]); for (let t = -5; t <= 5; t += 2.5) d += P([q(t, -3.5), q(t, 3.5)]); return el(d); }
      let d = ''; for (let n = 0; n < 5; n++) { const a = 6.5 - n * 3, w = c.dir === 'up' ? 6.5 - (4 - n) * 1.1 : 6.5 - n * 1.1; d += P([q(a, -w), q(a, w)]); }
      d += P([q(-6.5, -6.5), q(6.5, -6.5)]) + P([q(-6.5, 6.5), q(6.5, 6.5)]);
      return el(d, wT) + el(P(c.dir === 'up' ? [q(-3, -2.4), q(-6, 0), q(-3, 2.4)] : [q(-6, -2.4), q(-3, 0), q(-6, 2.4)]));
    }
    function exitSym(i, j) {
      let d = [0, 1]; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= W || y >= H || isVoid(x, y) || C(x, y).kind === 'solid') { d = [a, b]; if (x < 0 || y < 0 || x >= W || y >= H) break; } }
      const cx = (i + .5) * CS, cy = (j + .5) * CS, [dx, dy] = d, nx = -dy, ny = dx, q = (a, b) => [cx + dx * a + nx * b, cy + dy * a + ny * b];
      return el(P([q(-5, 0), q(5, 0)]) + P([q(1.5, -3.5), q(5.5, 0), q(1.5, 3.5)]), wM);
    }
    const SYM = [], s1 = 1;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = C(i, j), cx = (i + .5) * CS, cy = (j + .5) * CS;
      if (c.kind === 'door') SYM.push([cy, door(i, j, c)]);
      if (c.kind === 'stairs') SYM.push([cy, stairs(i, j, c)]);
      if (c.kind === 'exit') SYM.push([cy, exitSym(i, j)]);
      for (const s of c.symbols) { if (s === 'hatch' || s === 'ladder') continue; if (s.startsWith('letter:')) { SYM.push([cy, letter(s.slice(7), cx, cy)]); continue; } if (S[s]) SYM.push([cy + (s === 'torch' ? -100 : 0), S[s](cx, cy, s1, i, j)]); }
      if (c.unknown && !c.symbols.length && doc.grid[j][i] !== ' ') SYM.push([cy, letter(doc.grid[j][i], cx, cy)]);
    }
    for (const a of doc.at || []) if (a.with) { const root = a.with.split('.')[0].toUpperCase(), s = T().ENTITY[root]; const cx = (a.x + .5) * CS, cy = (a.y + .5) * CS; if (s && S[s]) SYM.push([cy, S[s](cx, cy, s1, a.x, a.y)]); else if (s !== null) SYM.push([cy, letter(root.charAt(0), cx, cy)]); }
    SYM.sort((a, b) => a[0] - b[0]).forEach(s => out.push(s[1]));

    // ---- nimet: siirtymät (as TO_…) ja nimetyt alueet
    const txt = (s, x, y, size, oo) => F().text(s, x, y, size, Object.assign({ w: wM, halo: wM * 4 + 1.5 }, oo || {}));
    const placed = [];
    const nameFor = id => doc.texts && doc.texts[id] ? doc.texts[id] : String(id).replace(/^TO_/, '').replace(/_/g, ' ');
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = C(i, j); if (!c.as || !/^TO_/.test(c.as) || !['stairs', 'exit'].includes(c.kind)) continue;
      const t = nameFor(c.as), size = 6.5, tw = F().textPath(t, 0, 0, size, size * .35, 'l').w; let best = null;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = (i + .5 + dx) * CS + (dx ? dx * tw / 2 - dx * 6 : 0), y = (j + .5 + dy * .9) * CS; if (x - tw / 2 < 0 || x + tw / 2 > MW || y < 4 || y > MH - 4) continue; const sc = (isOpen(i + dx, j + dy) ? 0 : 5); if (!best || sc < best.sc) best = { x, y, sc }; }
      if (best) { out.push(txt(t, best.x, best.y - size / 2, size)); placed.push({ x0: best.x - tw / 2, y0: best.y - size, x1: best.x + tw / 2, y1: best.y + size }); } }
    { const AM = A().model(doc);
      for (const name of AM.order.slice().sort((a, b) => AM.byName[a].level - AM.byName[b].level)) {
        const Ar = AM.byName[name]; if (!Ar.size) continue; const st = A().styleFor(doc, AM, name); if (st.hide) continue;
        let sx = 0, sy = 0, n = 0; for (const cc of Ar.cells) { const x = cc % W, y = (cc / W) | 0; if (isOpen(x, y)) { sx += x; sy += y; n++; } }
        const cx = st.at ? st.at[0] + .5 : n ? sx / n + .5 : Ar.bbox.x + Ar.bbox.w / 2, cy = st.at ? st.at[1] + .5 : n ? sy / n + .5 : Ar.bbox.y + Ar.bbox.h / 2;
        const t = A().displayName(doc, name), size = Math.min(st.size || 9, 10), gap = st.spacing === 'wide' ? size * .6 : size * .35;
        out.push(txt(t, cx * CS, cy * CS - size / 2, size, { gap }));
      } }
    if (o.frame) out.push(`<rect x="-10" y="-10" width="${MW + 20}" height="${MH + 20}" fill="none" stroke="#000" stroke-width="${f(wC)}"/><rect x="-5" y="-5" width="${MW + 10}" height="${MH + 10}" fill="none" stroke="#000" stroke-width="${f(wT)}"/>`);

    // ---- otsikko yläpuolelle, selite alle
    const dm = dims(doc, o), top = [];
    if (o.title && doc.title) top.push(txt(doc.title, MW / 2, 2, 13, { gap: 4.5, halo: 0 }));
    let below = '';
    if (o.legend !== false) {
      const items = legendEntries(doc, cls);
      if (items.length) {
        const y0 = TH + MH + 18, cols = dm.cols, rows = Math.ceil(items.length / cols), cw = MW / cols;
        below += `<rect x="0" y="${f(y0)}" width="${f(MW)}" height="${f(dm.LH)}" fill="#fff" stroke="#000" stroke-width="${f(wC)}"/><rect x="4" y="${f(y0 + 4)}" width="${f(MW - 8)}" height="${f(dm.LH - 8)}" fill="none" stroke="#000" stroke-width="${f(wT)}"/>`;
        below += txt('SELITE', MW / 2, y0 + 9, 8, { gap: 3.5, halo: 0 });
        const sample = (key, x, y) => {
          const fake = (kind, extra) => Object.assign({ kind, symbols: [], dir: null, locked: false }, extra || {});
          if (key === 'door' || key === 'door.locked') { const r = [x - 7, y - 2.2, 14, 4.4]; return `<rect x="${f(r[0])}" y="${f(r[1])}" width="${f(r[2])}" height="${f(r[3])}" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/>` + (key === 'door.locked' ? `<circle cx="${f(x)}" cy="${f(y - .6)}" r="1.1" fill="#000"/>` : ''); }
          if (key.startsWith('stairs.') || key === 'hatch' || key === 'ladder') { const g = stairsAt(x, y, key); return g; }
          if (key === 'exit') return el(P([[x - 5, y], [x + 5, y]]) + P([[x + 1.5, y - 3.5], [x + 5.5, y], [x + 1.5, y + 3.5]]));
          if (key === 'pattern.moss') { let d = ''; for (const [a, b] of [[-4, 1], [0, -1], [4, 1.5], [-1, 3]]) d += `M${f(x + a - 1.6)} ${f(y + b)}Q${f(x + a)} ${f(y + b - 2.2)} ${f(x + a + 1.6)} ${f(y + b)}`; return el(d, wT); }
          if (key === 'pattern.runes') return el(P([[x - 3, y - 3], [x - 3, y + 3]]) + P([[x - 3, y - 3], [x - 1, y - 1]]) + P([[x + 1, y - 3], [x + 4, y + 3]]) + P([[x + 4, y - 3], [x + 1, y + 3]]), wT);
          if (key === 'torch') return shape(`M${f(x)} ${f(y - 5)}Q${f(x + 2.6)} ${f(y - 1)} ${f(x)} ${f(y + 1)}Q${f(x - 2.6)} ${f(y - 1)} ${f(x)} ${f(y - 5)}Z`, wT) + el(seg(x, y + 1, x, y + 5));
          if (key === 'cannon') return shape(P([[x - 5, y - 2.2], [x + 6, y - 1.4], [x + 6, y + 1.4], [x - 5, y + 2.2]], true)) + `<circle cx="${f(x - 5)}" cy="${f(y)}" r="1.4" fill="#fff" stroke="#000" stroke-width="${f(wM)}"/>`;
          return S[key] ? S[key](x, y, .9, 0, 0) : '';
          function stairsAt(x, y, key) { if (key === 'hatch') { const a = 5.5; let d = P([[x - a, y - a], [x + a, y - a], [x + a, y + a], [x - a, y + a]], true); for (const t of [-a / 3, a / 3]) d += P([[x + t, y - a], [x + t, y + a]]) + P([[x - a, y + t], [x + a, y + t]]); return el(d, wT); }
            if (key === 'ladder') { let d = P([[x - 7, y - 3.5], [x + 7, y - 3.5]]) + P([[x - 7, y + 3.5], [x + 7, y + 3.5]]); for (let t = -5; t <= 5; t += 2.5) d += P([[x + t, y - 3.5], [x + t, y + 3.5]]); return el(d); }
            let d = ''; for (let n = 0; n < 5; n++) { const a = -6.5 + n * 3, w = key === 'stairs.up' ? 2 + n * 1.1 : 6.5 - n * 1.1; d += P([[x + a, y - w], [x + a, y + w]]); } return el(d, wT); }
        };
        items.forEach((it, n) => { const c = Math.floor(n / rows), r = n % rows, x = c * cw + 22, y = y0 + 30 + r * LROW; below += sample(it.key, x, y) + txt(it.name, x + 16, y - 3.5, 7, { align: 'l', gap: 2.2, halo: 0 }); });
      }
    }
    const body = top.join('') + `<g transform="translate(0 ${TH})">${out.join('\n')}</g>` + below;
    return { body, VW: dm.VW, VH: dm.VH, MG, oy: TH, k, cellMM: o.cellMM, W, H };
  }
  const api = { scene, dims, legendEntries };
  KG.dungeon = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
