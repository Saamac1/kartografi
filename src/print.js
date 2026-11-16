// Tulostus: koko kartta yhdelle arkille tai A4-lehdiksi liimausreunoin.
(function () {
  'use strict';
  const KG = globalThis.KG = globalThis.KG || {};
  const R = KG.renderer || (typeof require !== 'undefined' && require('./renderer.js'));
  const font = KG.font || (typeof require !== 'undefined' && require('./font.js'));
  const PAPER = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
  const f = v => (Math.round(v * 100) / 100).toString();

  function paperSize(name, orient) { const [a, b] = PAPER[name] || PAPER.A4; return orient === 'landscape' ? [b, a] : [a, b]; }
  // Ruudun koko (mm), jolla koko kartta mahtuu arkille. orient 'auto' valitsee paremman.
  // W, H ruutuina tai ensimmäisenä parametrina { VW, VH } yksikköinä (renderer.dims)
  function fitCell(W, H, paper, orient, margin) {
    let VW, VH;
    if (typeof W === 'object') { VW = W.VW; VH = W.VH; margin = orient; orient = paper; paper = H; } else { VW = W * R.CS + 2 * R.MG; VH = H * R.CS + 2 * R.MG; }
    const tryO = o => { const [pw, ph] = paperSize(paper, o); return Math.min((pw - 2 * margin) * R.CS / VW, (ph - 2 * margin) * R.CS / VH); };
    if (orient === 'auto') { const p = tryO('portrait'), l = tryO('landscape'); return l >= p ? { cellMM: l, orient: 'landscape' } : { cellMM: p, orient: 'portrait' }; }
    return { cellMM: tryO(orient), orient };
  }
  // Lehtijako: lehdet menevät päällekkäin liimausreunan verran
  function tiles(imgW, imgH, o) {
    const [PW, PH] = paperSize(o.paper || 'A4', o.orient), m = o.margin, ov = o.overlap;
    const aw = PW - 2 * m, ah = PH - 2 * m, sx = aw - ov, sy = ah - ov;
    if (sx <= 0 || sy <= 0) throw new Error('Liimausreuna on suurempi kuin tulostusalue');
    const cols = Math.max(1, Math.ceil((imgW - ov) / sx)), rows = Math.max(1, Math.ceil((imgH - ov) / sy));
    const offX = (cols * sx + ov - imgW) / 2, offY = (rows * sy + ov - imgH) / 2, sheets = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) sheets.push({ c, r, x0: c * sx - offX, y0: r * sy - offY, name: String.fromCharCode(65 + c) + (r + 1) });
    return { PW, PH, m, ov, aw, ah, sx, sy, cols, rows, sheets };
  }
  const T = (s, x, y, size, o) => font.text(s, x, y, size, Object.assign({ w: .2, gap: size * .35 }, o || {}));
  function cross(x, y) { return `<g fill="none"><circle cx="${f(x)}" cy="${f(y)}" r="2.4" stroke="#fff" stroke-width="1.2"/><path d="M${f(x - 4)} ${f(y)}H${f(x + 4)}M${f(x)} ${f(y - 4)}V${f(y + 4)}" stroke="#fff" stroke-width="1.2"/><circle cx="${f(x)}" cy="${f(y)}" r="2.4" stroke="#000" stroke-width=".2"/><path d="M${f(x - 4)} ${f(y)}H${f(x + 4)}M${f(x)} ${f(y - 4)}V${f(y + 4)}" stroke="#000" stroke-width=".2"/></g>`; }

  function sheetSvg(sc, L, s) {
    const { PW, PH, m, ov, aw, ah, cols, rows } = L, id = `pa_${s.c}_${s.r}`;
    const lx = X => X - s.x0 + m, ly = Y => Y - s.y0 + m; // kartan mm-koordinaatti -> arkin koordinaatti
    let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}mm" height="${PH}mm" viewBox="0 0 ${PW} ${PH}" stroke-linecap="round" stroke-linejoin="round">`;
    g += `<defs><clipPath id="${id}"><rect x="${m}" y="${m}" width="${f(aw)}" height="${f(ah)}"/></clipPath></defs><rect width="${PW}" height="${PH}" fill="#fff"/>`;
    g += `<g clip-path="url(#${id})"><g transform="translate(${f(m - s.x0)} ${f(m - s.y0)}) scale(${f(1 / sc.k)})">${R.wrap(sc)}</g>`;
    // liimausalueet oikealla ja alhaalla: katkoviiva alueen rajalle ja kohdistusristit
    let marks = '';
    const fr = [.2, .5, .8];
    if (s.c < cols - 1) { const x = m + aw - ov; marks += `<path d="M${f(x)} ${m}V${f(m + ah)}" stroke="#000" stroke-width=".2" stroke-dasharray="2 2" fill="none"/>`; for (const q of fr) marks += cross(x + ov / 2, m + ah * q); }
    if (s.r < rows - 1) { const y = m + ah - ov; marks += `<path d="M${m} ${f(y)}H${f(m + aw)}" stroke="#000" stroke-width=".2" stroke-dasharray="2 2" fill="none"/>`; for (const q of fr) marks += cross(m + aw * q, y + ov / 2); }
    // naapurin liimausalueen ristit tämän lehden vasempaan ja yläreunaan (samat karttakohdat)
    if (s.c > 0) for (const q of fr) marks += cross(m + ov / 2, m + ah * q);
    if (s.r > 0) for (const q of fr) marks += cross(m + aw * q, m + ov / 2);
    g += marks + '</g>';
    // reunamerkinnät marginaaliin
    let e = `<path d="M${m} ${m - 4}V${m - 1}M${m - 4} ${m}H${m - 1}M${f(m + aw)} ${m - 4}V${m - 1}M${f(m + aw + 1)} ${m}H${f(m + aw + 4)}M${m} ${f(m + ah + 1)}V${f(m + ah + 4)}M${m - 4} ${f(m + ah)}H${m - 1}M${f(m + aw)} ${f(m + ah + 1)}V${f(m + ah + 4)}M${f(m + aw + 1)} ${f(m + ah)}H${f(m + aw + 4)}" stroke="#000" stroke-width=".2" fill="none"/>`;
    const sm = Math.min(2.2, m * .45);
    if (s.c < cols - 1) e += T('LIIMA', m + aw - ov / 2, m - sm - 1, sm) + T('LIIMA', m + aw - ov / 2, m + ah + 1, sm);
    if (s.c > 0) e += T('LEIKKAA', m + 1, m - sm - 1, sm, { align: 'l' });
    if (s.r > 0) e += T('LEIKKAA', m + aw - 1 - font.textPath('LEIKKAA', 0, 0, sm, sm * .35, 'l').w, m - sm - 1, sm, { align: 'l' });
    const label = `LEHTI ${s.name}   SARAKE ${s.c + 1}/${cols}   RIVI ${s.r + 1}/${rows}`;
    e += T(label, PW / 2, PH - m + 1.2, sm);
    // pieni lehtikaavio oikeaan alakulmaan
    const bw = 2.2, bh = 2.2; let ix = PW - m - cols * bw; const iy = PH - m + 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) e += `<rect x="${f(ix + c * bw)}" y="${f(iy + r * bh * .55)}" width="${f(bw)}" height="${f(bh * .55)}" fill="${c === s.c && r === s.r ? '#000' : '#fff'}" stroke="#000" stroke-width=".15"/>`;
    return g + e + '</svg>';
  }
  function wholeSvg(sc, paper, orient, margin) {
    const [PW, PH] = paperSize(paper, orient), iw = sc.VW / sc.k, ih = sc.VH / sc.k, x = (PW - iw) / 2, y = (PH - ih) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}mm" height="${PH}mm" viewBox="0 0 ${PW} ${PH}" stroke-linecap="round" stroke-linejoin="round"><rect width="${PW}" height="${PH}" fill="#fff"/><g transform="translate(${f(x)} ${f(y)}) scale(${f(1 / sc.k)})">${R.wrap(sc)}</g></svg>`;
  }
  function printHtml(svgs, PW, PH, title) {
    return `<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8"><title>${title || 'Kartta'}</title><style>@page{size:${PW}mm ${PH}mm;margin:0}html,body{margin:0;padding:0;background:#fff}.sheet{width:${PW}mm;height:${PH}mm;overflow:hidden;page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto;break-after:auto}.sheet svg{display:block}@media screen{body{background:#888}.sheet{margin:8mm auto;box-shadow:0 0 4mm rgba(0,0,0,.4);background:#fff}}</style></head><body>${svgs.map(s => `<div class="sheet">${s}</div>`).join('\n')}</body></html>`;
  }
  const api = { PAPER, paperSize, fitCell, tiles, sheetSvg, wholeSvg, printHtml };
  KG.print = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
