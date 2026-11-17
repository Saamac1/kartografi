// Käyttöliittymän kytkennät: editori, esikatselu, tulostus, tiedostot.
(function () {
  'use strict';
  const KG = globalThis.KG, $ = id => document.getElementById(id);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ei tallennusta */ } } };
  let doc = null;
  // projekti tallentuu selaimeen kolmena tiedostona (kartat, paperityyli, kieli)
  const projText = () => KG.rlml.serializeProject(doc.file);
  const openTexts = texts => KG.rlml.parseProject(texts).maps[0];
  try { const pj = store.get('kg.proj'), old = store.get('kg.doc'); doc = pj ? openTexts(Object.values(JSON.parse(pj))) : old ? openTexts([old]) : null; } catch (e) { doc = null; }
  if (!doc || !doc.W) doc = KG.generator.generate({ W: 64, H: 44, seed: 7 });
  { const mi = +store.get('kg.map'); if (doc.file && mi > 0 && doc.file.maps[mi]) doc = doc.file.maps[mi]; }

  // ---- tila ja apurit
  let statusT = 0;
  function status(msg) { $('status').textContent = msg; clearTimeout(statusT); statusT = setTimeout(() => { $('status').textContent = ''; }, 4000); }
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
    onCursor: (c, k) => { const e = doc.legend.find(l => l.ch === k), path = M.at(c.x, c.y).map(n => KG.areas.displayName(doc, n)).join(' › '); $('cursorInfo').textContent = `x ${c.x}, y ${c.y}   "${k}" ${e ? e.name : 'tuntematon merkki'}   ${path ? '▸ ' + path : ''}`; followCursor(false); },
  });
  function buildPalette() {
    const p = $('palette'); p.innerHTML = ''; const cmap = KG.editorColors(doc);
    for (const e of doc.legend) {
      const b = document.createElement('button'); b.className = 'pal' + (e.ch === ed.brush ? ' on' : ''); b.dataset.ch = e.ch;
      b.innerHTML = `<span class="ch" style="background:${cmap[e.ch] || '#fff'}">${e.ch.replace('<', '&lt;')}</span><span>${e.name}${e.decor ? ' <i>(koriste)</i>' : ''}</span>`;
      b.title = e.spec; b.onclick = () => { setBrush(e.ch); setMode && setMode(false); endAreaTool && endAreaTool(); if (!matchMedia('(pointer: coarse)').matches) ed.cv.focus({ preventScroll: true }); };
      p.appendChild(b);
    }
    buildPalAdd(); buildPalSel();
  }
  // puhelimessa palat ovat pudotusvalikossa (sivellinruudussa); lopussa legendasta puuttuvat oletuspalat
  const missingDefaults = () => { if (doc.style && doc.style !== 'sea') return []; const have = new Set(Object.values(KG.rlml.typeMap(doc))); return KG.rlml.DEFAULT_LEGEND.filter(e => !have.has(KG.rlml.typeOf(e.spec))); };
  function buildPalSel() {
    const sel = $('palSel'), esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'), miss = missingDefaults();
    sel.innerHTML = doc.legend.map(e => `<option value="${esc(e.ch)}">${esc(e.ch)}  ${esc(e.name)}${e.decor ? ' (koriste)' : ''}</option>`).join('')
      + (miss.length ? `<optgroup label="Lisää selitteeseen">${miss.map((e, i) => `<option value="+${i}">+ ${esc(e.name)}${e.decor ? ' (koriste)' : ''}</option>`).join('')}</optgroup>` : '');
    sel.value = ed.brush;
  }
  $('palSel').onchange = e => { const v = e.target.value;
    if (v.length > 1 && v[0] === '+') { const d = missingDefaults()[+v.slice(1)]; if (d) addDefault(d); else e.target.value = ed.brush; return; }
    setBrush(v); endAreaTool && endAreaTool(); };
  function addDefault(e) {
    const used = new Set(doc.legend.map(l => l.ch)), pool = e.ch + 'CshRSVABEFGHIJLMNOPQUWZabcdefgijklmopqtuvwxyz0123456789';
    const ch = [...pool].find(c => !used.has(c)); if (!ch) { status('Vapaita merkkejä ei ole'); return; }
    doc.legend.push(Object.assign({}, e, { ch })); buildPalette(); buildLegendPick(); touched(); setBrush(ch); setMode && setMode(false);
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
  }
  function setBrush(ch) { ed.brush = ch; document.querySelectorAll('.pal').forEach(b => b.classList.toggle('on', b.dataset.ch === ch)); $('palSel').value = ch; showTool(); ed.draw(); }
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
  function touched() { refreshModel(); showChecks(); refreshUndo(); store.set('kg.proj', JSON.stringify(projText())); scheduleRender(); if (document.body.dataset.tab === 'file') showSrc(); }
  // piilossa olevaa esikatselua ei piirretä; piirto tehdään, kun esikatselu tulee näkyviin tai kuvaa tarvitaan
  let pvDirty = false;
  const pvShown = () => (popup && !popup.closed) || $('previewPane').offsetParent !== null;
  function scheduleRender() { clearTimeout(renderT); if (!pvShown()) { pvDirty = true; return; } $('renderInfo').textContent = 'piirretään…'; renderT = setTimeout(render, 280); }
  function fresh() { if (pvDirty || !last) { clearTimeout(renderT); render(); } }
  function render() {
    pvDirty = false;
    const s = settings(), t0 = performance.now();
    let sc;
    try { sc = KG.renderer.scene(doc, s); } catch (e) { console.error(e); $('renderInfo').textContent = 'Virhe: ' + e.message; return; }
    let svg = KG.renderer.svgWhole(sc, doc.title), L = null;
    if (s.mode === 'tiles') L = layoutTiles(sc, s);
    if (L && $('showSheets').checked) {
      let ov = ''; for (const sh of L.sheets) { const x = sh.x0 * sc.k, y = sh.y0 * sc.k, w = L.aw * sc.k, h = L.ah * sc.k;
        ov += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(200,30,60,.04)" stroke="#c0304a" stroke-width="2" stroke-dasharray="10 6"/><text x="${x + 12}" y="${y + 34}" font-size="28" font-family="sans-serif" fill="#c0304a">${sh.name}</text>`; }
      svg = svg.replace(/<\/svg>$/, ov + '</svg>');
    }
    last = { sc, s, L, svg };
    showSvg(svg);
    const ms = Math.round(performance.now() - t0), mmW = (sc.VW / sc.k).toFixed(0), mmH = (sc.VH / sc.k).toFixed(0);
    $('renderInfo').textContent = `${doc.W}×${doc.H} ruutua · ${ms} ms`;
    $('printInfo').textContent = s.mode === 'whole'
      ? `Kartta ${mmW} × ${mmH} mm, ruutu ${s.cellMM.toFixed(2)} mm, paperi ${s.paper} ${s.orient === 'landscape' ? 'vaaka' : 'pysty'}.`
      : `${L.sheets.length} lehteä (${L.cols} × ${L.rows}), A4 ${L.PW > L.PH ? 'vaaka' : 'pysty'}, kartta ${mmW} × ${mmH} mm, ruutu ${s.cellMM} mm, liimausreuna ${s.overlap} mm.`;
    const links = $('sheetLinks'); links.innerHTML = '';
    if (L) for (const sh of L.sheets) { const b = document.createElement('button'); b.textContent = 'Lehti ' + sh.name; b.onclick = () => download(`${fileBase()}_${sh.name}.svg`, KG.print.sheetSvg(sc, L, sh), 'image/svg+xml'); links.appendChild(b); }
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
    const sv = $('pvScroll'), el = $('pv').querySelector('svg'), mk = $('pvCur'); if (!el || !last || sv.hidden) return;
    // svg-elementillä ei ole offsetLeft/Top: sijainti #pv:n suhteen näytön koordinaateista
    const er = el.getBoundingClientRect(), pr = $('pv').getBoundingClientRect(), ox = er.left - pr.left, oy = er.top - pr.top;
    const c = ed.cur, s = er.width / last.sc.VW, cs = 16 * s, x = ox + (last.sc.MG + c.x * 16) * s, y = oy + (last.sc.MG + (last.sc.oy || 0) + c.y * 16) * s;
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
    const { sc, s, L } = last;
    if (s.mode === 'whole') { const [PW, PH] = KG.print.paperSize(s.paper, s.orient); return { svgs: [KG.print.wholeSvg(sc, s.paper, s.orient, s.margin)], PW, PH }; }
    return { svgs: L.sheets.map(sh => KG.print.sheetSvg(sc, L, sh)), PW: L.PW, PH: L.PH };
  }
  $('btnPrint').onclick = () => {
    fresh(); if (!last) return; const { svgs, PW, PH } = printSvgs(), html = KG.print.printHtml(svgs, PW, PH, doc.title);
    const host = $('printFrameHost'); host.innerHTML = ''; const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { status('Tulostus estetty – lataa tulostussivu ja tulosta se'); } };
    host.hidden = false; host.appendChild(fr); fr.srcdoc = html;
  };
  $('btnDlSvg').onclick = () => { fresh(); if (!last) return; const s = last.s; download(`${fileBase()}.svg`, s.mode === 'whole' ? KG.print.wholeSvg(last.sc, s.paper, s.orient, s.margin) : KG.renderer.svgWhole(last.sc, doc.title), 'image/svg+xml'); };
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
  $('btnDlPng').onclick = () => { fresh(); if (!last) return; const s = last.s, svg = s.mode === 'whole' ? KG.print.wholeSvg(last.sc, s.paper, s.orient, s.margin) : KG.renderer.svgWhole(last.sc, doc.title);
    status('Muodostetaan PNG…');
    svgToPng(svg, +$('pngDpi').value).then(r => { download(`${fileBase()}.png`, r.blob, 'image/png'); if (r.shrunk) setTimeout(() => status(`PNG pienennettiin ${r.w}×${r.h} pikseliin (selaimen kokoraja)`), 1500); })
      .catch(e => status('PNG-vienti epäonnistui: ' + e.message)); };
  $('btnDlHtml').onclick = () => { fresh(); if (!last) return; const { svgs, PW, PH } = printSvgs(); download(`${fileBase()}_tulostus.html`, KG.print.printHtml(svgs, PW, PH, doc.title), 'text/html'); };
  $('btnCopy').onclick = async () => { fresh(); if (!last) return; try { await navigator.clipboard.writeText(KG.renderer.svgWhole(last.sc, doc.title)); status('SVG kopioitu leikepöydälle'); } catch (e) { status('Kopiointi estetty'); } };
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
  $('btnGen').onclick = () => { const W = +$('inW').value, H = +$('inH').value, seed = +$('inSeed').value;
    if (doc.style === 'ship') { status('Laivakartoille ei ole generaattoria'); return; }
    replaceDoc(doc.style === 'cave' ? KG.generator.generateCave({ W, H, seed }) : KG.generator.generate({ W, H, seed })); afterDocChange(); status('Generoitu siemenellä ' + seed); };
  $('btnRnd').onclick = () => { $('inSeed').value = Math.floor(Math.random() * 99999) + 1; $('btnGen').onclick(); };
  // tyhjä kartta samalla tyylillä ja legendalla, täytetty oletuspalalla
  function blankLike(W, H) { const nd = KG.rlml.newMap(W, H, doc.style); nd.styleSet = doc.styleSet || doc.style !== 'sea'; nd.legend = doc.legend.map(e => Object.assign({}, e)); nd.tileRules = (doc.tileRules || []).slice(); nd.vars = Object.assign({}, doc.vars); nd.raw = (doc.raw || []).filter(r => /^vars:/i.test(r.head.trim())).map(r => ({ head: r.head, lines: r.lines.slice() }));
    const fc = KG.rlml.fillChar(Object.assign({}, nd, { legend: nd.legend })); nd.grid = Array.from({ length: H }, () => fc.repeat(W)); return nd; }
  $('btnNew').onclick = () => { replaceDoc(blankLike(+$('inW').value, +$('inH').value)); afterDocChange(); };
  $('btnAddMap').onclick = () => { const f = doc.file, nd = blankLike(+$('inW').value, +$('inH').value); let n = f.maps.length + 1; while (f.maps.some(m => m.name === 'KARTTA' + n)) n++;
    nd.name = 'KARTTA' + n; nd.title = 'Kartta ' + n; nd.hasHeading = true;
    if (f.maps.length === 1 && !f.maps[0].hasHeading) { f.title = f.title || f.maps[0].title; f.maps[0].hasHeading = true; }
    f.maps.push(nd); KG.rlml.attach(nd, f); doc = nd; afterDocChange(); status(`Lisätty kartta ${nd.name}`); };
  // esimerkit: koko tiedosto korvaa nykyisen (kysytään ensin)
  (KG.examples || []).forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; $('exSel').appendChild(o); });
  $('exSel').onchange = e => { const x = (KG.examples || []).find(v => v.id === e.target.value); e.target.value = ''; if (!x) return;
    // selaimen vahvistusikkunat on estetty artefaktissa, joten edellinen kartta säilytetään palautettavaksi
    if (!prevFile) prevFile = { texts: Object.values(projText()), map: doc.file ? doc.file.maps.indexOf(doc) : 0 };
    doc = openTexts(x.files); store.set('kg.map', '0'); afterDocChange(); status(`Avattu esimerkki: ${x.name}`); $('btnPrev').hidden = false; };
  let prevFile = null;
  $('btnPrev').onclick = () => { if (!prevFile) return; const f = KG.rlml.parseProject(prevFile.texts); doc = f.maps[Math.max(0, Math.min(prevFile.map, f.maps.length - 1))]; prevFile = null; $('btnPrev').hidden = true; afterDocChange(); status('Edellinen kartta palautettu'); };
  $('mapSel').onchange = e => { doc = doc.file.maps[+e.target.value]; store.set('kg.map', e.target.value); afterDocChange(); };
  $('styleSel').onchange = e => { doc.style = e.target.value; doc.styleSet = true; KG.rlml.refreshNames(doc); ed.undo = []; afterDocChange(); status(`Kartan tyyliksi asetettiin ${e.target.selectedOptions[0].textContent}`); };
  $('btnResize').onclick = () => { KG.rlml.resize(doc, +$('inW').value, +$('inH').value); ed.undo = []; afterDocChange(); };
  // kolme tiedostoa peräkkäin (artefaktissa jokainen vahvistetaan erikseen)
  $('btnSave').onclick = async () => { const p = projText(), b = fileName(), list = [[`${b}.rlml.md`, p.map], [`${b}.paper.rlml.md`, p.style], [`${b}.${(doc.file && doc.file.lang) || 'fi'}.rlml.md`, p.lang]].filter(x => x[1]);
    for (const [n, t] of list) { const ok = await download(n, t, 'text/markdown'); if (ok === false) break; } };
  $('btnOpen').onclick = () => $('fileIn').click();
  $('fileIn').onchange = async e => { const fls = [...e.target.files]; e.target.value = ''; if (!fls.length) return;
    try { const texts = await Promise.all(fls.map(f => f.text())); if (!texts.some(t => KG.rlml.kindOfText(t) === 'map')) { status('Valitse mukaan myös karttatiedosto (map …)'); return; }
      doc = openTexts(texts); store.set('kg.map', '0'); ed.undo = []; afterDocChange(); status('Avattu ' + fls.map(f => f.name).join(', ')); } catch (er) { status('Tiedostoa ei voitu lukea: ' + er.message); } };
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
  const setTool = t => { ed.mode = t; ed.band = null; $('toolArea').classList.toggle('on', t === 'area'); $('toolMove').classList.toggle('on', t === 'move'); ed.cv.style.cursor = ed.readOnly ? '' : t === 'area' ? 'cell' : t === 'move' ? 'move' : 'crosshair'; showTool(); ed.draw(); };
  showTool = () => {
    const nm = selArea ? KG.areas.displayName(doc, selArea) : null;
    $('toolInfo').innerHTML = ed.readOnly || ed.mode === 'paint' ? '' :
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
    const A = M.byName[selArea]; if (A && A.bbox) { const sc = ed.cv.parentElement; sc.scrollLeft = A.bbox.x * ed.cw - 20; sc.scrollTop = A.bbox.y * ed.ch - 20; } };
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
  function showSrc() { $('srcTa').value = projText()[$('srcSel').value] || ''; }
  $('srcSel').onchange = showSrc;
  $('btnSrcApply').onclick = () => { try { const p = projText(); p[$('srcSel').value] = $('srcTa').value; const fl = KG.rlml.parseProject([p.map, p.style, p.lang]), i = doc.file ? Math.max(0, doc.file.maps.indexOf(doc)) : 0, d = fl.maps[Math.min(i, fl.maps.length - 1)]; if (!d.W || !d.H) throw new Error('map-rivi puuttuu'); doc = d; afterDocChange(); status('Lähde luettu'); } catch (e) { status('Virhe lähteessä: ' + e.message); } };

  // ---- yläpalkin välilehdet: kukin valitsee sivupaneelin sisällön ja näkyvät osat (CSS: body[data-tab])
  const TAB_TITLES = { read: '', edit: 'Selite', areas: 'Alueet', file: 'Tiedosto', print: 'Tulostus', names: 'Nimet', help: 'Ohje', preview: 'Selite' };
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
    if (t === 'src') t = 'file';
    if (TAB_TITLES[t] === undefined) t = 'file';
    const mobile = matchMedia('(max-width: 820px)').matches;
    if (t === 'preview' && !mobile) t = 'edit';
    // kartta pysyy ruudulla paikallaan, vaikka sivupaneeli ilmestyy viereen tai yläpuolelle
    const sv = $('edScroll'), was = sv.offsetParent ? sv.getBoundingClientRect() : null, wasL = sv.scrollLeft, wasT = sv.scrollTop;
    document.body.dataset.tab = t; store.set('kg.tab', t);
    document.querySelectorAll('#mainTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('sideTitle').textContent = TAB_TITLES[t];
    if (t !== 'areas' && ed.mode !== 'paint') endAreaTool();
    if (t === 'read') setMode(true); else if (t === 'edit' || t === 'areas') setMode(false);
    if (t === 'file') showSrc();
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
    ed.cv.style.marginRight = slack.x + 'px'; ed.cv.style.marginBottom = slack.y + 'px';
    sv.scrollLeft = wantL; sv.scrollTop = wantT;
  }

  function buildMapSel() { const f = doc.file; $('mapSel').innerHTML = (f ? f.maps : [doc]).map((m, i) => `<option value="${i}"${m === doc ? ' selected' : ''}>${(m.title && m.hasHeading ? m.title + ' – ' : '') + m.name}</option>`).join(''); $('styleSel').value = doc.style || 'sea'; }
  function afterDocChange() { ed.undo = []; ed.redo = []; buildMapSel();
    if (!doc.styleSet && (!doc.style || doc.style === 'sea') && doc.legend.some(e => /^(WALL|FLOOR|HULL|DECK|RAIL)\b/i.test(e.spec))) { const w = 'Kartalta puuttuu style paper -rivi: valitse tyyliksi luola tai laiva'; doc.warnings = (doc.warnings || []).filter(x => x !== w).concat(w); } { const n = KG.areas.normalize(doc); if (n) doc.warnings = (doc.warnings || []).concat(`Sisäkkäisiä rajauksia yhdistettiin: ${n}`); } buildLegendPick(); $('inW').value = doc.W; $('inH').value = doc.H; selArea = null; refreshModel(); fillNames(); buildPalette(); buildAreaList(); ed.setDoc(); touched(); if (doc.warnings && doc.warnings.length) status(doc.warnings[0]); }
  afterDocChange(); setTab(store.get('kg.tab') || 'file');
  window.KG_APP = { get doc() { return doc; }, editor: ed, render };
})();
