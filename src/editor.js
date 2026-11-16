// RLML-ruudukon editori: hiiri (sivellin, poiminta, täyttö) ja näppäimistö (vim-tyylinen korvaustila).
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};
  const COLORS = { water: '#cfe2f2', grass: '#eef2d4', shrubs: '#dbe6b2', conifer: '#9ec38a', deciduous: '#bedb98', palm: '#f2e2a4', mountain: '#c8c2b6', hill: '#e2d1ae', river: '#8ebfe8', treasure: '#f5c4c4', kraken: '#bba9de' };

  class Editor {
    constructor(canvas, hooks) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks;
      this.cw = 13; this.ch = 17; this.cur = { x: 0, y: 0 }; this.typeStartX = 0; this.brush = '.'; this.brushSize = 1;
      this.undo = []; this.redo = []; this.drag = null; this.hover = null; this.mode = 'paint'; this.band = null;
      this.touches = new Map(); this.pan = null;
      canvas.addEventListener('pointerdown', e => { if (this.touchDown(e)) return; this.down(e); });
      canvas.addEventListener('pointermove', e => { if (this.touchMove(e)) return; this.move(e); });
      window.addEventListener('pointerup', e => { if (this.touchUp(e)) return; this.up(); });
      window.addEventListener('pointercancel', e => { this.touchUp(e); this.up(); });
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('keydown', e => this.key(e));
    }
    get doc() { return this.hooks.getDoc(); }
    setDoc() { this.cur.x = Math.min(this.cur.x, this.doc.W - 1); this.cur.y = Math.min(this.cur.y, this.doc.H - 1); this.layout(); this.draw(); }
    layout() { const d = this.doc, r = window.devicePixelRatio || 1; this.cv.width = d.W * this.cw * r; this.cv.height = d.H * this.ch * r; this.cv.style.width = d.W * this.cw + 'px'; this.cv.style.height = d.H * this.ch + 'px'; this.ctx.setTransform(r, 0, 0, r, 0, 0); }
    types() { return KG.rlml.typeMap(this.doc); }
    draw() {
      const d = this.doc, c = this.ctx, tm = this.types(), cw = this.cw, ch = this.ch;
      c.clearRect(0, 0, d.W * cw, d.H * ch);
      c.font = `${ch - 4}px ui-monospace, Menlo, Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let j = 0; j < d.H; j++) { const row = d.grid[j]; for (let i = 0; i < d.W; i++) { const k = row[i], t = tm[k];
        c.fillStyle = COLORS[t] || '#fff'; c.fillRect(i * cw, j * ch, cw, ch);
        if (t !== 'water' || k !== '~') { c.fillStyle = t ? '#222' : '#c00'; c.fillText(k, i * cw + cw / 2, j * ch + ch / 2 + 1); }
        else { c.fillStyle = '#9db8d0'; c.fillText(k, i * cw + cw / 2, j * ch + ch / 2 + 1); } } }
      const M = this.hooks.getModel ? this.hooks.getModel() : null, sel = this.hooks.selectedArea ? this.hooks.selectedArea() : null;
      if (M) for (const a of d.areas || []) { const A = M.byName[a.name], on = a.name === sel; if (!on && this.mode !== 'area' && !this.hooks.showAreas()) continue;
        c.lineWidth = on ? 3 : 1.5; c.strokeStyle = on ? 'rgba(200,20,60,.95)' : `hsla(${(A.level * 70 + 210) % 360},70%,35%,.75)`; c.setLineDash(on ? [] : [5, 3]);
        c.strokeRect(a.x * cw + 1, a.y * ch + 1, a.w * cw - 2, a.h * ch - 2); }
      c.setLineDash([]); c.lineWidth = 1;
      if (this.mode === 'move' && sel) for (const a of d.areas || []) if (a.name === sel && (a.w > 1 || a.h > 1)) { c.fillStyle = 'rgba(200,20,60,.95)'; c.fillRect((a.x + a.w) * cw - 8, (a.y + a.h) * ch - 8, 7, 7); }
      if (this.band) { const b = this.norm(this.band); c.fillStyle = 'rgba(200,20,60,.12)'; c.fillRect(b.x * cw, b.y * ch, b.w * cw, b.h * ch); c.strokeStyle = '#c8143c'; c.lineWidth = 2; c.strokeRect(b.x * cw + 1, b.y * ch + 1, b.w * cw - 2, b.h * ch - 2); c.lineWidth = 1; }
      if (this.hover && this.mode === 'paint') { const n = this.brushSize, o = Math.floor((n - 1) / 2); c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeRect((this.hover.x - o) * cw + .5, (this.hover.y - o) * ch + .5, n * cw - 1, n * ch - 1); }
      c.lineWidth = 2; c.strokeStyle = document.activeElement === this.cv ? '#2f5d8a' : '#888'; c.strokeRect(this.cur.x * cw + 1, this.cur.y * ch + 1, cw - 2, ch - 2); c.lineWidth = 1;
      this.hooks.onCursor && this.hooks.onCursor(this.cur, d.grid[this.cur.y][this.cur.x]);
    }
    // Kosketus: yksi sormi piirtää, kaksi sormea vierittää (ja peruu juuri aloitetun vedon)
    touchDown(e) {
      if (e.pointerType !== 'touch') return false;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        if (this.drag) { if (this.drag.changed && this.undo.length) { this.restore(this.undo.pop()); this.hooks.changed(); } else if (!this.drag.changed) this.undo.pop(); this.drag = null; }
        if (this.mv) { if (this.undo.length) { this.restore(this.undo.pop()); this.hooks.restored(); } this.mv = null; }
        this.band = null;
        const s = this.cv.parentElement, m = this.mid(); this.pan = { x: m.x, y: m.y, sl: s.scrollLeft, st: s.scrollTop }; this.draw();
        return true;
      }
      return this.touches.size > 2 || !!this.pan;
    }
    touchMove(e) {
      if (e.pointerType !== 'touch' || !this.touches.has(e.pointerId)) return false;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!this.pan) return false;
      if (this.touches.size >= 2) { const s = this.cv.parentElement, m = this.mid(); s.scrollLeft = this.pan.sl - (m.x - this.pan.x); s.scrollTop = this.pan.st - (m.y - this.pan.y); }
      return true;
    }
    touchUp(e) {
      if (e.pointerType !== 'touch') return false;
      this.touches.delete(e.pointerId);
      if (this.pan) { if (!this.touches.size) this.pan = null; return true; }
      return false;
    }
    mid() { const v = [...this.touches.values()]; return { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2 }; }
    // ---- alueiden siirto ja koon muutos
    areaTarget(p) {
      const M = this.hooks.getModel(), sel = this.hooks.selectedArea(), inR = a => p.x >= a.x && p.y >= a.y && p.x < a.x + a.w && p.y < a.y + a.h;
      // kulmakahva ensin (valittu alue, sitten tarkin), muuten tarkin alue kohdassa
      const corner = a => (a.w > 1 || a.h > 1) && p.x === a.x + a.w - 1 && p.y === a.y + a.h - 1, l = M.at(p.x, p.y);
      if (sel && (this.doc.areas || []).some(a => a.name === sel && corner(a))) return sel;
      for (let i = l.length - 1; i >= 0; i--) if ((this.doc.areas || []).some(a => a.name === l[i] && corner(a))) return l[i];
      return l.length ? l[l.length - 1] : null;
    }
    group(name) {
      const M = this.hooks.getModel(), names = new Set([name]);
      if (this.hooks.moveChildren()) { const walk = n => { for (const c of (M.byName[n] ? M.byName[n].children : [])) { names.add(c); walk(c); } }; walk(name); }
      return names;
    }
    startMove(p, name) {
      const d = this.doc; this.snapshot();
      const corner = d.areas.find(a => a.name === name && (a.w > 1 || a.h > 1) && p.x === a.x + a.w - 1 && p.y === a.y + a.h - 1);
      if (corner) { this.mv = { kind: 'resize', rect: corner, start: p, ow: corner.w, oh: corner.h, changed: false }; this.hooks.status('Kulmasta raahaus muuttaa suorakulmion kokoa'); return; }
      const names = this.group(name), rects = d.areas.filter(a => names.has(a.name));
      this.mv = { kind: 'move', start: p, rects, orig: rects.map(r => ({ x: r.x, y: r.y })), changed: false };
    }
    clampDelta(rects, orig, dx, dy) {
      const d = this.doc; let lx = -Infinity, hx = Infinity, ly = -Infinity, hy = Infinity;
      rects.forEach((r, i) => { lx = Math.max(lx, -orig[i].x); hx = Math.min(hx, d.W - (orig[i].x + r.w)); ly = Math.max(ly, -orig[i].y); hy = Math.min(hy, d.H - (orig[i].y + r.h)); });
      return [Math.max(lx, Math.min(hx, dx)), Math.max(ly, Math.min(hy, dy))];
    }
    dragMove(p) {
      const m = this.mv, d = this.doc, dx = p.x - m.start.x, dy = p.y - m.start.y;
      if (m.kind === 'resize') { const r = m.rect, w = Math.max(1, Math.min(d.W - r.x, m.ow + dx)), h = Math.max(1, Math.min(d.H - r.y, m.oh + dy)); if (w !== r.w || h !== r.h) { r.w = w; r.h = h; m.changed = true; this.hooks.areasChanged(true); } return; }
      const [cx, cy] = this.clampDelta(m.rects, m.orig, dx, dy);
      if (m.rects[0].x !== m.orig[0].x + cx || m.rects[0].y !== m.orig[0].y + cy) { m.rects.forEach((r, i) => { r.x = m.orig[i].x + cx; r.y = m.orig[i].y + cy; }); m.changed = cx !== 0 || cy !== 0 || m.changed; this.hooks.areasChanged(true); }
    }
    nudge(dx, dy) {
      const name = this.hooks.selectedArea(), names = this.group(name), rects = this.doc.areas.filter(a => names.has(a.name)); if (!rects.length) return;
      const orig = rects.map(r => ({ x: r.x, y: r.y })), [cx, cy] = this.clampDelta(rects, orig, dx, dy); if (!cx && !cy) return;
      this.snapshot(); rects.forEach((r, i) => { r.x = orig[i].x + cx; r.y = orig[i].y + cy; }); this.hooks.areasChanged(false); this.draw();
    }
    cellAt(e) { const r = this.cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / this.cw), y: Math.floor((e.clientY - r.top) / this.ch) }; }
    inside(p) { return p.x >= 0 && p.y >= 0 && p.x < this.doc.W && p.y < this.doc.H; }
    state() { return { grid: this.doc.grid.slice(), areas: JSON.parse(JSON.stringify(this.doc.areas || [])) }; }
    restore(s) { this.doc.grid = s.grid; this.doc.areas = s.areas; }
    snapshot() { this.undo.push(this.state()); if (this.undo.length > 300) this.undo.shift(); this.redo = []; }
    set(x, y, k) { const d = this.doc; if (x < 0 || y < 0 || x >= d.W || y >= d.H) return false; const r = d.grid[y]; if (r[x] === k) return false; d.grid[y] = r.slice(0, x) + k + r.slice(x + 1); return true; }
    stamp(p) { const n = this.brushSize, o = Math.floor((n - 1) / 2); let ch = false; for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) ch = this.set(p.x - o + a, p.y - o + b, this.brush) || ch; return ch; }
    line(p, q) { let ch = false; const n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)); for (let s = 0; s <= n; s++) ch = this.stamp({ x: Math.round(p.x + (q.x - p.x) * s / (n || 1)), y: Math.round(p.y + (q.y - p.y) * s / (n || 1)) }) || ch; return ch; }
    fill(p) { const d = this.doc, from = d.grid[p.y][p.x], to = this.brush; if (from === to) return false; const st = [[p.x, p.y]];
      while (st.length) { const [x, y] = st.pop(); if (x < 0 || y < 0 || x >= d.W || y >= d.H || d.grid[y][x] !== from) continue; this.set(x, y, to); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); } return true; }
    down(e) {
      const p = this.cellAt(e); if (!this.inside(p)) return;
      this.cv.focus(); this.cur = { x: p.x, y: p.y }; this.typeStartX = p.x;
      if (this.mode === 'move') {
        if (e.button !== 0) return;
        const name = this.areaTarget(p); if (!name) { this.hooks.status('Kohdassa ei ole aluetta'); return; }
        this.hooks.selectArea(name); this.startMove(p, name); this.cv.setPointerCapture(e.pointerId); this.draw(); return;
      }
      if (this.mode === 'area') {
        if (e.button === 2) { this.hooks.removeRectAt(p); this.draw(); return; }
        if (e.button === 0) { this.band = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; this.cv.setPointerCapture(e.pointerId); this.draw(); }
        return;
      }
      if (e.button === 2) { this.hooks.pick(this.doc.grid[p.y][p.x]); this.draw(); return; }
      if (e.button !== 0) return;
      this.snapshot();
      if (e.shiftKey) { if (this.fill(p)) this.hooks.changed(); else this.undo.pop(); this.draw(); return; }
      this.drag = { last: p, changed: this.stamp(p) }; this.cv.setPointerCapture(e.pointerId); this.draw(); if (this.drag.changed) this.hooks.changed(true);
    }
    move(e) { const p = this.cellAt(e); this.hover = this.inside(p) ? p : null;
      if (this.band) { this.band.x1 = Math.max(0, Math.min(this.doc.W - 1, p.x)); this.band.y1 = Math.max(0, Math.min(this.doc.H - 1, p.y)); this.draw(); return; }
      if (this.mv) { this.dragMove(p); this.draw(); return; }
      if (this.drag && this.inside(p) && (p.x !== this.drag.last.x || p.y !== this.drag.last.y)) { const ch = this.line(this.drag.last, p); this.drag.last = p; this.cur = { x: p.x, y: p.y }; if (ch) { this.drag.changed = true; this.hooks.changed(true); } }
      this.draw(); }
    norm(b) { const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1); return { x, y, w: Math.abs(b.x1 - b.x0) + 1, h: Math.abs(b.y1 - b.y0) + 1 }; }
    up() { if (this.mv) { const m = this.mv; this.mv = null; if (!m.changed) this.undo.pop(); else this.hooks.areasChanged(false); this.draw(); return; }
      if (this.band) { const r = this.norm(this.band); this.band = null; this.hooks.addRect(r); this.draw(); return; }
      if (!this.drag) return; if (!this.drag.changed) this.undo.pop(); else this.hooks.changed(); this.drag = null; }
    doUndo() { if (!this.undo.length) return; this.redo.push(this.state()); this.restore(this.undo.pop()); this.hooks.restored(); this.draw(); }
    doRedo() { if (!this.redo.length) return; this.undo.push(this.state()); this.restore(this.redo.pop()); this.hooks.restored(); this.draw(); }
    moveCur(dx, dy, keepStart) { const d = this.doc; this.cur.x = Math.max(0, Math.min(d.W - 1, this.cur.x + dx)); this.cur.y = Math.max(0, Math.min(d.H - 1, this.cur.y + dy)); if (!keepStart) this.typeStartX = this.cur.x; this.scrollTo(); this.draw(); }
    scrollTo() { const sc = this.cv.parentElement, x = this.cur.x * this.cw, y = this.cur.y * this.ch;
      if (x < sc.scrollLeft) sc.scrollLeft = x - 20; else if (x + this.cw > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = x + this.cw - sc.clientWidth + 20;
      if (y < sc.scrollTop) sc.scrollTop = y - 20; else if (y + this.ch > sc.scrollTop + sc.clientHeight) sc.scrollTop = y + this.ch - sc.clientHeight + 20; }
    key(e) {
      const step = e.shiftKey ? 5 : 1, k = e.key;
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); this.doRedo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      if (mv && this.mode === 'move' && this.hooks.selectedArea()) { e.preventDefault(); this.nudge(mv[0], mv[1]); return; }
      if (mv) { e.preventDefault(); this.moveCur(mv[0], mv[1]); return; }
      if (k === 'Home') { e.preventDefault(); this.cur.x = 0; this.moveCur(0, 0); return; }
      if (k === 'End') { e.preventDefault(); this.cur.x = this.doc.W - 1; this.moveCur(0, 0); return; }
      if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); this.moveCur(0, k === 'PageUp' ? -10 : 10); return; }
      if (k === 'Enter') { e.preventDefault(); this.cur.x = this.typeStartX; this.moveCur(0, 1, true); return; }
      if (k === 'Backspace') { e.preventDefault(); this.moveCur(-1, 0, true); return; }
      if (k === 'Escape') { this.cv.blur(); this.draw(); return; }
      if (k.length === 1) {
        e.preventDefault();
        if (!this.doc.legend.some(l => l.ch === k)) { this.hooks.status(`Merkkiä "${k}" ei ole selitteessä`); return; }
        this.snapshot(); if (this.set(this.cur.x, this.cur.y, k)) this.hooks.changed(); else this.undo.pop();
        if (this.cur.x < this.doc.W - 1) this.cur.x++; else if (this.cur.y < this.doc.H - 1) { this.cur.y++; this.cur.x = this.typeStartX; }
        this.scrollTo(); this.draw();
      }
    }
  }
  KG.Editor = Editor; KG.EDITOR_COLORS = COLORS;
})();
