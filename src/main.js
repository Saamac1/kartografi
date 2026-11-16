// Käyttöliittymän kytkennät: editori, esikatselu, tulostus, tiedostot.
(function () {
  'use strict';
  const KG = globalThis.KG, $ = id => document.getElementById(id);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ei tallennusta */ } } };
  let doc = null;
  const saved = store.get('kg.doc');
  try { doc = saved ? KG.rlml.parse(saved) : null; } catch (e) { doc = null; }
  if (!doc || !doc.W) doc = KG.generator.generate({ W: 64, H: 44, seed: 7 });

  // ---- tila ja apurit
  let statusT = 0;
  function status(msg) { $('status').textContent = msg; clearTimeout(statusT); statusT = setTimeout(() => { $('status').textContent = ''; }, 4000); }
  function download(name, text, mime) {
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); status('Ladattu ' + name); }
    catch (e) { status('Lataus estetty tässä ympäristössä – käytä Kopioi-painiketta'); }
  }
  const fileBase = () => (doc.name || 'kartta').toLowerCase();

  // ---- alueet
  let M = KG.areas.model(doc), selArea = null;
  const refreshModel = () => { M = KG.areas.model(doc); };

  // ---- editori ja paletti
  const ed = new KG.Editor($('ed'), {
    getDoc: () => doc,
    changed: () => { touched(); },
    pick: ch => setBrush(ch),
    getModel: () => M, selectedArea: () => selArea, showAreas: () => $('showAreas').checked,
    addRect: r => { if (!selArea) { status('Valitse tai luo alue ensin'); return; } doc.areas.push(Object.assign(r, { name: selArea })); areaChanged(); },
    removeRectAt: p => { for (let i = doc.areas.length - 1; i >= 0; i--) { const a = doc.areas[i]; if ((!selArea || a.name === selArea) && p.x >= a.x && p.y >= a.y && p.x < a.x + a.w && p.y < a.y + a.h) { doc.areas.splice(i, 1); areaChanged(); status(`Suorakulmio poistettu alueesta ${a.name}`); return; } } },
    status,
    onCursor: (c, k) => { const e = doc.legend.find(l => l.ch === k), path = M.at(c.x, c.y).map(n => KG.areas.displayName(doc, n)).join(' › '); $('cursorInfo').textContent = `x ${c.x}, y ${c.y}   "${k}" ${e ? e.name : 'tuntematon merkki'}   ${path ? '▸ ' + path : ''}`; },
  });
  function buildPalette() {
    const p = $('palette'); p.innerHTML = '';
    for (const e of doc.legend) {
      const b = document.createElement('button'); b.className = 'pal' + (e.ch === ed.brush ? ' on' : ''); b.dataset.ch = e.ch;
      b.innerHTML = `<span class="ch" style="background:${KG.EDITOR_COLORS[KG.rlml.typeOf(e.spec)] || '#fff'}">${e.ch.replace('<', '&lt;')}</span><span>${e.name}</span>`;
      b.title = e.spec; b.onclick = () => { setBrush(e.ch); ed.cv.focus(); };
      p.appendChild(b);
    }
  }
  function setBrush(ch) { ed.brush = ch; document.querySelectorAll('.pal').forEach(b => b.classList.toggle('on', b.dataset.ch === ch)); ed.draw(); }
  $('brush').onchange = e => { ed.brushSize = +e.target.value; };
  ed.brush = '.';

  // ---- asetukset
  const num = id => parseFloat($(id).value);
  function settings() {
    const mode = document.querySelector('input[name=mode]:checked').value, margin = num('margin');
    const base = { wMain: num('wMain'), wCoast: num('wCoast'), wThin: num('wThin'), wSea: num('wSea'), spSea: num('spSea'), spSym: num('spSym'), legend: $('optLegend').checked, compass: $('optCompass').checked, title: $('optTitle').checked, frame: $('optFrame').checked };
    if (mode === 'whole') { const fit = KG.print.fitCell(doc.W, doc.H, $('paper').value, $('orientW').value, margin); return Object.assign(base, { mode, margin, cellMM: fit.cellMM, paper: $('paper').value, orient: fit.orient }); }
    return Object.assign(base, { mode, margin, cellMM: num('cellMM'), overlap: num('overlap'), orientT: $('orientT').value });
  }
  function layoutTiles(sc, s) {
    const iw = sc.VW / sc.k, ih = sc.VH / sc.k, mk = o => KG.print.tiles(iw, ih, { paper: 'A4', orient: o, margin: s.margin, overlap: s.overlap });
    if (s.orientT !== 'auto') return mk(s.orientT);
    const a = mk('portrait'), b = mk('landscape'); return b.sheets.length < a.sheets.length ? b : a;
  }

  // ---- piirto ja esikatselu
  let renderT = 0, last = null, zoom = 1, popup = null;
  function touched() { refreshModel(); showChecks(); store.set('kg.doc', KG.rlml.serialize(doc)); scheduleRender(); if ($('tSrc').classList.contains('on')) $('srcTa').value = KG.rlml.serialize(doc); }
  function scheduleRender() { clearTimeout(renderT); $('renderInfo').textContent = 'piirretään…'; renderT = setTimeout(render, 280); }
  function render() {
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
    else { $('pv').innerHTML = svg; sizeSvg($('pv')); }
  }
  function sizeSvg(host) { const el = host.querySelector('svg'); if (!el) return; el.removeAttribute('width'); el.removeAttribute('height'); el.style.width = (zoom * 100) + '%'; }
  $('zIn').onclick = () => { zoom = Math.min(8, zoom * 1.4); sizeSvg($('pv')); };
  $('zOut').onclick = () => { zoom = Math.max(.25, zoom / 1.4); sizeSvg($('pv')); };
  $('zFit').onclick = () => { zoom = 1; sizeSvg($('pv')); };
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
    if (!last) return; const { svgs, PW, PH } = printSvgs(), html = KG.print.printHtml(svgs, PW, PH, doc.title);
    const host = $('printFrameHost'); host.innerHTML = ''; const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { status('Tulostus estetty – lataa tulostussivu ja tulosta se'); } };
    host.hidden = false; host.appendChild(fr); fr.srcdoc = html;
  };
  $('btnDlSvg').onclick = () => { if (!last) return; const s = last.s; download(`${fileBase()}.svg`, s.mode === 'whole' ? KG.print.wholeSvg(last.sc, s.paper, s.orient, s.margin) : KG.renderer.svgWhole(last.sc, doc.title), 'image/svg+xml'); };
  $('btnDlHtml').onclick = () => { if (!last) return; const { svgs, PW, PH } = printSvgs(); download(`${fileBase()}_tulostus.html`, KG.print.printHtml(svgs, PW, PH, doc.title), 'text/html'); };
  $('btnCopy').onclick = async () => { if (!last) return; try { await navigator.clipboard.writeText(KG.renderer.svgWhole(last.sc, doc.title)); status('SVG kopioitu leikepöydälle'); } catch (e) { status('Kopiointi estetty'); } };
  document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => { const t = document.querySelector('input[name=mode]:checked').value === 'tiles'; $('fsTiles').disabled = !t; $('fsWhole').disabled = t; render(); });
  ['paper', 'orientW', 'cellMM', 'orientT', 'overlap', 'margin', 'wMain', 'wCoast', 'wThin', 'wSea', 'spSea', 'spSym', 'optLegend', 'optCompass', 'optTitle', 'optFrame'].forEach(id => $(id).addEventListener('change', scheduleRender));

  // ---- tiedostot, generointi, koko
  $('btnGen').onclick = () => { const W = +$('inW').value, H = +$('inH').value; const keepTitle = doc.title; doc = KG.generator.generate({ W, H, seed: +$('inSeed').value }); if (keepTitle) doc.title = keepTitle; afterDocChange(); status('Generoitu siemenellä ' + $('inSeed').value); };
  $('btnRnd').onclick = () => { $('inSeed').value = Math.floor(Math.random() * 99999) + 1; $('btnGen').onclick(); };
  $('btnNew').onclick = () => { const t = doc.title; doc = KG.rlml.blankDoc(+$('inW').value, +$('inH').value); doc.title = t; ed.undo = []; afterDocChange(); };
  $('btnResize').onclick = () => { KG.rlml.resize(doc, +$('inW').value, +$('inH').value); ed.undo = []; afterDocChange(); };
  $('btnSave').onclick = () => download(`${fileBase()}.rlml.md`, KG.rlml.serialize(doc), 'text/markdown');
  $('btnOpen').onclick = () => $('fileIn').click();
  $('fileIn').onchange = e => { const fl = e.target.files[0]; if (!fl) return; const rd = new FileReader(); rd.onload = () => { try { doc = KG.rlml.parse(rd.result); ed.undo = []; afterDocChange(); status('Avattu ' + fl.name); } catch (er) { status('Tiedostoa ei voitu lukea: ' + er.message); } }; rd.readAsText(fl); e.target.value = ''; };
  $('btnUndo').onclick = () => ed.doUndo(); $('btnRedo').onclick = () => ed.doRedo();

  // ---- alueet: lista, työkalu, tarkistukset
  function areaChanged() { refreshModel(); buildAreaList(); ed.draw(); touched(); }
  function buildAreaList() {
    const L = $('areaList'), names = M.tree.slice(); if (selArea && !names.includes(selArea)) names.push(selArea);
    L.innerHTML = names.map(n => { const A = M.byName[n], lv = A ? A.level : 0, cnt = A ? A.rects.length : 0;
      return `<option value="${n}"${n === selArea ? ' selected' : ''}>${'   '.repeat(lv)}${KG.areas.displayName(doc, n)}  (${n}${cnt ? ', ' + cnt + ' ▭' : ', ei vielä suorakulmioita'})</option>`; }).join('');
  }
  function showChecks() { const v = KG.areas.validate(doc, M).concat((doc.warnings || []).map(m => ({ level: 'info', msg: m })));
    $('checks').innerHTML = v.slice(0, 10).map(x => `<div class="${x.level}">${x.level === 'error' ? '✖' : x.level === 'warn' ? '⚠' : 'ℹ'} ${x.msg.replace(/</g, '&lt;')}</div>`).join('') + (v.length > 10 ? `<div class="info">… ${v.length - 10} lisää</div>` : ''); }
  $('areaList').onchange = e => { selArea = e.target.value; ed.draw(); };
  const setTool = t => { ed.mode = t; $('toolPaint').classList.toggle('on', t === 'paint'); $('toolArea').classList.toggle('on', t === 'area'); ed.cv.style.cursor = t === 'area' ? 'cell' : 'crosshair'; ed.draw(); };
  $('toolPaint').onclick = () => setTool('paint');
  $('toolArea').onclick = () => { setTool('area'); if (!selArea) status('Valitse alue listasta tai luo uusi'); };
  $('showAreas').onchange = () => ed.draw();
  $('btnNewArea').onclick = () => { const t = $('newArea').value.trim(); if (!t) { status('Kirjoita alueen nimi'); return; }
    let id = KG.rlml.toId(t), n = 2; const base = id; while (M.byName[id] || (doc.texts[id] && doc.texts[id] !== t)) id = base + '_' + n++;
    doc.texts[id] = t; selArea = id; $('newArea').value = ''; setTool('area'); buildAreaList(); touched(); status(`Raahaa alueen ${t} suorakulmio kartalle`); };
  $('newArea').onkeydown = e => { if (e.key === 'Enter') $('btnNewArea').onclick(); };
  $('btnDelArea').onclick = () => { if (!selArea) return; const n = selArea; doc.areas = doc.areas.filter(a => a.name !== n); delete doc.texts[n]; doc.rules = doc.rules.filter(r => r.name !== n); selArea = null; areaChanged(); status(`Alue ${n} poistettu`); };

  // ---- nimet ja lähde
  $('inTitle').oninput = e => { doc.title = e.target.value; touched(); };
  $('btnNamesApply').onclick = () => { doc.rules = KG.rlml.parseRulesText($('rulesTa').value); doc.texts = KG.rlml.parseTextsText($('textsTa').value); areaChanged(); status('Nimet päivitetty'); };
  const fillNames = () => { $('inTitle').value = doc.title || ''; $('rulesTa').value = KG.rlml.rulesText(doc); $('textsTa').value = KG.rlml.textsText(doc); $('langLbl').textContent = doc.lang || 'fi'; };
  $('btnSrcApply').onclick = () => { try { const d = KG.rlml.parse($('srcTa').value); if (!d.W || !d.H) throw new Error('map-rivi puuttuu'); doc = d; afterDocChange(); status('Lähde luettu'); } catch (e) { status('Virhe lähteessä: ' + e.message); } };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === b.dataset.tab));
    if (b.dataset.tab === 'tSrc') $('srcTa').value = KG.rlml.serialize(doc);
    if (b.dataset.tab === 'tNames') fillNames();
  });

  function afterDocChange() { ed.undo = []; ed.redo = []; $('inW').value = doc.W; $('inH').value = doc.H; selArea = null; refreshModel(); fillNames(); buildPalette(); buildAreaList(); ed.setDoc(); touched(); if (doc.warnings && doc.warnings.length) status(doc.warnings[0]); }
  afterDocChange(); render();
  window.KG_APP = { get doc() { return doc; }, editor: ed, render };
})();
