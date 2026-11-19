// Nimetyt alueet: suorakulmioiden yhdisteet, hierarkia geometriasta ja tarkistukset.
//
// - Ruutu kuuluu kaikkiin alueisiin, joiden suorakulmioon se osuu.
// - Alue A on alueen B vanhempi, jos kaikki B:n ruudut ovat A:ssa ja A on suurempi;
//   vanhemmaksi valitaan pienin tällainen, tasatilanteessa myöhemmin määritelty.
//   Taso = lähimpien vanhempien ketjun pituus.
// - Alueet, joilla on samat ruudut, ovat samalla tasolla, ja niistä varoitetaan.
// - Ruudun tarkin alue on pienin sen sisältävä; tasatilanteessa myöhemmin määritelty.
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};

  function model(doc) {
    const W = doc.W, H = doc.H, order = [], byName = {};
    for (const a of doc.areas || []) {
      if (!byName[a.name]) { byName[a.name] = { name: a.name, rects: [], cells: new Set(), index: order.length }; order.push(a.name); }
      byName[a.name].rects.push(a);
    }
    for (const n of order) { const A = byName[n];
      for (const r of A.rects) for (let y = Math.max(0, r.y); y < Math.min(H, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(W, r.x + r.w); x++) A.cells.add(y * W + x);
      A.size = A.cells.size;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const c of A.cells) { const x = c % W, y = (c / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      A.bbox = A.size ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null; }
    const subset = (a, b) => { if (a.size > b.size) return false; for (const c of a.cells) if (!b.cells.has(c)) return false; return true; };
    // vanhempi: pienin aidosti suurempi alue, joka sisältää kaikki ruudut;
    // samanruutuiset alueet eivät ole toistensa vanhempia
    for (const n of order) { const A = byName[n]; let best = null;
      if (A.size) for (const m of order) { if (m === n) continue; const B = byName[m];
        if (B.size <= A.size || !subset(A, B)) continue;
        if (!best || B.size < best.size || (B.size === best.size && B.index > best.index)) best = B; }
      A.parent = best ? best.name : null; }
    for (const n of order) { let l = 0, p = byName[n].parent, guard = 0; while (p && guard++ < 100) { l++; p = byName[p].parent; } byName[n].level = l; }
    for (const n of order) byName[n].children = order.filter(m => byName[m].parent === n);
    // ruudun alueet laajimmasta tarkimpaan
    const at = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return []; const c = y * W + x;
      return order.filter(n => byName[n].cells.has(c)).sort((a, b) => byName[b].size - byName[a].size || byName[a].index - byName[b].index); };
    const roots = order.filter(n => !byName[n].parent);
    // puujärjestys (esim. editorin listaan)
    const tree = []; const walk = (n) => { tree.push(n); for (const c of byName[n].children) walk(c); }; roots.forEach(walk);
    return { order, byName, at, tree, roots, W, H };
  }

  function displayName(doc, name) {
    const t = doc.texts && doc.texts[name];
    if (t) return t;
    const s = String(name).replace(/_/g, ' ').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Tyylisääntöjen yhdistäminen: oletus < tasosääntö < nimisääntö
  function styleFor(doc, M, name) {
    const A = M.byName[name], out = { size: A.level === 0 ? 11 : A.level === 1 ? 8.5 : 7, spacing: A.level === 0 ? 'wide' : 'normal' };
    for (const r of doc.rules || []) if (r.level != null && r.level === A.level) Object.assign(out, strip(r));
    for (const r of doc.rules || []) if (r.name === name) Object.assign(out, strip(r));
    return out;
  }
  const strip = r => { const o = Object.assign({}, r); delete o.name; delete o.level; return o; };

  function validate(doc, M) {
    M = M || model(doc); const out = [];
    for (const a of doc.areas || []) {
      if (a.w < 1 || a.h < 1) out.push({ level: 'error', msg: `${a.name}: suorakulmion koko ${a.w}x${a.h} ei kelpaa` });
      if (a.x < 0 || a.y < 0 || a.x + a.w > doc.W || a.y + a.h > doc.H) out.push({ level: 'error', msg: `${a.name}: suorakulmio ${a.x},${a.y} size ${a.w}x${a.h} menee kartan ulkopuolelle` });
    }
    for (let i = 0; i < M.order.length; i++) for (let j = i + 1; j < M.order.length; j++) {
      const A = M.byName[M.order[i]], B = M.byName[M.order[j]]; let both = 0;
      for (const c of A.cells) if (B.cells.has(c)) both++;
      if (both && both < A.size && both < B.size) out.push({ level: 'warn', msg: `${A.name} ja ${B.name} menevät osittain päällekkäin (${both} ruutua)` });
      else if (A.size && both === A.size && both === B.size) out.push({ level: 'warn', msg: `${A.name} ja ${B.name}: samat ruudut, kaksi nimeä samalle paikalle` });
    }
    for (const n of M.order) if (!(doc.texts && doc.texts[n])) out.push({ level: 'info', msg: `${n}: ei tekstiä kielessä ${doc.lang || 'fi'}` });
    for (const r of doc.rules || []) if (r.name != null && !M.byName[r.name]) out.push({ level: 'warn', msg: `labels paper: aluetta ${r.name} ei ole kartalla` });
    for (const k of Object.keys(doc.texts || {})) if (!M.byName[k]) out.push({ level: 'info', msg: `text: aluetta ${k} ei ole kartalla` });
    return out;
  }

  // Saman alueen suorakulmiot: sisäkkäiset pois, ja kaksi suorakulmiota yhdistetään,
  // jos niiden yhdiste on itsekin suorakulmio (sama rivi- tai sarakeväli, päällekkäin tai vierekkäin).
  function mergeRects(list) {
    let r = list.map(a => Object.assign({}, a)), changed = true;
    const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < r.length; i++) for (let j = 0; j < r.length; j++) {
        if (i === j) continue; const a = r[i], b = r[j];
        if (inside(b, a)) { r.splice(j, 1); changed = true; break outer; }
        if (a.y === b.y && a.h === b.h && a.x <= b.x + b.w && b.x <= a.x + a.w) { const x = Math.min(a.x, b.x); a.w = Math.max(a.x + a.w, b.x + b.w) - x; a.x = x; r.splice(j, 1); changed = true; break outer; }
        if (a.x === b.x && a.w === b.w && a.y <= b.y + b.h && b.y <= a.y + a.h) { const y = Math.min(a.y, b.y); a.h = Math.max(a.y + a.h, b.y + b.h) - y; a.y = y; r.splice(j, 1); changed = true; break outer; }
      }
    }
    return r;
  }
  // Yhdistää jokaisen alueen suorakulmiot; palauttaa poistuneiden suorakulmioiden määrän
  function normalize(doc) {
    const order = [], by = {};
    for (const a of doc.areas || []) { if (!by[a.name]) { by[a.name] = []; order.push(a.name); } by[a.name].push(a); }
    const out = []; for (const n of order) out.push(...mergeRects(by[n]));
    const removed = (doc.areas || []).length - out.length;
    if (removed) doc.areas = out;
    return removed;
  }

  const api = { model, displayName, styleFor, validate, mergeRects, normalize };
  KG.areas = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
