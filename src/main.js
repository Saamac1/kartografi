// Käyttöliittymän kytkennät: editori, esikatselu, tulostus, tiedostot.
(function () {
  'use strict';
  const KG = globalThis.KG, $ = id => document.getElementById(id);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ei tallennusta */ } } };
  let doc = null;
  // kartasto tallentuu selaimeen tiedostoina [{ name, kind, text }] (kartat, paperityyli, kielet)
  const projFiles = () => KG.rlml.projectFiles(doc.file);
  const openTexts = texts => KG.rlml.parseProject(texts).maps[0];
  try { const pj = store.get('kg.proj'), old = store.get('kg.doc'); let v = pj ? JSON.parse(pj) : null; if (v && !Array.isArray(v)) v = Object.values(v);
    doc = v ? openTexts(v) : old ? openTexts([old]) : null; } catch (e) { doc = null; }
  if (!doc || !doc.W) { doc = KG.generator.generate({ W: 64, H: 44, seed: 7 }); KG.rlml.projectOf(doc, doc.title); }
  { const mi = +store.get('kg.map'); if (doc.file && mi > 0 && doc.file.maps[mi]) doc = doc.file.maps[mi]; }

  // ---- tila ja apurit
  let statusT = 0;
  function status(msg) { $('status').textContent = msg; clearTimeout(statusT); statusT = setTimeout(() => { $('status').textContent = ''; }, 4000); }
  // asennettava sovellus (PWA): välimuisti vain oikealla https-osoitteella, ei artefaktissa eikä file://-avauksessa
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !(window.claude && window.claude.use)) navigator.serviceWorker.register('sw.js').catch(() => {});
  // claude.ai-artefaktissa tiedostot tallennetaan downloads-kyvyllä (sivu ei saa itse käynnistää latausta)
  const inArtifact = !!(window.claude && typeof window.claude.use === 'function');
  let saver = null;
  if (inArtifact) {
    $('btnPrint').hidden = true; $('btnPop').hidden = true;
    window.claude.use('downloads').then(d => { saver = d; if (!d) status('Tallennus ei ole käytettävissä tässä näkymässä – käytä Kopioi-painiketta tai Lähdekoodittä'); }).catch(() => {});
  }
  function download(name, text, mime) {
    if (inArtifact) {
      if (!saver) { status('Tallennus ei ole käytettävissä – kopioi teksti Lähdekoodi-välilehdeltä tai Kopioi SVG -painikkeella'); return Promise.resolve(false); }
      return saver.save({ filename: name, data: text }).then(() => { status('Tallennettu ' + name); return true; })
        .catch(e => { status(e && e.code === 'declined' ? 'Tallennus peruttiin' : e && e.code === 'rate_limited' ? 'Edellinen tallennus on vielä kesken' : 'Tallennus ei onnistunut: ' + (e && (e.message || e.code))); return false; });
    }
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); status('Ladattu ' + name); return new Promise(r => setTimeout(() => r(true), 300)); }
    catch (e) { status('Lataus estetty tässä ympäristössä – käytä Kopioi-painiketta'); return Promise.resolve(false); }
  }
  const fileBase = () => (doc.name || 'kartta').toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  const fileName = () => KG.rlml.toId(doc.file && doc.file.title ? doc.file.title : doc.name || 'kartta').toLowerCase();

  // ---- alueet
  let setMode = null, endAreaTool = null, showTool = () => {};
  let M = KG.areas.model(doc), selArea = null;
  const refreshModel = () => { M = KG.areas.model(doc); };

  // ---- editori ja paletti
  const ed = new KG.Editor($('ed'), {
    getDoc: () => doc,
    changed: () => { touched(); },
    pick: ch => setBrush(ch),
    getModel: () => M, selectedArea: () => selArea, showAreas: () => $('showAreas').checked,
    selectArea: n => { selArea = n; buildAreaList(); showTool(); }, areaName: n => KG.areas.displayName(doc, n), endAreaTool: () => endAreaTool(),
    areasChanged: live => { if (!live) { const n = KG.areas.normalize(doc); if (n) status(`Sisäkkäiset rajaukset yhdistettiin (${n} vähemmän)`); } refreshModel(); if (!live) { buildAreaList(); touched(); } else scheduleRender(); ed.draw(); },
    restored: () => { refreshModel(); buildAreaList(); touched(); },
    addRect: r => { if (!selArea) { status('Valitse tai luo alue ensin'); return; } ed.snapshot(); doc.areas.push(Object.assign(r, { name: selArea })); const n = KG.areas.normalize(doc); areaChanged(); if (n) status(`Alueen ${KG.areas.displayName(doc, selArea)} rajaukset yhdistettiin (${n} vähemmän)`); },
    removeRectAt: p => { for (let i = doc.areas.length - 1; i >= 0; i--) { const a = doc.areas[i]; if ((!selArea || a.name === selArea) && p.x >= a.x && p.y >= a.y && p.x < a.x + a.w && p.y < a.y + a.h) { ed.snapshot(); doc.areas.splice(i, 1); areaChanged(); status(`Suorakulmio poistettu alueesta ${a.name}`); return; } } },
    status,
    onCursor: (c, k) => { const e = doc.legend.find(l => l.ch === k), path = M.at(c.x, c.y).map(n => KG.areas.displayName(doc, n)).join(' › '), at = doc.atlas;
      const pos = at ? `${KG.rlml.sheetId(at, Math.floor(c.x / at.sw), Math.floor(c.y / at.sh))} · ${c.x % at.sw},${c.y % at.sh}  (x ${c.x}, y ${c.y})` : `x ${c.x}, y ${c.y}`;
      $('cursorInfo').textContent = `${pos}   "${k}" ${e ? e.name : 'tuntematon merkki'}   ${path ? '▸ ' + path : ''}`; followCursor(false); },
  });
  function buildPalette() {
    const p = $('palette'); p.innerHTML = ''; const cmap = KG.editorColors(doc);
    for (const e of doc.legend) {
      const b = document.createElement('button'); b.className = 'pal' + (e.ch === ed.brush ? ' on' : ''); b.dataset.ch = e.ch;
      b.innerHTML = `<span class="ch" style="background:${cmap[e.ch] || '#fff'}">${e.ch.replace('<', '&lt;')}</span><span>${e.name}${e.decor ? ' <i>(koriste)</i>' : ''}</span>`;
      b.title = e.spec; b.onclick = () => { setBrush(e.ch); palOpen(false); setMode && setMode(false); endAreaTool && endAreaTool(); if (!matchMedia('(pointer: coarse)').matches) ed.cv.focus({ preventScroll: true }); };
      p.appendChild(b);
    }
    buildPalAdd();
  }
  // puhelimessa palat ovat avattavassa listassa: sivellinruudun napautus avaa, valinta tai napautus muualle sulkee
  const missingDefaults = () => { if (doc.style && doc.style !== 'sea') return []; const have = new Set(Object.values(KG.rlml.typeMap(doc))); return KG.rlml.DEFAULT_LEGEND.filter(e => !have.has(KG.rlml.typeOf(e.spec))); };
  const mobileUI = () => matchMedia('(max-width: 820px)').matches;
  function palOpen(on) {
    document.body.classList.toggle('pal-open', on);
    if (on) { const r = $('brushBox').getBoundingClientRect(), L = $('palList'); L.style.top = (r.bottom + 4) + 'px'; L.style.maxHeight = Math.max(160, innerHeight - r.bottom - 14) + 'px';
      const cur = L.querySelector('.pal.on'); if (cur) cur.scrollIntoView({ block: 'nearest' }); }
  }
  $('brushBox').addEventListener('click', e => { if (!mobileUI() || e.target.closest('label, select')) return; palOpen(!document.body.classList.contains('pal-open')); });
  document.addEventListener('pointerdown', e => { if (document.body.classList.contains('pal-open') && !e.target.closest('#palList, #brushBox')) palOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') palOpen(false); });
  function addDefault(e) {
    const used = new Set(doc.legend.map(l => l.ch)), pool = e.ch + 'CshRSVABEFGHIJLMNOPQUWZabcdefgijklmopqtuvwxyz0123456789';
    const ch = [...pool].find(c => !used.has(c)); if (!ch) { status('Vapaita merkkejä ei ole'); return; }
    doc.legend.push(Object.assign({}, e, { ch })); buildPalette(); buildLegendPick(); touched(); setBrush(ch); setMode && setMode(false); palOpen(false);
    status(`Lisätty legendaan: ${ch} ${e.spec}`);
  }
  // merikartan oletuspalat, joita kartan legendassa ei vielä ole: napsautus lisää legendaan
  function buildPalAdd() {
    const el = $('palAdd'); el.innerHTML = ''; if (doc.style && doc.style !== 'sea') return;
    const miss = missingDefaults();
    if (!miss.length) return;
    el.innerHTML = '<h4>Lisää selitteeseen</h4>';
    for (const e of miss) {
      const b = document.createElement('button'); b.className = 'pal add'; b.title = 'Lisää legendaan: ' + e.spec;
      b.innerHTML = `<span class="ch" style="background:${KG.EDITOR_COLORS[KG.rlml.typeOf(e.spec)] || '#fff'}">+</span><span>${e.name}${e.decor ? ' <i>(koriste)</i>' : ''}</span>`;
      b.onclick = () => addDefault(e);
      el.appendChild(b);
    }
  }
  // kelluva selitepalkki: sijainti muistetaan selaimessa
  { const pn = $('palPanel'), hd = $('palHead');
    const place = (x, y) => { const w = pn.offsetWidth || 230; x = Math.max(0, Math.min(innerWidth - Math.min(w, 120), x)); y = Math.max(0, Math.min(innerHeight - 40, y)); pn.style.left = x + 'px'; pn.style.top = y + 'px'; return [x, y]; };
    const setFloat = on => { document.body.classList.toggle('float-pal', on); store.set('kg.floatPal', on ? '1' : '0');
      if (on) { let p = null; try { p = JSON.parse(store.get('kg.palPos')); } catch (e) { p = null; } place(...(p || [60, 110])); } else { pn.style.left = pn.style.top = pn.style.width = pn.style.height = ''; } };
    $('btnFloat').onclick = () => setFloat(!document.body.classList.contains('float-pal'));
    let drag = null;
    hd.addEventListener('pointerdown', e => { if (!document.body.classList.contains('float-pal') || e.target.closest('button') || e.button !== 0) return; const r = pn.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; hd.setPointerCapture(e.pointerId); e.preventDefault(); });
    hd.addEventListener('pointermove', e => { if (drag) place(e.clientX - drag.dx, e.clientY - drag.dy); });
    hd.addEventListener('pointerup', e => { if (!drag) return; drag = null; const r = pn.getBoundingClientRect(); store.set('kg.palPos', JSON.stringify([r.left, r.top])); });
    window.addEventListener('resize', () => { if (document.body.classList.contains('float-pal')) place(pn.offsetLeft, pn.offsetTop); });
    if (store.get('kg.floatPal') === '1') setFloat(true); }
  // selitteeseen otettavat palat; koristeet (decor) jätetään pois
  function buildLegendPick() {
    const el = $('legendPick'); el.innerHTML = '';
    const sea = !doc.style || doc.style === 'sea', cm = sea ? null : KG.tiles.classMap(doc);
    for (const e of doc.legend) { if (sea) { const t = KG.rlml.typeOf(e.spec); if (t === 'water' || t === 'grass') continue; } else { const c = cm[e.ch]; if (!c || !(c.symbols.length || ['door', 'stairs', 'exit'].includes(c.kind) || ['moss', 'runes'].includes(c.pattern))) continue; }
      const l = document.createElement('label'); l.innerHTML = `<input type="checkbox"${e.decor ? '' : ' checked'}> ${e.name}`; l.title = e.decor ? 'koriste (decor)' : '';
      l.querySelector('input').onchange = ev => { if (ev.target.checked) delete e.decor; else e.decor = true; buildPalette(); touched(); };
      el.appendChild(l); }
    // luola- ja laivakartoissa myös at:-rivein sijoitetut kohteet (miehistö, karttapöytä…), joita legendassa ei ole
    if (sea) return;
    const inLegend = new Set(doc.legend.flatMap(e => KG.rlml.specNames(e.spec).map(n => n.split('.')[0].toUpperCase())));
    for (const root of KG.rlml.atRoots(doc)) { const sym = KG.tiles.ENTITY[root]; if (!sym || inLegend.has(root)) continue;
      const off = (doc.atDecor || []).includes(root), l = document.createElement('label');
      l.innerHTML = `<input type="checkbox"${off ? '' : ' checked'}> ${KG.tiles.NAMES[sym] || sym}`; l.title = 'kartalle sijoitettu kohde (at: … with ' + root + ')';
      l.querySelector('input').onchange = ev => { doc.atDecor = (doc.atDecor || []).filter(r => r !== root); if (!ev.target.checked) doc.atDecor.push(root); touched(); };
      el.appendChild(l); }
  }
  function setBrush(ch) { ed.brush = ch; document.querySelectorAll('.pal').forEach(b => b.classList.toggle('on', b.dataset.ch === ch)); showTool(); ed.draw(); }
  $('brush').onchange = e => { ed.brushSize = +e.target.value; };
  ed.brush = '.';

  // ---- asetukset
  const num = id => parseFloat($(id).value);
  function settings() {
    const mode = document.querySelector('input[name=mode]:checked').value, margin = num('margin');
    const base = { wMain: num('wMain'), wCoast: num('wCoast'), wThin: num('wThin'), wSea: num('wSea'), spSea: num('spSea'), spSym: num('spSym'), legend: $('optLegend').checked, compass: $('optCompass').checked, title: $('optTitle').checked, frame: $('optFrame').checked, grid: $('optGrid').checked };
    if (mode === 'whole') { const fit = KG.print.fitCell(KG.renderer.dims(doc, base), $('paper').value, $('orientW').value, margin); return Object.assign(base, { mode, margin, cellMM: fit.cellMM, paper: $('paper').value, orient: fit.orient }); }
    return Object.assign(base, { mode, margin, cellMM: num('cellMM'), overlap: num('overlap'), orientT: $('orientT').value });
  }
  function layoutTiles(sc, s) {
    const iw = sc.VW / sc.k, ih = sc.VH / sc.k, mk = o => KG.print.tiles(iw, ih, { paper: 'A4', orient: o, margin: s.margin, overlap: s.overlap });
    if (s.orientT !== 'auto') return mk(s.orientT);
    const a = mk('portrait'), b = mk('landscape'); return b.sheets.length < a.sheets.length ? b : a;
  }

  // ---- piirto ja esikatselu
  let renderT = 0, last = null, zoom = 1, popup = null;
  function touched() { refreshModel(); showChecks(); refreshUndo(); store.set('kg.proj', JSON.stringify(projFiles())); scheduleRender(); const t = document.body.dataset.tab; if (t === 'file') fillFileTab(); if (t === 'src') refreshSrc(); }
  // piilossa olevaa esikatselua ei piirretä; piirto tehdään, kun esikatselu tulee näkyviin tai kuvaa tarvitaan
  let pvDirty = false;
  const pvShown = () => (popup && !popup.closed) || $('previewPane').offsetParent !== null;
  function scheduleRender() { clearTimeout(renderT); if (!pvShown()) { pvDirty = true; return; } $('renderInfo').textContent = 'piirretään…'; renderT = setTimeout(render, 280); }
  function fresh() { if (pvDirty || !last) { clearTimeout(renderT); render(); } }
  // iso kartta: esikatselu piirtää vain otteen kursorin ympäriltä (koko kartan SVG olisi satoja megatavuja);
  // tulostus ja vienti piirtävät koko kartan erikseen
  const BIG = 160 * 160, WIN = { w: 120, h: 90 };
  const isBig = () => doc.W * doc.H > BIG;
  function windowAround(c) { const w = Math.min(doc.W, WIN.w), h = Math.min(doc.H, WIN.h);
    return { x: Math.max(0, Math.min(doc.W - w, c.x - (w >> 1))), y: Math.max(0, Math.min(doc.H - h, c.y - (h >> 1))), w, h }; }
  function cropDoc(d, r) {
    const m = Object.assign({}, d, { W: r.w, H: r.h, grid: d.grid.slice(r.y, r.y + r.h).map(row => row.slice(r.x, r.x + r.w)), title: (d.title || d.name) + ' (ote)' });
    m.areas = (d.areas || []).map(a => { const x0 = Math.max(a.x, r.x), y0 = Math.max(a.y, r.y), x1 = Math.min(a.x + a.w, r.x + r.w), y1 = Math.min(a.y + a.h, r.y + r.h);
      return x1 > x0 && y1 > y0 ? Object.assign({}, a, { x: x0 - r.x, y: y0 - r.y, w: x1 - x0, h: y1 - y0 }) : null; }).filter(Boolean);
    m.at = (d.at || []).filter(a => a.x >= r.x && a.y >= r.y && a.x < r.x + r.w && a.y < r.y + r.h).map(a => Object.assign({}, a, { x: a.x - r.x, y: a.y - r.y }));
    m.rules = (d.rules || []).map(u => u.at ? Object.assign({}, u, { at: [u.at[0] - r.x, u.at[1] - r.y] }) : u);
    return m;
  }
  // koko kartan kohtaus vientiä ja tulostusta varten (esikatselun ote ei kelpaa)
  function fullScene() {
    if (last && !last.win) return last;
    const s = settings(); status(`Piirretään koko kartta (${doc.W} × ${doc.H}) vientiä varten…`);
    const sc = KG.renderer.scene(doc, s); return { sc, s, L: s.mode === 'tiles' ? layoutTiles(sc, s) : null };
  }
  function render() {
    pvDirty = false;
    const s = settings(), t0 = performance.now(), win = isBig() ? windowAround(ed.cur) : null, rdoc = win ? cropDoc(doc, win) : doc;
    // otteen mittakaava: koko kuva -tilassa ote sovitetaan arkille, jotta se on luettava (tulosteen ruutu näkyy tiedoissa)
    const ps = win && s.mode === 'whole' ? Object.assign({}, s, { cellMM: KG.print.fitCell(KG.renderer.dims(rdoc, s), s.paper, s.orient, s.margin).cellMM }) : s;
    let sc;
    try { sc = KG.renderer.scene(rdoc, ps); } catch (e) { console.error(e); $('renderInfo').textContent = 'Virhe: ' + e.message; return; }
    let svg = KG.renderer.svgWhole(sc, rdoc.title), L = null;
    if (s.mode === 'tiles') L = win ? layoutTiles({ VW: KG.renderer.dims(doc, s).VW, VH: KG.renderer.dims(doc, s).VH, k: sc.k }, s) : layoutTiles(sc, s);
    if (L && !win && $('showSheets').checked) {
      let ov = ''; for (const sh of L.sheets) { const x = sh.x0 * sc.k, y = sh.y0 * sc.k, w = L.aw * sc.k, h = L.ah * sc.k;
        ov += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(200,30,60,.04)" stroke="#c0304a" stroke-width="2" stroke-dasharray="10 6"/><text x="${x + 12}" y="${y + 34}" font-size="28" font-family="sans-serif" fill="#c0304a">${sh.name}</text>`; }
      svg = svg.replace(/<\/svg>$/, ov + '</svg>');
    }
    last = { sc, s, L, svg, win };
    showSvg(svg);
    const ms = Math.round(performance.now() - t0), full = win ? KG.renderer.dims(doc, s) : { VW: sc.VW, VH: sc.VH }, mmW = (full.VW / sc.k).toFixed(0), mmH = (full.VH / sc.k).toFixed(0);
    $('renderInfo').textContent = win ? `ote ${win.x}–${win.x + win.w - 1}, ${win.y}–${win.y + win.h - 1} · kartta ${doc.W}×${doc.H} on liian suuri koko esikatseluun · ${ms} ms` : `${doc.W}×${doc.H} ruutua · ${ms} ms`;
    const tiny = s.mode === 'whole' && s.cellMM < 2 ? ` Ruutu on alle 2 mm, joten tuloste ei ole luettava: valitse isompi paperi tai A4-lehdet.${win ? ' Esikatselu näyttää otteen luettavassa koossa.' : ''}` : '';
    const mmF = v => (v / KG.renderer.CS * s.cellMM).toFixed(0);
    $('printInfo').textContent = s.mode === 'whole'
      ? `Kartta ${win ? mmF(full.VW) : mmW} × ${win ? mmF(full.VH) : mmH} mm, ruutu ${s.cellMM.toFixed(2)} mm, paperi ${s.paper} ${s.orient === 'landscape' ? 'vaaka' : 'pysty'}.${tiny}`
      : `${L.sheets.length} lehteä (${L.cols} × ${L.rows}), A4 ${L.PW > L.PH ? 'vaaka' : 'pysty'}, kartta ${mmW} × ${mmH} mm, ruutu ${s.cellMM} mm, liimausreuna ${s.overlap} mm.`;
    const links = $('sheetLinks'); links.innerHTML = '';
    if (L) for (const sh of L.sheets) { const b = document.createElement('button'); b.textContent = 'Lehti ' + sh.name; b.onclick = () => { const F = fullScene(); download(`${fileBase()}_${sh.name}.svg`, KG.print.sheetSvg(F.sc, F.L, F.L.sheets.find(x => x.name === sh.name)), 'image/svg+xml'); }; links.appendChild(b); }
  }
  function showSvg(svg) {
    if (popup && !popup.closed) { const v = popup.document.getElementById('v'); if (v) { v.innerHTML = svg; sizeSvg(v); } }
    else { $('pv').innerHTML = svg + '<div id="pvCur" hidden></div>'; sizeSvg($('pv')); followCursor(false); }
  }
  function sizeSvg(host) { const el = host.querySelector('svg'); if (!el) return; el.removeAttribute('width'); el.removeAttribute('height'); el.style.width = (zoom * 100) + '%'; }
  $('zIn').onclick = () => { zoom = Math.min(8, zoom * 1.4); sizeSvg($('pv')); followCursor(true); };
  $('zOut').onclick = () => { zoom = Math.max(.25, zoom / 1.4); sizeSvg($('pv')); followCursor(true); };
  $('zFit').onclick = () => { zoom = 1; sizeSvg($('pv')); followCursor(true); };
  // esikatselu seuraa editorin kursoria, kun kartta ei mahdu kerralla näkyviin
  let lastCur = null;
  function followCursor(force) {
    if (last && last.win) { const w = last.win, mx = w.w * .2, my = w.h * .2, c = ed.cur; if ((c.x < w.x + mx && w.x > 0) || (c.x > w.x + w.w - mx && w.x + w.w < doc.W) || (c.y < w.y + my && w.y > 0) || (c.y > w.y + w.h - my && w.y + w.h < doc.H)) scheduleRender(); }
    const sv = $('pvScroll'), el = $('pv').querySelector('svg'), mk = $('pvCur'); if (!el || !last || sv.hidden) return;
    // svg-elementillä ei ole offsetLeft/Top: sijainti #pv:n suhteen näytön koordinaateista
    const er = el.getBoundingClientRect(), pr = $('pv').getBoundingClientRect(), ox = er.left - pr.left, oy = er.top - pr.top;
    const w0 = last.win || { x: 0, y: 0 }, c = { x: ed.cur.x - w0.x, y: ed.cur.y - w0.y }, s = er.width / last.sc.VW, cs = 16 * s, x = ox + (last.sc.MG + c.x * 16) * s, y = oy + (last.sc.MG + (last.sc.oy || 0) + c.y * 16) * s;
    if (!er.width) return;
    Object.assign(mk.style, { left: x + 'px', top: y + 'px', width: cs + 'px', height: cs + 'px' }); mk.hidden = false;
    const moved = !lastCur || lastCur.x !== c.x || lastCur.y !== c.y; lastCur = { x: c.x, y: c.y };
    if (!moved && !force) return;
    const pad = Math.min(sv.clientWidth, sv.clientHeight) * .15;
    if (x < sv.scrollLeft + pad || x + cs > sv.scrollLeft + sv.clientWidth - pad) sv.scrollLeft = x + cs / 2 - sv.clientWidth / 2;
    if (y < sv.scrollTop + pad || y + cs > sv.scrollTop + sv.clientHeight - pad) sv.scrollTop = y + cs / 2 - sv.clientHeight / 2;
  }
  // esikatselun siirtely vetämällä (kosketuksessa selain vierittää itse)
  { const sv = $('pvScroll'); let pan = null;
    sv.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' || e.button !== 0) return; pan = { x: e.clientX, y: e.clientY, sl: sv.scrollLeft, st: sv.scrollTop }; sv.setPointerCapture(e.pointerId); sv.classList.add('panning'); e.preventDefault(); });
    sv.addEventListener('pointermove', e => { if (!pan) return; sv.scrollLeft = pan.sl - (e.clientX - pan.x); sv.scrollTop = pan.st - (e.clientY - pan.y); });
    const end = () => { pan = null; sv.classList.remove('panning'); };
    sv.addEventListener('pointerup', end); sv.addEventListener('pointercancel', end); }
  window.addEventListener('resize', () => followCursor(false));
  $('showSheets').onchange = render;

  // irrotettava esikatselu
  $('btnPop').onclick = () => {
    let w = null; try { w = window.open('', 'kgEsikatselu', 'width=1100,height=800'); } catch (e) { w = null; }
    if (!w) { status('Selain ei sallinut uutta ikkunaa'); return; }
    popup = w;
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8"><title>Kartan esikatselu</title><style>body{margin:0;background:#e9e6df;font:13px system-ui}#t{position:sticky;top:0;padding:6px;background:#fffdf8;border-bottom:1px solid #ccc}#v{padding:12px}#v svg{display:block;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);height:auto}</style></head><body><div id="t"><button onclick="z(1/1.4)">−</button> <button onclick="Z=1;s()">Sovita</button> <button onclick="z(1.4)">+</button></div><div id="v"></div><script>var Z=1;function s(){var e=document.querySelector("#v svg");if(e)e.style.width=(Z*100)+"%"}function z(f){Z=Math.max(.25,Math.min(8,Z*f));s()}<\/script></body></html>');
    w.document.close();
    $('pvScroll').hidden = true; $('dockMsg').hidden = false;
    if (last) { const v = w.document.getElementById('v'); v.innerHTML = last.svg; sizeSvg(v); }
    const poll = setInterval(() => { if (!popup || popup.closed) { clearInterval(poll); dock(); } }, 800);
  };
  function dock() { if (popup && !popup.closed) popup.close(); popup = null; $('pvScroll').hidden = false; $('dockMsg').hidden = true; if (last) showSvg(last.svg); }
  $('btnDock').onclick = dock;

  // ---- tulostus ja vienti
  function printSvgs() {
    const { sc, s, L } = fullScene();
    if (s.mode === 'whole') { const [PW, PH] = KG.print.paperSize(s.paper, s.orient); return { svgs: [KG.print.wholeSvg(sc, s.paper, s.orient, s.margin)], PW, PH }; }
    return { svgs: L.sheets.map(sh => KG.print.sheetSvg(sc, L, sh)), PW: L.PW, PH: L.PH };
  }
  $('btnPrint').onclick = () => {
    fresh(); if (!last) return; const { svgs, PW, PH } = printSvgs(), html = KG.print.printHtml(svgs, PW, PH, doc.title);
    const host = $('printFrameHost'); host.innerHTML = ''; const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { status('Tulostus estetty – lataa tulostussivu ja tulosta se'); } };
    host.hidden = false; host.appendChild(fr); fr.srcdoc = html;
  };
  $('btnDlSvg').onclick = () => { fresh(); if (!last) return; const F = fullScene(), s = F.s; download(`${fileBase()}.svg`, s.mode === 'whole' ? KG.print.wholeSvg(F.sc, s.paper, s.orient, s.margin) : KG.renderer.svgWhole(F.sc, doc.title), 'image/svg+xml'); };
  // PNG: sama kuva kuin SVG-latauksessa, rasteroituna valitulla tarkkuudella valkoiselle pohjalle
  const PNG_MAX = 16e6; // pikseleitä (mobiiliselainten kangasraja)
  function svgToPng(svg, dpi) {
    return new Promise((res, rej) => {
      const m = svg.match(/^<svg[^>]*?\swidth="([\d.]+)mm"[^>]*?\sheight="([\d.]+)mm"/);
      if (!m) { rej(new Error('kuvan kokoa ei löytynyt')); return; }
      let sc = dpi / 25.4, w = +m[1] * sc, h = +m[2] * sc, shrunk = false;
      if (w * h > PNG_MAX) { const f = Math.sqrt(PNG_MAX / (w * h)); w *= f; h *= f; shrunk = true; }
      w = Math.round(w); h = Math.round(h);
      const src = svg.replace(/^(<svg[^>]*?\s)width="[\d.]+mm"/, `$1width="${w}"`).replace(/^(<svg[^>]*?\s)height="[\d.]+mm"/, `$1height="${h}"`);
      const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' })), img = new Image();
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
        cv.toBlob(bl => bl ? res({ blob: bl, w, h, shrunk }) : rej(new Error('kuvaa ei voitu muodostaa')), 'image/png'); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('SVG:n rasterointi epäonnistui')); };
      img.src = url;
    });
  }
  $('btnDlPng').onclick = () => { fresh(); if (!last) return; const F = fullScene(), s = F.s, svg = s.mode === 'whole' ? KG.print.wholeSvg(F.sc, s.paper, s.orient, s.margin) : KG.renderer.svgWhole(F.sc, doc.title);
    status('Muodostetaan PNG…');
    svgToPng(svg, +$('pngDpi').value).then(r => { download(`${fileBase()}.png`, r.blob, 'image/png'); if (r.shrunk) setTimeout(() => status(`PNG pienennettiin ${r.w}×${r.h} pikseliin (selaimen kokoraja)`), 1500); })
      .catch(e => status('PNG-vienti epäonnistui: ' + e.message)); };
  $('btnDlHtml').onclick = () => { fresh(); if (!last) return; const { svgs, PW, PH } = printSvgs(); download(`${fileBase()}_tulostus.html`, KG.print.printHtml(svgs, PW, PH, doc.title), 'text/html'); };
  $('btnCopy').onclick = async () => { fresh(); if (!last) return; try { await navigator.clipboard.writeText(KG.renderer.svgWhole(fullScene().sc, doc.title)); status('SVG kopioitu leikepöydälle'); } catch (e) { status('Kopiointi estetty'); } };
  document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => { const t = document.querySelector('input[name=mode]:checked').value === 'tiles'; $('fsTiles').disabled = !t; $('fsWhole').disabled = t; render(); });
  ['paper', 'orientW', 'cellMM', 'orientT', 'overlap', 'margin', 'wMain', 'wCoast', 'wThin', 'wSea', 'spSea', 'spSym', 'optLegend', 'optCompass', 'optTitle', 'optFrame', 'optGrid'].forEach(id => $(id).addEventListener('change', scheduleRender));

  // ---- tiedostot, generointi, koko
  // nykyinen kartta korvataan tiedostossa uudella (otsikko ja nimi säilyvät)
  function replaceDoc(nd, keepNames) {
    const f = doc.file, i = f ? f.maps.indexOf(doc) : -1;
    if (keepNames !== false) { nd.title = doc.title || nd.title; nd.hasHeading = doc.hasHeading; nd.name = doc.name || nd.name; }
    if (f && i >= 0) { f.maps[i] = nd; KG.rlml.attach(nd, f); }
    doc = nd;
  }
  // kartan korvaavat toiminnot tallettavat edellisen tilan pinoon; yläpalkin Palauta edellinen palauttaa sen
  // (selaimen vahvistusikkunat on estetty artefaktissa)
  const prevStack = [];
  function remember(what) {
    prevStack.push({ texts: projFiles(), map: doc.file ? Math.max(0, doc.file.maps.indexOf(doc)) : 0, what });
    if (prevStack.length > 10) prevStack.shift();
    refreshPrev();
  }
  function refreshPrev() { const b = $('btnPrev'), top = prevStack[prevStack.length - 1]; b.hidden = !top; if (top) b.title = `Palauta kartta sellaisena kuin se oli ennen toimintoa: ${top.what}`; }
  // ---- kartasto: uusi kartta lajin mukaan, kartan valinta, nimeäminen, koko, poisto
  const KIND_NAMES = { sea: 'merikartta', cave: 'luola', ship: 'laiva' };
  let newKind = 'sea';
  document.querySelectorAll('#newKind button').forEach(b => b.onclick = () => { newKind = b.dataset.kind; document.querySelectorAll('#newKind button').forEach(x => x.classList.toggle('on', x === b)); newFormHints(); });
  function newFormHints() { const ship = newKind === 'ship'; $('newFill').disabled = ship; if (ship) $('newFill').value = 'blank';
    const gen = $('newFill').value === 'gen' && !ship; $('seedLbl').hidden = $('btnRnd').hidden = !gen;
    $('newHint').textContent = ship ? 'Laivoille ei ole generaattoria: laiva alkaa tyhjänä merenä.' : gen ? (newKind === 'cave' ? 'Generoitu luola: käytävät, portaat, aarteet ja sali.' : 'Generoitu saaristo nimettyine alueineen.') : 'Tyhjä kartta täytetään ' + (newKind === 'cave' ? 'kalliolla.' : 'vedellä.'); }
  $('newFill').onchange = newFormHints;
  function makeMap() { const W = +$('newW').value, H = +$('newH').value, seed = +$('inSeed').value;
    if (!(W >= 8 && H >= 8)) { status('Anna kartan leveys ja korkeus (vähintään 8)'); return null; }
    const gen = $('newFill').value === 'gen' && newKind !== 'ship';
    const m = gen ? (newKind === 'cave' ? KG.generator.generateCave({ W, H, seed }) : KG.generator.generate({ W, H, seed })) : KG.rlml.mapOfKind(newKind, W, H);
    m.style = newKind; m.styleSet = newKind !== 'sea'; KG.rlml.refreshNames(m); return m; }
  const uniqueId = (f, base) => { let id = base, n = 2; while (f.maps.some(m => m.name === id)) id = base + n++; return id; };
  $('btnRnd').onclick = () => { $('inSeed').value = Math.floor(Math.random() * 99999) + 1; };
  $('btnAddMap').onclick = () => { const nd = makeMap(); if (!nd) return; const f = doc.file;
    nd.name = uniqueId(f, { sea: 'MERI', cave: 'LUOLA', ship: 'LAIVA' }[newKind]); nd.title = KIND_NAMES[newKind].replace(/^./, c => c.toUpperCase()) + ' ' + (f.maps.length + 1); nd.hasHeading = true;
    if (f.maps.length === 1 && !f.maps[0].hasHeading) { f.title = f.title || f.maps[0].title; f.maps[0].hasHeading = true; }
    nd.src = doc.src || f.parts[0]; remember('kartan lisäys'); f.maps.push(nd); KG.rlml.attach(nd, f); doc = nd; afterDocChange(); status(`Kartastoon lisättiin ${KIND_NAMES[newKind]} ${nd.name}`); };
  $('btnReplaceMap').onclick = () => { const nd = makeMap(); if (!nd) return; remember('kartan korvaus'); nd.src = doc.src; replaceDoc(nd); afterDocChange(); status(`Kartta ${doc.name} korvattiin uudella`); };
  $('btnNewAtlas').onclick = () => { const nd = makeMap(); if (!nd) return; remember('uusi kartasto');
    nd.name = { sea: 'MERIKARTTA', cave: 'LUOLA', ship: 'LAIVA' }[newKind]; nd.title = 'Uusi kartasto'; nd.hasHeading = false;
    const texts = fixAtlas(nd);
    doc = openTexts(texts); store.set('kg.map', '0'); afterDocChange(); status('Aloitettiin uusi kartasto'); };
  const fixAtlas = nd => KG.rlml.projectFiles(KG.rlml.projectOf(nd, 'Uusi kartasto'));
  // esimerkit: koko kartasto korvaa nykyisen
  (KG.examples || []).forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; $('exSel').appendChild(o); });
  $('exSel').onchange = e => { const x = (KG.examples || []).find(v => v.id === e.target.value); e.target.value = ''; if (!x) return;
    remember('esimerkki ' + x.name);
    doc = openTexts(x.files); store.set('kg.map', '0'); afterDocChange(); status(`Avattu esimerkki: ${x.name} – Palauta edellinen tuo aiemman kartaston takaisin`); };
  $('btnPrev').onclick = () => { const p = prevStack.pop(); if (!p) return; const f = KG.rlml.parseProject(p.texts); doc = f.maps[Math.max(0, Math.min(p.map, f.maps.length - 1))]; refreshPrev(); afterDocChange(); status(`Palautettu tilanne ennen toimintoa: ${p.what}`); };
  function selectMap(i) { const m = doc.file.maps[i]; if (!m || m === doc) return; doc = m; store.set('kg.map', String(i)); afterDocChange(); }
  $('atlasTitle').oninput = e => { doc.file.title = e.target.value; if (doc.file.maps.length === 1 && !doc.hasHeading) doc.title = e.target.value; touched(); };
  $('mapTitle').onchange = e => { doc.title = e.target.value.trim(); if (doc.file.maps.length > 1) doc.hasHeading = true; else doc.file.title = doc.title; touched(); fillFileTab(); };
  $('mapId').onchange = e => { const v = e.target.value.trim().toUpperCase();
    if (!/^[A-Z_][A-Z0-9_.]*$/.test(v)) { status('Tunnuksessa saa olla isoja kirjaimia, numeroita, _ ja .'); e.target.value = doc.name; return; }
    if (v !== doc.name && doc.file.maps.some(m => m.name === v)) { status(`Kartta ${v} on jo kartastossa`); e.target.value = doc.name; return; }
    doc.name = v; touched(); fillFileTab(); };
  $('btnResize').onclick = () => { let W = +$('inW').value, H = +$('inH').value; const at = doc.atlas;
    // atlaksen koko on aina kokonaisia lehtiä
    if (at) { at.cols = Math.max(1, Math.ceil(W / at.sw)); at.rows = Math.max(1, Math.ceil(H / at.sh)); W = at.cols * at.sw; H = at.rows * at.sh; }
    if (W === doc.W && H === doc.H) { status('Kartta on jo tämän kokoinen'); return; } remember('koon muutos'); KG.rlml.resize(doc, W, H);
    if (at) { at.atRows = at.atRows.filter(a => a.x < W && a.y < H); doc.at = doc.at.filter(a => a.x < W && a.y < H); status(`Atlas: ${at.cols} × ${at.rows} lehteä`); } ed.undo = []; afterDocChange(); };
  // karttalehdet: jako, lehtijaon muutos, tallennustapa ja purku
  $('btnAtlas').onclick = () => { const sw = +$('sheetW').value, sh = +$('sheetH').value; if (!(sw >= 4 && sh >= 4)) { status('Anna lehden koko (vähintään 4 × 4)'); return; }
    if (doc.atlas) { if (sw === doc.atlas.sw && sh === doc.atlas.sh) { status('Lehtijako on jo tämä'); return; } remember('lehtijaon muutos'); const n = KG.rlml.resplitAtlas(doc, sw, sh); ed.undo = []; afterDocChange(); status(`Lehtijako muutettiin: ${doc.atlas.cols} × ${doc.atlas.rows} lehteä${n ? `; ${n} lehtikohtaista aluetta nimettiin uudelleen` : ''}`); return; }
    remember('karttalehtiin jako'); const fill = KG.rlml.specNames((doc.legend.find(e => e.ch === KG.rlml.fillChar(doc)) || { spec: '' }).spec)[0] || null;
    KG.rlml.makeAtlas(doc, sw, sh, fill); ed.undo = []; afterDocChange(); status(`Kartta jaettiin ${doc.atlas.cols} × ${doc.atlas.rows} karttalehdeksi (${doc.name}.A01 …)`); };
  $('atlasLayout').onchange = e => { if (!doc.atlas) return; doc.atlas.layout = e.target.value; touched(); fillFileTab(); status(e.target.value === 'files' ? 'Lehdet tallennetaan omiin tiedostoihinsa' : 'Lehdet tallennetaan yhteen tiedostoon'); };
  $('btnUnatlas').onclick = () => { if (!doc.atlas) return; remember('lehtijaon purku'); KG.rlml.unmakeAtlas(doc); ed.undo = []; afterDocChange(); status('Lehtijako purettiin: kartta on taas yksi kartta'); };
  $('btnDelMap').onclick = () => { const f = doc.file; if (f.maps.length < 2) { status('Kartastossa on vain tämä kartta: aloita uusi kartasto tai korvaa kartta'); return; }
    remember('kartan ' + doc.name + ' poisto'); const i = f.maps.indexOf(doc), n = doc.name; f.maps.splice(i, 1); doc = f.maps[Math.max(0, i - 1)]; afterDocChange(); status(`Kartta ${n} poistettiin – Palauta edellinen tuo sen takaisin`); };
  // kaikki kartaston tiedostot peräkkäin (artefaktissa jokainen vahvistetaan erikseen)
  $('btnSave').onclick = async () => { if (srcDirtyAny()) status('Lähdekoodissa on hyväksymättömiä muutoksia: niitä ei tallenneta');
    const list = projFiles().filter(f => f.text.trim());
    for (const f of list) { const ok = await download(f.name, f.text, 'text/markdown'); if (ok === false) break; } };
  $('btnOpen').onclick = () => $('fileIn').click();
  $('fileIn').onchange = async e => { const fls = [...e.target.files]; e.target.value = ''; if (!fls.length) return;
    try { const texts = await Promise.all(fls.map(async f => ({ name: f.name, text: await f.text() }))); if (!texts.some(t => KG.rlml.kindOfEntry(t) === 'map')) { status('Valitse mukaan myös karttatiedosto (map …)'); return; }
      remember('tiedostojen avaus'); doc = openTexts(texts); store.set('kg.map', '0'); ed.undo = []; afterDocChange(); status('Avattu ' + fls.map(f => f.name).join(', ')); } catch (er) { status('Tiedostoa ei voitu lukea: ' + er.message); } };
  $('btnUndo').onclick = () => { ed.doUndo(); refreshUndo(); }; $('btnRedo').onclick = () => { ed.doRedo(); refreshUndo(); };
  function refreshUndo() { const u = !ed.undo.length, r = !ed.redo.length; $('btnUndo').disabled = u; $('btnRedo').disabled = r; }

  // ---- alueet: lista, työkalu, tarkistukset
  function areaChanged() { refreshModel(); buildAreaList(); ed.draw(); touched(); }
  function buildAreaList() {
    const L = $('areaList'), names = M.tree.slice(); if (selArea && !names.includes(selArea)) names.push(selArea);
    L.innerHTML = names.map(n => { const A = M.byName[n], lv = A ? A.level : 0, cnt = A ? A.rects.length : 0;
      return `<option value="${n}"${n === selArea ? ' selected' : ''}>${'   '.repeat(lv)}${KG.areas.displayName(doc, n)}  (${n}${cnt ? ', ' + cnt + ' ▭' : ', ei vielä suorakulmioita'})</option>`; }).join('');
  }
  function showChecks() { const v = KG.areas.validate(doc, M).concat((doc.warnings || []).map(m => ({ level: 'info', msg: m })));
    $('checks').innerHTML = v.slice(0, 10).map(x => `<div class="${x.level}">${x.level === 'error' ? '✖' : x.level === 'warn' ? '⚠' : 'ℹ'} ${x.msg.replace(/</g, '&lt;')}</div>`).join('') + (v.length > 10 ? `<div class="info">… ${v.length - 10} lisää</div>` : ''); }
  $('areaList').onchange = e => { selArea = e.target.value; setTool('area'); status(`Rajaustila: raahaa suorakulmio alueelle ${KG.areas.displayName(doc, selArea)}`); };
  // lukutila / muokkaustila ja työkalut
  const setTool = t => { ed.mode = t; ed.band = null; $('toolArea').classList.toggle('on', t === 'area'); $('toolMove').classList.toggle('on', t === 'move'); ed.cv.style.cursor = ed.viewOnly ? '' : t === 'area' ? 'cell' : t === 'move' ? 'move' : 'crosshair'; ed.cv.classList.toggle('read', ed.viewOnly); showTool(); ed.draw(); };
  showTool = () => {
    const nm = selArea ? KG.areas.displayName(doc, selArea) : null;
    $('toolInfo').innerHTML = ed.readOnly ? '' : ed.mode === 'paint' ? (ed.paintLock ? (nm ? `Valittu: <b>${nm}</b> – Rajaa tai Siirrä` : 'Napsauta aluetta kartalla tai valitse listasta') : '') :
      ed.mode === 'area' ? (nm ? `Rajaus: <b>${nm}</b> – raahaa suorakulmio` : 'Rajaus: valitse alue listasta') :
      nm ? `Siirto: <b>${nm}</b> – raahaa kartalla` : 'Siirto: tartu alueeseen kartalla';
    $('btnToolDone').hidden = ed.readOnly || ed.mode === 'paint';
    // valittu pala selitepalkin yläreunassa
    const e = doc.legend.find(l => l.ch === ed.brush), bc = $('brushCh');
    bc.textContent = ed.brush; bc.style.background = KG.editorColors(doc)[ed.brush] || '#fff'; $('brushName').textContent = e ? e.name : 'tuntematon pala';
  };
  endAreaTool = () => { selArea = null; setTool('paint'); buildAreaList(); };
  // lukutila ja muokkaustila ovat välilehtiä (Kartan luku / Kartan muokkaus); setTab kutsuu tätä
  setMode = read => { if (read !== ed.readOnly) ed.setReadOnly(read); if (read && ed.mode !== 'paint') endAreaTool(); setTool(ed.mode); };
  $('btnToolDone').onclick = () => endAreaTool();
  $('toolArea').onclick = () => { setMode(false); setTool('area'); if (!selArea) status('Valitse alue listasta tai luo uusi'); };
  $('toolMove').onclick = () => { setMode(false); setTool('move'); status('Tartu alueeseen kartalla ja raahaa; nuolinäppäimet siirtävät valittua'); };
  $('areaList').onchange = e => { selArea = e.target.value; showTool(); ed.draw();
    const A = M.byName[selArea]; if (A && A.bbox) { const sc = ed.sc; sc.scrollLeft = A.bbox.x * ed.cw - 20; sc.scrollTop = A.bbox.y * ed.ch - 20; } };
  $('showAreas').onchange = () => ed.draw();
  $('btnNewArea').onclick = () => { const t = $('newArea').value.trim(); if (!t) { status('Kirjoita alueen nimi'); return; }
    let id = KG.rlml.toId(t), n = 2; const base = id; while (M.byName[id] || (doc.texts[id] && doc.texts[id] !== t)) id = base + '_' + n++;
    doc.texts[id] = t; selArea = id; $('newArea').value = ''; setMode(false); setTool('area'); buildAreaList(); touched(); status(`Raahaa alueen ${t} suorakulmio kartalle`); };
  $('newArea').onkeydown = e => { if (e.key === 'Enter') $('btnNewArea').onclick(); };
  $('btnDelArea').onclick = () => { if (!selArea) return; const n = selArea; ed.snapshot(); doc.areas = doc.areas.filter(a => a.name !== n); delete doc.texts[n]; doc.rules = doc.rules.filter(r => r.name !== n); selArea = null; areaChanged(); showTool(); status(`Alue ${n} poistettu`); };

  // ---- nimet ja lähde
  $('inTitle').oninput = e => { doc.title = e.target.value; touched(); };
  $('btnNamesApply').onclick = () => { doc.rules = KG.rlml.parseRulesText($('rulesTa').value); doc.texts = KG.rlml.parseTextsText($('textsTa').value); areaChanged(); status('Nimet päivitetty'); };
  const fillNames = () => { $('inTitle').value = doc.title || ''; $('rulesTa').value = KG.rlml.rulesText(doc); $('textsTa').value = KG.rlml.textsText(doc); $('langLbl').textContent = doc.lang || 'fi'; };
  // ---- Lähdekoodi: kartaston tiedostot omilla välilehdillään; Hyväksy muutokset ottaa kaikki kerralla käyttöön.
  // Puskuri: { name, kind, lang, text, orig, isNew, removed }. Hyväksymättömiä muutoksia ei kirjoiteta yli.
  let srcBuf = [], srcCur = null;
  const srcDirtyAny = () => srcBuf.some(b => b.isNew || b.removed || b.text !== b.orig);
  const KIND_LABEL = { map: 'kartat', style: 'paperityyli', lang: 'kieli' };
  function refreshSrc(force) {
    const files = projFiles();
    if (force) srcBuf = [];
    // puhtaat tiedostot päivitetään mallista; muokatut ja uudet säilyvät
    const keep = srcBuf.filter(b => b.isNew || b.removed || b.text !== b.orig);
    srcBuf = files.map(f => { const k = keep.find(b => b.name === f.name && !b.isNew); return k || { name: f.name, kind: f.kind, lang: f.lang, sheet: f.sheet, text: f.text, orig: f.text }; })
      .concat(keep.filter(b => b.isNew));
    if (!srcBuf.some(b => b.name === srcCur)) srcCur = (srcBuf.find(b => b.kind === 'map') || srcBuf[0]).name;
    buildSrcTabs(); showSrcFile(); buildMapCards($('srcMaps'), true); srcState();
  }
  function buildSrcTabs() {
    const el = $('srcTabs'); el.innerHTML = '';
    // atlaksen lehtitiedostot yhden välilehden alla, kun niitä on paljon
    const sheets = srcBuf.filter(b => b.sheet), group = sheets.length > 6;
    for (const b of srcBuf) {
      if (group && b.sheet) { if (b !== sheets[0]) continue;
        const t = document.createElement('button'), on = sheets.some(x => x.name === srcCur), nd = sheets.filter(x => x.isNew || x.removed || x.text !== x.orig).length;
        t.className = 'srctab' + (on ? ' on' : '') + (nd ? ' dirty' : ''); t.title = 'Atlaksen karttalehdet omissa tiedostoissaan';
        t.innerHTML = `<span class="k">lehdet</span> ${sheets.length} tiedostoa${nd ? ' •' : ''} `;
        const sel = document.createElement('select'); sel.className = 'sheetsel';
        sel.innerHTML = sheets.map(x => `<option value="${x.name}"${x.name === srcCur ? ' selected' : ''}>${x.sheet}${x.isNew || x.removed || x.text !== x.orig ? ' •' : ''}</option>`).join('');
        sel.onclick = ev => ev.stopPropagation(); sel.onchange = () => { srcCur = sel.value; buildSrcTabs(); showSrcFile(); };
        t.appendChild(sel); t.onclick = () => { if (!on) { srcCur = sel.value; buildSrcTabs(); showSrcFile(); } }; el.appendChild(t); continue; }
      const t = document.createElement('button'), dirty = b.isNew || b.removed || b.text !== b.orig;
      t.className = 'srctab' + (b.name === srcCur ? ' on' : '') + (dirty ? ' dirty' : '') + (b.removed ? ' removed' : '');
      t.title = `${b.name} (${KIND_LABEL[b.kind]}${b.lang ? ' ' + b.lang : ''})${b.removed ? ' – poistetaan, kun muutokset hyväksytään' : dirty ? ' – hyväksymättömiä muutoksia' : ''}`;
      t.innerHTML = `<span class="k">${KIND_LABEL[b.kind]}</span> ${b.name.replace(/</g, '&lt;')}${dirty ? ' •' : ''}`;
      t.onclick = () => { srcCur = b.name; buildSrcTabs(); showSrcFile(); };
      const primaryLang = b.kind === 'lang' && b === srcBuf.find(x => x.kind === 'lang'), isAtlasMain = b.kind === 'map' && !b.sheet && /^atlas\s/m.test(b.text) && sheets.length > 0, canDel = !primaryLang && !isAtlasMain && (b.kind !== 'map' || b.sheet || srcBuf.filter(x => x.kind === 'map' && !x.sheet && !x.removed).length > 1 || b.removed);
      if (canDel && b.kind !== 'style') { const x = document.createElement('span'); x.className = 'x'; x.textContent = b.removed ? '↺' : '✕'; x.title = b.removed ? 'Peru poisto' : 'Poista tiedosto kartastosta (kun muutokset hyväksytään)';
        x.onclick = ev => { ev.stopPropagation(); if (b.isNew) srcBuf = srcBuf.filter(y => y !== b); else b.removed = !b.removed; refreshSrcView(); }; t.appendChild(x); }
      el.appendChild(t);
    }
    const add = document.createElement('button'); add.className = 'srctab add'; add.textContent = '+ Uusi tiedosto'; add.title = 'Lisää kartastoon uusi kartta- tai kielitiedosto';
    add.onclick = () => { $('newFileRow').hidden = false; newFileDefaults(); $('newFileName').focus(); }; el.appendChild(add);
  }
  const refreshSrcView = () => { if (!srcBuf.some(b => b.name === srcCur)) srcCur = srcBuf[0].name; buildSrcTabs(); showSrcFile(); srcState(); };
  function showSrcFile() { const b = srcBuf.find(x => x.name === srcCur); $('srcTa').value = b ? b.text : ''; $('srcTa').readOnly = !!(b && b.removed); }
  function srcState() { const d = srcDirtyAny(), n = srcBuf.filter(b => b.isNew || b.removed || b.text !== b.orig).length;
    $('srcNote').hidden = !d; $('srcNote').textContent = d ? `Hyväksymättömiä muutoksia ${n} tiedostossa` : ''; $('btnSrcRevert').hidden = !d; $('btnSrcApply').classList.toggle('dirty', d); }
  $('srcTa').oninput = () => { const b = srcBuf.find(x => x.name === srcCur); if (!b || b.removed) return; const was = b.text !== b.orig; b.text = $('srcTa').value; if (was !== (b.text !== b.orig)) buildSrcTabs(); srcState(); };
  $('btnSrcRevert').onclick = () => { refreshSrc(true); status('Lähdekoodin muutokset peruttiin'); };
  $('btnSrcApply').onclick = () => { try {
      const list = srcBuf.filter(b => !b.removed).map(b => ({ name: b.name, kind: b.kind, text: b.text }));
      if (!list.some(b => KG.rlml.kindOfEntry(b) === 'map' && b.text.trim())) throw new Error('kartastossa ei ole yhtään karttaa');
      const name = doc.name, fl = KG.rlml.parseProject(list), d = fl.maps.find(m => m.name === name) || fl.maps[0];
      if (!d.W || !d.H) throw new Error('map-rivi puuttuu');
      remember('lähdekoodin muutokset'); doc = d; srcBuf = []; afterDocChange(); refreshSrc(true);
      status(fl.maps[0].warnings && fl.maps[0].warnings.length ? fl.maps[0].warnings[0] : 'Muutokset hyväksyttiin'); } catch (e) { status('Virhe lähteessä: ' + e.message); } };
  // uusi tiedosto: laji, kieli ja nimi; tiedosto tulee käyttöön, kun muutokset hyväksytään
  function newFileDefaults() { const k = $('newFileKind').value; $('newFileLangLbl').hidden = k !== 'lang';
    if (k === 'style' && srcBuf.some(b => b.kind === 'style' && !b.removed)) { $('newFileKind').value = 'map'; return newFileDefaults(); }
    const f = { title: doc.file.title, maps: doc.file.maps, sources: srcBuf.map(b => ({ name: b.name })) }; $('newFileName').value = KG.rlml.defaultName(f, k, $('newFileLang').value.trim().toLowerCase() || 'en'); }
  $('newFileKind').onchange = newFileDefaults; $('newFileLang').oninput = newFileDefaults;
  $('btnNewFileCancel').onclick = () => { $('newFileRow').hidden = true; };
  $('btnNewFileOk').onclick = () => { const k = $('newFileKind').value, lang = $('newFileLang').value.trim().toLowerCase(), name = $('newFileName').value.trim();
    if (!name) { status('Anna tiedostolle nimi'); return; } if (srcBuf.some(b => b.name === name)) { status(`Tiedosto ${name} on jo kartastossa`); return; }
    if (k === 'lang' && !/^[a-z]{2,3}$/.test(lang)) { status('Kielen tunnus on 2–3 pientä kirjainta, esim. en'); return; }
    if (k === 'style' && srcBuf.some(b => b.kind === 'style' && !b.removed)) { status('Kartastossa on jo paperityyli'); return; }
    const text = KG.rlml.fileTemplate(doc.file, k, lang); srcBuf.push({ name, kind: k, lang: k === 'lang' ? lang : undefined, text, orig: '', isNew: true });
    srcCur = name; $('newFileRow').hidden = true; refreshSrcView(); status(`Uusi tiedosto ${name}: muokkaa ja hyväksy muutokset`); };

  // ---- yläpalkin välilehdet: kukin valitsee sivupaneelin sisällön ja näkyvät osat (CSS: body[data-tab])
  const TAB_TITLES = { read: '', edit: 'Selite', areas: 'Alueet', file: '', src: '', print: 'Tulostus', names: 'Nimet', help: 'Ohje', preview: 'Selite' };
  // esikatselun valinta on oma kullekin karttavälilehdelle (luku, muokkaus, alueet); puhelimessa esikatselu on omalla välilehdellään
  const PV_TABS = ['read', 'edit', 'areas'], pvKey = t => 'kg.pv.' + t;
  function applyPv() {
    const t = document.body.dataset.tab, mobile = matchMedia('(max-width: 820px)').matches, on = store.get(pvKey(t)) !== '0';
    $('pvToggle').checked = on;
    document.body.classList.toggle('pv-off', PV_TABS.includes(t) && !on && !mobile);
    if (pvShown()) { if (pvDirty) render(); else if (last && !(popup && !popup.closed)) showSvg(last.svg); }
  }
  $('pvToggle').onchange = e => { store.set(pvKey(document.body.dataset.tab), e.target.checked ? '1' : '0'); applyPv(); };
  window.addEventListener('resize', () => applyPv());
  function setTab(t) {
    if (t === 'map') t = 'edit';
    if (TAB_TITLES[t] === undefined) t = 'file';
    const mobile = matchMedia('(max-width: 820px)').matches;
    if (t === 'preview' && !mobile) t = 'edit';
    // kartta pysyy ruudulla paikallaan, vaikka sivupaneeli ilmestyy viereen tai yläpuolelle
    const sv = $('edScroll'), was = sv.offsetParent ? sv.getBoundingClientRect() : null, wasL = sv.scrollLeft, wasT = sv.scrollTop;
    palOpen(false);
    document.body.dataset.tab = t; store.set('kg.tab', t);
    document.querySelectorAll('#mainTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('sideTitle').textContent = TAB_TITLES[t];
    if (t !== 'areas' && ed.mode !== 'paint') endAreaTool();
    ed.paintLock = t === 'areas';
    if (t === 'read') setMode(true); else if (t === 'edit' || t === 'areas') setMode(false); else setTool(ed.mode);
    if (t === 'file') fillFileTab();
    if (t === 'src') refreshSrc();
    if (t === 'names') fillNames();
    applyPv();
    if (was && sv.offsetParent) keepMapPlace(sv, was, wasL, wasT);
    ed.draw();
  }
  document.querySelectorAll('#mainTabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  // editorin alue siirtyi ruudulla (paneeli tuli viereen tai yläpuolelle): vieritetään saman verran, jotta kartta
  // pysyy paikallaan; jos kartta ei riitä vieritykseen, oikealle ja alas lisätään tyhjää vieritysvaraa
  const slack = { x: 0, y: 0 };
  function keepMapPlace(sv, was, wasL, wasT) {
    const now = sv.getBoundingClientRect(), wantL = Math.max(0, wasL + now.left - was.left), wantT = Math.max(0, wasT + now.top - was.top);
    const baseW = sv.scrollWidth - slack.x, baseH = sv.scrollHeight - slack.y;
    slack.x = Math.max(0, Math.ceil(wantL - (baseW - sv.clientWidth))); slack.y = Math.max(0, Math.ceil(wantT - (baseH - sv.clientHeight)));
    ed.sp.style.marginRight = slack.x + 'px'; ed.sp.style.marginBottom = slack.y + 'px';
    sv.scrollLeft = wantL; sv.scrollTop = wantT;
  }

  // karttakortit (Kartasto- ja Lähdekoodi-välilehdet): pienoiskartta, nimi, laji ja koko
  function drawThumb(cv, m, maxW, maxH) {
    const k = Math.max(1, Math.min(6, Math.floor(Math.min(maxW / m.W, maxH / m.H)))), cm = KG.editorColors(m);
    cv.width = m.W * k; cv.height = m.H * k; const c = cv.getContext('2d');
    for (let j = 0; j < m.H; j++) { const r = m.grid[j] || ''; for (let i = 0; i < m.W; i++) { c.fillStyle = cm[r[i]] || '#fff'; c.fillRect(i * k, j * k, k, k); } }
  }
  function buildMapCards(el, compact) {
    if (!el.offsetParent) return; el.innerHTML = ''; const f = doc.file, maps = f ? f.maps : [doc];
    maps.forEach((m, i) => {
      const fig = document.createElement('figure'); fig.className = 'mapcard' + (m === doc ? ' on' : ''); fig.tabIndex = 0;
      const cv = document.createElement('canvas'); drawThumb(cv, m, compact ? 170 : 200, compact ? 110 : 130); fig.appendChild(cv);
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${(m.title || m.name).replace(/</g, '&lt;')}</b><span>${m.name} · ${KIND_NAMES[m.style] || 'merikartta'}${m.atlas ? ` · atlas ${m.atlas.cols} × ${m.atlas.rows} lehteä` : ''} · ${m.W} × ${m.H}${f && f.parts.length > 1 && m.src ? ' · ' + m.src.name : ''}</span>`;
      fig.appendChild(cap); fig.title = compact ? 'Näytä kartan lähdekoodi' : 'Napsauta: valitse · kaksoisnapsauta: muokkaa';
      fig.onclick = () => { selectMap(i); if (compact) srcShowMap(m); };
      fig.ondblclick = () => { if (!compact) setTab('edit'); };
      fig.onkeydown = e => { if (e.key === 'Enter') { if (compact) fig.onclick(); else { selectMap(i); setTab('edit'); } } };
      el.appendChild(fig);
    });
  }
  // kartan valinta Lähdekoodissa: sen tiedoston välilehti ja map-rivi näkyviin
  function srcShowMap(m) {
    let nm = m.src ? m.src.name : null;
    // atlas, lehti per tiedosto: kursorin lehden tiedosto
    if (m.atlas && m.atlas.layout === 'files' && m === doc) { const id = KG.rlml.sheetId(m.atlas, Math.floor(ed.cur.x / m.atlas.sw), Math.floor(ed.cur.y / m.atlas.sh)), sb = srcBuf.find(x => x.sheet === id); if (sb) { srcCur = sb.name; buildSrcTabs(); showSrcFile(); return; } }
    const b = srcBuf.find(x => x.name === nm) || srcBuf.find(x => x.kind === 'map'); if (!b) return;
    srcCur = b.name; buildSrcTabs(); showSrcFile();
    const ta = $('srcTa'), re = new RegExp('^(map|atlas)\\s+' + m.name.replace(/\./g, '\\.') + '\\b', 'm'), mm = re.exec(ta.value); if (!mm) return;
    const line = ta.value.slice(0, mm.index).split('\n').length - 1, lh = parseFloat(getComputedStyle(ta).lineHeight) || 16;
    ta.scrollTop = Math.max(0, line * lh - 8); ta.setSelectionRange(mm.index, mm.index + mm[0].length);
  }
  function fillFileTab() {
    const f = doc.file; $('atlasTitle').value = f.title || ''; buildMapCards($('mapCards'), false);
    const files = projFiles().filter(x => x.text.trim());
    const sh = files.filter(x => x.sheet), rest = files.filter(x => !x.sheet);
    $('atlasFiles').textContent = 'Tiedostot: ' + rest.map(x => x.name).join(', ') + (sh.length ? ` sekä ${sh.length} karttalehteä (${sh[0].name} … ${sh[sh.length - 1].name})` : '');
    $('selInfo').innerHTML = `<b>${(doc.title || doc.name).replace(/</g, '&lt;')}</b> – ${KIND_NAMES[doc.style] || 'merikartta'}, ${doc.W} × ${doc.H} ruutua. <span class="hint">Piirtotapa (merikartta, luola, laiva) on paperityylin <code>maps.theme paper</code> -rivillä; sen voi vaihtaa Lähdekoodissa.</span>`;
    $('mapId').value = doc.name; $('mapTitle').value = doc.title || ''; $('inW').value = doc.W; $('inH').value = doc.H;
    $('btnDelMap').disabled = f.maps.length < 2; newFormHints();
    const at = doc.atlas; $('atlasOpts').hidden = !at; $('btnAtlas').textContent = at ? 'Muuta lehtijakoa' : 'Jaa karttalehdiksi';
    if (at) { const n = KG.rlml.sheetParts(doc).filter(S => !S.empty).length; $('sheetW').value = at.sw; $('sheetH').value = at.sh; $('atlasLayout').value = at.layout || 'single';
      $('atlasInfo').innerHTML = `Atlas <b>${doc.name}</b>: ${at.cols} × ${at.rows} lehteä (${KG.rlml.sheetId(at, 0, 0)}–${KG.rlml.sheetId(at, at.cols - 1, at.rows - 1)}), lehti ${at.sw} × ${at.sh} ruutua. Tallennettavia lehtiä ${n}; kokonaan ${at.fill || 'täyttöä'} olevat lehdet jätetään pois. Lehdet ovat RLML-karttoja <code>${doc.name}.A01</code> …, ja editori näyttää lehtien rajat.`; }
    else $('atlasInfo').innerHTML = 'Iso kartta voidaan tallentaa karttalehtinä: jokainen lehti on oma RLML-kartta (<code>' + doc.name + '.A01</code>, <code>' + doc.name + '.B10</code> …; kirjain on sarake, numero rivi). Lehden koko kirjoitetaan atlaksen <code>atlas</code>-riville.';
  }
  function afterDocChange() { ed.undo = []; ed.redo = []; { const n = KG.areas.normalize(doc); if (n) doc.warnings = (doc.warnings || []).concat(`Sisäkkäisiä rajauksia yhdistettiin: ${n}`); } buildLegendPick(); selArea = null; refreshModel(); fillNames(); buildPalette(); buildAreaList(); ed.setDoc(); touched(); if (doc.warnings && doc.warnings.length) status(doc.warnings[0]); }
  afterDocChange(); setTab(store.get('kg.tab') || 'file');
  window.KG_APP = { get doc() { return doc; }, editor: ed, render };
})();
