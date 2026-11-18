// RLML-ruudukon editori.
//
// Tilat:
//   lukutila (readOnly)   – karttaa vieritetään vetämällä, napautus näyttää ruudun tiedot
//   piirtolukko (paintLock) – Alueet-välilehti: maastoa ei piirretä; ilman aluetyökalua kuten lukutila, napautus valitsee alueen
//   muokkaustila, työkalu:
//     paint  – sivellin, oikea nappi poimii palan, Vaihto+napsautus täyttää; näppäimistö = vim-korvaustila
//     area   – valitun nimetyn alueen rajaus: raahaa suorakulmio, kulmakahva muuttaa kokoa, oikea nappi poistaa
//     move   – nimetyn alueen siirto sisältöineen; tyhjäksi jäävä osa täytetään oletuspalalla (vesi)
// Kosketuksessa kaksi sormea vierittää aina.
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};
  const KCOL = { void: '#cfe2f2', solid: '#8f897d', floor: '#f6f2e6', door: '#c99a5b', stairs: '#b6a6d8', exit: '#f5a3a3' };
  // ruudun väri editorissa: merikartassa palan tyypin, luolissa ja laivoissa palaluokan mukaan
  function colorMap(doc) { const m = {}; if (!doc.style || doc.style === 'sea') { const tm = KG.rlml.typeMap(doc); for (const e of doc.legend) m[e.ch] = COLORS[tm[e.ch]] || '#fff'; return m; }
    const cm = KG.tiles.classMap(doc); for (const e of doc.legend) { const c = cm[e.ch]; m[e.ch] = c.symbols.length && c.kind === 'floor' ? '#f2e2a4' : c.pattern === 'planks' || c.pattern === 'boards' ? '#eadcbc' : c.pattern === 'moss' ? '#7f9070' : c.pattern === 'runes' ? '#9a8a78' : KCOL[c.kind] || '#fff'; } return m; }
  const COLORS = { water: '#cfe2f2', grass: '#eef2d4', shrubs: '#dbe6b2', conifer: '#9ec38a', deciduous: '#bedb98', palm: '#f2e2a4', mountain: '#c8c2b6', hill: '#e2d1ae', river: '#8ebfe8', treasure: '#f5c4c4', kraken: '#bba9de', cliff: '#a9a397', beach: '#f7ecc4', building: '#e8b98f', ruins: '#b9a48c', skullcave: '#d8d2c4', volcano: '#6e5a52' };

  class Editor {
    constructor(canvas, hooks) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks;
      this.cw = 13; this.ch = 17; this.cur = { x: 0, y: 0 }; this.typeStartX = 0; this.brush = '.'; this.brushSize = 1;
      this.undo = []; this.redo = []; this.drag = null; this.hover = null; this.mode = 'paint'; this.readOnly = false; this.paintLock = false;
      this.band = null; this.mv = null; this.rs = null; this.mpan = null; this.touches = new Map(); this.pan = null;
      // iso kartta: kangas on vain näkyvän alueen kokoinen ja kulkee vierityksen mukana; välike antaa vieritysalan
      this.sc = canvas.parentElement; this.sp = document.createElement('div'); this.sp.className = 'edspace';
      this.sc.insertBefore(this.sp, canvas); this.sp.appendChild(canvas); this.ox = 0; this.oy = 0; this.vw = 0; this.vh = 0;
      let raf = 0; const onView = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; this.layout(); this.draw(); }); };
      this.sc.addEventListener('scroll', onView, { passive: true });
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onView).observe(this.sc); else window.addEventListener('resize', onView);
      canvas.addEventListener('pointerdown', e => { if (this.touchDown(e)) return; this.down(e); });
      canvas.addEventListener('pointermove', e => { if (this.touchMove(e)) return; this.move(e); });
      window.addEventListener('pointerup', e => { if (this.touchUp(e)) return; this.up(); });
      window.addEventListener('pointercancel', e => { this.touchUp(e); this.cancel(); });
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('keydown', e => this.key(e));
    }
    get doc() { return this.hooks.getDoc(); }
    setDoc() { this.cur.x = Math.min(this.cur.x, this.doc.W - 1); this.cur.y = Math.min(this.cur.y, this.doc.H - 1); this.layout(); this.draw(); }
    // vain katselu: lukutila tai piirtolukko ilman aluetyökalua
    get viewOnly() { return this.readOnly || (this.paintLock && this.mode === 'paint'); }
    setReadOnly(v) { this.readOnly = v; this.band = this.mv = this.rs = this.drag = null; this.cv.classList.toggle('read', v); this.draw(); }
    // kangas peittää vierityssäiliön näkyvän osan (enintään koko kartan); piirto rajataan näkyviin ruutuihin
    layout() {
      const d = this.doc, r = window.devicePixelRatio || 1, W = d.W * this.cw, H = d.H * this.ch, sc = this.sc;
      this.sp.style.width = W + 'px'; this.sp.style.height = H + 'px';
      const vw = Math.max(1, Math.min(W, sc.clientWidth || W)), vh = Math.max(1, Math.min(H, sc.clientHeight || H));
      const ox = Math.max(0, Math.min(W - vw, sc.scrollLeft)), oy = Math.max(0, Math.min(H - vh, sc.scrollTop));
      if (vw !== this.vw || vh !== this.vh || this.cv.width !== Math.round(vw * r)) { this.cv.width = Math.round(vw * r); this.cv.height = Math.round(vh * r); this.cv.style.width = vw + 'px'; this.cv.style.height = vh + 'px'; this.vw = vw; this.vh = vh; }
      this.ox = ox; this.oy = oy; this.cv.style.left = ox + 'px'; this.cv.style.top = oy + 'px';
      this.ctx.setTransform(r, 0, 0, r, -ox * r, -oy * r);
    }
    types() { return KG.rlml.typeMap(this.doc); }
    fillChar() { return KG.rlml.fillChar(this.doc); }

    draw() {
      const d = this.doc, c = this.ctx, cm = colorMap(d), sea = !d.style || d.style === 'sea', tm = sea ? this.types() : null, cw = this.cw, ch = this.ch;
      this.layout();
      c.clearRect(this.ox, this.oy, this.vw, this.vh);
      c.font = `${ch - 4}px ui-monospace, Menlo, Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const i0 = Math.max(0, Math.floor(this.ox / cw)), i1 = Math.min(d.W, Math.ceil((this.ox + this.vw) / cw)), j0 = Math.max(0, Math.floor(this.oy / ch)), j1 = Math.min(d.H, Math.ceil((this.oy + this.vh) / ch));
      for (let j = j0; j < j1; j++) { const row = d.grid[j]; for (let i = i0; i < i1; i++) { const k = row[i], t = tm ? tm[k] : null;
        const known = cm[k] !== undefined; c.fillStyle = cm[k] || '#fff'; c.fillRect(i * cw, j * ch, cw, ch);
        c.fillStyle = !known ? '#c00' : sea && t === 'water' && k === '~' ? '#9db8d0' : cm[k] === KCOL.solid ? '#f4f1ea' : '#222'; c.fillText(k, i * cw + cw / 2, j * ch + ch / 2 + 1); } }
      for (const a of d.at || []) { const x = (a.x + .5) * cw, y = (a.y + .5) * ch; c.beginPath(); c.arc(x, y, 5.5, 0, 7); c.lineWidth = 2; c.strokeStyle = a.as ? '#c8143c' : '#2f5d8a'; c.stroke(); c.lineWidth = 1; }
      const M = this.hooks.getModel(), sel = this.hooks.selectedArea(), areaTool = !this.readOnly && (this.mode === 'area' || this.mode === 'move');
      for (const a of d.areas || []) { const A = M.byName[a.name], on = a.name === sel; if (!A || (!on && !areaTool && !this.hooks.showAreas())) continue;
        c.lineWidth = on ? 3 : 1.5; c.strokeStyle = on ? 'rgba(200,20,60,.95)' : `hsla(${(A.level * 70 + 210) % 360},70%,35%,.75)`; c.setLineDash(on ? [] : [5, 3]);
        c.strokeRect(a.x * cw + 1, a.y * ch + 1, a.w * cw - 2, a.h * ch - 2); }
      c.setLineDash([]); c.lineWidth = 1;
      if (!this.readOnly && this.mode === 'area' && sel) for (const a of d.areas || []) if (a.name === sel && (a.w > 1 || a.h > 1)) { c.fillStyle = 'rgba(200,20,60,.95)'; c.fillRect((a.x + a.w) * cw - 9, (a.y + a.h) * ch - 9, 8, 8); }
      if (this.band) { const b = this.norm(this.band); c.fillStyle = 'rgba(200,20,60,.12)'; c.fillRect(b.x * cw, b.y * ch, b.w * cw, b.h * ch); c.strokeStyle = '#c8143c'; c.lineWidth = 2; c.strokeRect(b.x * cw + 1, b.y * ch + 1, b.w * cw - 2, b.h * ch - 2); c.lineWidth = 1; }
      if (this.hover && !this.viewOnly && this.mode === 'paint') { const n = this.brushSize, o = Math.floor((n - 1) / 2); c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeRect((this.hover.x - o) * cw + .5, (this.hover.y - o) * ch + .5, n * cw - 1, n * ch - 1); }
      c.lineWidth = 2; c.strokeStyle = document.activeElement === this.cv ? '#2f5d8a' : '#888'; c.strokeRect(this.cur.x * cw + 1, this.cur.y * ch + 1, cw - 2, ch - 2); c.lineWidth = 1;
      this.hooks.onCursor(this.cur, d.grid[this.cur.y][this.cur.x]);
    }

    // ---- kosketus: kaksi sormea vierittää ja peruu juuri aloitetun toiminnon
    touchDown(e) {
      if (e.pointerType !== 'touch') return false;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.viewOnly) return true; // lukutilassa selain vierittää itse (touch-action)
      if (this.touches.size === 2) {
        this.cancel(true);
        const s = this.sc, m = this.mid(); this.pan = { x: m.x, y: m.y, sl: s.scrollLeft, st: s.scrollTop }; this.draw();
        return true;
      }
      return this.touches.size > 2 || !!this.pan;
    }
    touchMove(e) {
      if (e.pointerType !== 'touch' || !this.touches.has(e.pointerId)) return false;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.viewOnly) return true;
      if (!this.pan) return false;
      if (this.touches.size >= 2) { const s = this.sc, m = this.mid(); s.scrollLeft = this.pan.sl - (m.x - this.pan.x); s.scrollTop = this.pan.st - (m.y - this.pan.y); }
      return true;
    }
    touchUp(e) {
      if (e.pointerType !== 'touch') return false;
      const had = this.touches.get(e.pointerId); this.touches.delete(e.pointerId);
      if (this.viewOnly) { if (had && e.type === 'pointerup') { const p = this.cellAt(e); if (this.inside(p)) { this.cur = p; this.pickArea(p); this.draw(); } } return true; }
      if (this.pan) { if (!this.touches.size) this.pan = null; return true; }
      return false;
    }
    mid() { const v = [...this.touches.values()]; return { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2 }; }
    // keskeneräinen veto pois; revert palauttaa vedon alkutilan
    cancel(revert) {
      if (revert && (this.drag || this.mv || this.rs) && this.undo.length) {
        const changed = (this.drag && this.drag.changed) || (this.mv && this.mv.changed) || (this.rs && this.rs.changed), s = this.undo.pop();
        if (changed) { this.restore(s); this.hooks.restored(); }
      }
      this.drag = this.mv = this.rs = this.band = this.mpan = null;
    }

    cellAt(e) { const r = this.sp.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / this.cw), y: Math.floor((e.clientY - r.top) / this.ch) }; }
    inside(p) { return p.x >= 0 && p.y >= 0 && p.x < this.doc.W && p.y < this.doc.H; }
    state() { const d = this.doc; return { grid: d.grid.slice(), areas: JSON.parse(JSON.stringify(d.areas || [])), rules: JSON.parse(JSON.stringify(d.rules || [])) }; }
    restore(s) { this.doc.grid = s.grid; this.doc.areas = s.areas; this.doc.rules = s.rules; }
    snapshot() { this.undo.push(this.state()); if (this.undo.length > 300) this.undo.shift(); this.redo = []; }
    set(x, y, k) { const d = this.doc; if (x < 0 || y < 0 || x >= d.W || y >= d.H) return false; const r = d.grid[y]; if (r[x] === k) return false; d.grid[y] = r.slice(0, x) + k + r.slice(x + 1); return true; }
    stamp(p) { const n = this.brushSize, o = Math.floor((n - 1) / 2); let ch = false; for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) ch = this.set(p.x - o + a, p.y - o + b, this.brush) || ch; return ch; }
    line(p, q) { let ch = false; const n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)); for (let s = 0; s <= n; s++) ch = this.stamp({ x: Math.round(p.x + (q.x - p.x) * s / (n || 1)), y: Math.round(p.y + (q.y - p.y) * s / (n || 1)) }) || ch; return ch; }
    fill(p) { const d = this.doc, from = d.grid[p.y][p.x], to = this.brush; if (from === to) return false; const st = [[p.x, p.y]];
      while (st.length) { const [x, y] = st.pop(); if (x < 0 || y < 0 || x >= d.W || y >= d.H || d.grid[y][x] !== from) continue; this.set(x, y, to); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); } return true; }

    // ---- nimetyn alueen siirto sisältöineen (sisemmät alueet mukana)
    groupOf(name) { const M = this.hooks.getModel(), names = new Set([name]); const walk = n => { for (const c of (M.byName[n] ? M.byName[n].children : [])) { names.add(c); walk(c); } }; walk(name); return names; }
    beginAreaMove(name) {
      const d = this.doc, names = this.groupOf(name), rects = d.areas.filter(a => names.has(a.name)); if (!rects.length) return null;
      const cells = new Map(); for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < d.W && y < d.H) cells.set(y * d.W + x, d.grid[y][x]);
      const rules = (d.rules || []).filter(r => r.at && names.has(r.name));
      return { name, rects, orig: rects.map(r => ({ x: r.x, y: r.y })), cells, grid: d.grid.slice(), rules, ruleAt: rules.map(r => r.at.slice()), dx: 0, dy: 0, changed: false };
    }
    applyAreaMove(m, dx, dy) {
      const d = this.doc; let lx = -Infinity, hx = Infinity, ly = -Infinity, hy = Infinity;
      m.rects.forEach((r, i) => { lx = Math.max(lx, -m.orig[i].x); hx = Math.min(hx, d.W - (m.orig[i].x + r.w)); ly = Math.max(ly, -m.orig[i].y); hy = Math.min(hy, d.H - (m.orig[i].y + r.h)); });
      dx = Math.max(lx, Math.min(hx, dx)); dy = Math.max(ly, Math.min(hy, dy));
      if (dx === m.dx && dy === m.dy) return false;
      m.dx = dx; m.dy = dy; m.changed = dx !== 0 || dy !== 0;
      const rows = m.grid.map(r => r.split('')), fc = this.fillChar();
      for (const c of m.cells.keys()) rows[(c / d.W) | 0][c % d.W] = fc;
      for (const [c, k] of m.cells) rows[((c / d.W) | 0) + dy][c % d.W + dx] = k;
      d.grid = rows.map(r => r.join(''));
      m.rects.forEach((r, i) => { r.x = m.orig[i].x + dx; r.y = m.orig[i].y + dy; });
      m.rules.forEach((r, i) => { r.at = [m.ruleAt[i][0] + dx, m.ruleAt[i][1] + dy]; });
      return true;
    }
    // piirtolukossa napautus valitsee kohdan sisimmän alueen
    pickArea(p) { if (!this.paintLock || this.readOnly) return; const n = this.areaUnder(p); if (n && n !== this.hooks.selectedArea()) this.hooks.selectArea(n); }
    areaUnder(p) {
      const M = this.hooks.getModel(), sel = this.hooks.selectedArea(), l = M.at(p.x, p.y);
      if (sel && l.includes(sel)) return sel;
      return l.length ? l[l.length - 1] : null;
    }

    // ---- hiiri ja yksi sormi
    down(e) {
      const p = this.cellAt(e); if (!this.inside(p)) return;
      this.cv.focus({ preventScroll: true }); this.cur = { x: p.x, y: p.y }; this.typeStartX = p.x;
      if (this.viewOnly) { if (e.button === 0) { const s = this.sc; this.mpan = { x: e.clientX, y: e.clientY, sl: s.scrollLeft, st: s.scrollTop }; this.cv.setPointerCapture(e.pointerId); this.pickArea(p); } this.draw(); return; }
      if (this.mode === 'move') {
        if (e.button !== 0) return;
        const name = this.areaUnder(p); if (!name) { this.hooks.status('Tässä kohdassa ei ole nimettyä aluetta'); this.draw(); return; }
        this.hooks.selectArea(name); this.snapshot(); this.mv = this.beginAreaMove(name); this.mv.start = p; this.cv.setPointerCapture(e.pointerId); this.draw(); return;
      }
      if (this.mode === 'area') {
        const sel = this.hooks.selectedArea();
        if (!sel) { this.hooks.status('Valitse ensin nimetty alue listasta tai luo uusi'); this.draw(); return; }
        if (e.button === 2) { this.hooks.removeRectAt(p); this.draw(); return; }
        if (e.button !== 0) return;
        const corner = this.doc.areas.find(a => a.name === sel && (a.w > 1 || a.h > 1) && p.x === a.x + a.w - 1 && p.y === a.y + a.h - 1);
        if (corner) { this.snapshot(); this.rs = { rect: corner, start: p, ow: corner.w, oh: corner.h, changed: false }; }
        else this.band = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        this.cv.setPointerCapture(e.pointerId); this.draw(); return;
      }
      if (e.button === 2) { this.hooks.pick(this.doc.grid[p.y][p.x]); this.draw(); return; }
      if (e.button !== 0) return;
      this.snapshot();
      if (e.shiftKey) { if (this.fill(p)) this.hooks.changed(); else this.undo.pop(); this.draw(); return; }
      this.drag = { last: p, changed: this.stamp(p) }; this.cv.setPointerCapture(e.pointerId); this.draw(); if (this.drag.changed) this.hooks.changed(true);
    }
    move(e) {
      if (this.mpan) { const s = this.sc; s.scrollLeft = this.mpan.sl - (e.clientX - this.mpan.x); s.scrollTop = this.mpan.st - (e.clientY - this.mpan.y); return; }
      const p = this.cellAt(e); this.hover = this.inside(p) ? p : null;
      if (this.band) { this.band.x1 = Math.max(0, Math.min(this.doc.W - 1, p.x)); this.band.y1 = Math.max(0, Math.min(this.doc.H - 1, p.y)); this.draw(); return; }
      if (this.rs) { const r = this.rs.rect, d = this.doc, w = Math.max(1, Math.min(d.W - r.x, this.rs.ow + p.x - this.rs.start.x)), h = Math.max(1, Math.min(d.H - r.y, this.rs.oh + p.y - this.rs.start.y)); if (w !== r.w || h !== r.h) { r.w = w; r.h = h; this.rs.changed = true; this.hooks.areasChanged(true); } this.draw(); return; }
      if (this.mv) { if (this.applyAreaMove(this.mv, p.x - this.mv.start.x, p.y - this.mv.start.y)) this.hooks.areasChanged(true); this.draw(); return; }
      if (this.drag && this.inside(p) && (p.x !== this.drag.last.x || p.y !== this.drag.last.y)) { const ch = this.line(this.drag.last, p); this.drag.last = p; this.cur = { x: p.x, y: p.y }; if (ch) { this.drag.changed = true; this.hooks.changed(true); } }
      this.draw();
    }
    norm(b) { const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1); return { x, y, w: Math.abs(b.x1 - b.x0) + 1, h: Math.abs(b.y1 - b.y0) + 1 }; }
    up() {
      if (this.mpan) { this.mpan = null; return; }
      if (this.mv) { const m = this.mv; this.mv = null; if (!m.changed) this.undo.pop(); else { this.hooks.areasChanged(false); this.hooks.status(`${this.hooks.areaName(m.name)} siirretty (${m.dx >= 0 ? '+' : ''}${m.dx}, ${m.dy >= 0 ? '+' : ''}${m.dy})`); } this.draw(); return; }
      if (this.rs) { const m = this.rs; this.rs = null; if (!m.changed) this.undo.pop(); else this.hooks.areasChanged(false); this.draw(); return; }
      if (this.band) { const r = this.norm(this.band); this.band = null; this.hooks.addRect(r); this.draw(); return; }
      if (!this.drag) return; if (!this.drag.changed) this.undo.pop(); else this.hooks.changed(); this.drag = null;
    }
    doUndo() { if (!this.undo.length) return; this.redo.push(this.state()); this.restore(this.undo.pop()); this.hooks.restored(); this.draw(); }
    doRedo() { if (!this.redo.length) return; this.undo.push(this.state()); this.restore(this.redo.pop()); this.hooks.restored(); this.draw(); }
    moveCur(dx, dy, keepStart) { const d = this.doc; this.cur.x = Math.max(0, Math.min(d.W - 1, this.cur.x + dx)); this.cur.y = Math.max(0, Math.min(d.H - 1, this.cur.y + dy)); if (!keepStart) this.typeStartX = this.cur.x; this.scrollTo(); this.draw(); }
    scrollTo() { const sc = this.sc, x = this.cur.x * this.cw, y = this.cur.y * this.ch;
      if (x < sc.scrollLeft) sc.scrollLeft = x - 20; else if (x + this.cw > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = x + this.cw - sc.clientWidth + 20;
      if (y < sc.scrollTop) sc.scrollTop = y - 20; else if (y + this.ch > sc.scrollTop + sc.clientHeight) sc.scrollTop = y + this.ch - sc.clientHeight + 20; }
    nudgeArea(dx, dy) {
      const sel = this.hooks.selectedArea(); if (!sel) return;
      this.snapshot(); const m = this.beginAreaMove(sel); if (!m || !this.applyAreaMove(m, dx, dy)) { this.undo.pop(); return; }
      this.hooks.areasChanged(false); this.draw();
    }
    key(e) {
      const step = e.shiftKey ? 5 : 1, k = e.key;
      if (!this.readOnly && (e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
      if (!this.readOnly && (e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); this.doRedo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      if (mv && !this.readOnly && this.mode === 'move' && this.hooks.selectedArea()) { e.preventDefault(); this.nudgeArea(mv[0], mv[1]); return; }
      if (mv) { e.preventDefault(); this.moveCur(mv[0], mv[1]); return; }
      if (k === 'Home') { e.preventDefault(); this.cur.x = 0; this.moveCur(0, 0); return; }
      if (k === 'End') { e.preventDefault(); this.cur.x = this.doc.W - 1; this.moveCur(0, 0); return; }
      if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); this.moveCur(0, k === 'PageUp' ? -10 : 10); return; }
      if (k === 'Escape') { if (!this.readOnly && this.mode !== 'paint') this.hooks.endAreaTool(); else this.cv.blur(); this.draw(); return; }
      if (this.viewOnly) { if (k.length === 1 || k === 'Enter' || k === 'Backspace') { e.preventDefault(); this.hooks.status(this.readOnly ? 'Lukutila: siirry Kartan muokkaus -välilehdelle muokataksesi' : 'Alueet-välilehdellä maastoa ei piirretä: valitse Rajaa tai Siirrä, tai siirry Kartan muokkaukseen'); } return; }
      if (k === 'Enter') { e.preventDefault(); this.cur.x = this.typeStartX; this.moveCur(0, 1, true); return; }
      if (k === 'Backspace') { e.preventDefault(); this.moveCur(-1, 0, true); return; }
      if (k.length === 1) {
        e.preventDefault();
        if (!this.doc.legend.some(l => l.ch === k)) { this.hooks.status(`Merkkiä "${k}" ei ole selitteessä`); return; }
        this.snapshot(); if (this.set(this.cur.x, this.cur.y, k)) this.hooks.changed(); else this.undo.pop();
        if (this.cur.x < this.doc.W - 1) this.cur.x++; else if (this.cur.y < this.doc.H - 1) { this.cur.y++; this.cur.x = this.typeStartX; }
        this.scrollTo(); this.draw();
      }
    }
  }
  KG.Editor = Editor; KG.EDITOR_COLORS = COLORS; KG.editorColors = colorMap;
})();
