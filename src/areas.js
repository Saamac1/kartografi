// Nimetyt alueet: suorakulmioiden yhdisteet, hierarkia geometriasta ja tarkistukset.
//
// - Ruutu kuuluu kaikkiin alueisiin, joiden suorakulmioon se osuu.
// - Alue A on alueen B vanhempi, jos kaikki B:n ruudut ovat A:ssa ja A on suurempi;
//   vanhemmaksi valitaan pienin tällainen. Taso = vanhempien määrä.
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
    // yhtä suurista samoista alueista myöhemmin määritelty on lapsi
    for (const n of order) { const A = byName[n]; let best = null;
      if (A.size) for (const m of order) { if (m === n) continue; const B = byName[m];
        if (!B.size || !subset(A, B)) continue;
        if (B.size === A.size && B.index > A.index) continue;
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
    }
    for (const n of M.order) if (!(doc.texts && doc.texts[n])) out.push({ level: 'info', msg: `${n}: ei tekstiä kielessä ${doc.lang || 'fi'}` });
    for (const r of doc.rules || []) if (r.name != null && !M.byName[r.name]) out.push({ level: 'warn', msg: `labels paper: aluetta ${r.name} ei ole kartalla` });
    for (const k of Object.keys(doc.texts || {})) if (!M.byName[k]) out.push({ level: 'info', msg: `text: aluetta ${k} ei ole kartalla` });
    return out;
  }

  const api = { model, displayName, styleFor, validate };
  KG.areas = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
