// Käyttöliittymätestit oikeassa selaimessa (Puppeteer, headless Chrome): npm run test:ui
// Kuvakaappaukset: UI_SHOTS=kansio npm run test:ui
import test, { before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOTS = process.env.UI_SHOTS;
const wait = ms => new Promise(r => setTimeout(r, ms));
let browser;

before(async () => { browser = await puppeteer.launch({ headless: 'shell' }); });
after(async () => { await browser?.close(); });

// jokainen testi omassa kontekstissaan, jotta selaimen muisti (localStorage) on tyhjä
async function open(width, height) {
  const ctx = await browser.createBrowserContext(), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width, height });
  await page.goto(URL); await wait(700);
  return { page, errors, close: () => ctx.close() };
}
const tab = async (page, t) => { await page.click(`#mainTabs button[data-tab=${t}]`); await wait(350); };
const shot = (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, name + '.png') });
const visible = (page, sel) => page.$eval(sel, el => !!(el.offsetWidth || el.offsetHeight));

test('välilehdet näyttävät oikean paneelin ja piilottavat editorin asetuksissa', async () => {
  const { page, errors, close } = await open(1440, 860);
  // välilehti: [editori, esikatselu]
  const expect = { file: [false, false], read: [true, true], edit: [true, true], areas: [true, true], names: [false, true], print: [false, true], help: [false, false] };
  for (const [t, [editor, preview]] of Object.entries(expect)) {
    await tab(page, t);
    if (t !== 'read') assert.ok(await visible(page, `.panel[data-for=${t}]`), `${t}: paneeli näkyy`);
    const others = await page.$$eval(`.panel:not([data-for=${t}])`, els => els.filter(e => e.offsetHeight).length);
    assert.equal(others, 0, `${t}: muut paneelit piilossa`);
    assert.equal(await visible(page, '.editor'), editor, `${t}: editori ${editor ? 'näkyy' : 'piilossa'}`);
    assert.equal(await visible(page, '#previewPane'), preview, `${t}: esikatselu ${preview ? 'näkyy' : 'piilossa'}`);
    await shot(page, 'tyopoyta-' + t);
  }
  assert.ok(!(await visible(page, '#mainTabs button[data-tab=preview]')), 'Esikatselu-välilehti vain mobiilissa');
  assert.deepEqual(errors, []);
  await close();
});

test('mobiilissa kartta ja esikatselu ovat eri välilehdillä eikä sivu levene', async () => {
  const { page, errors, close } = await open(390, 800);
  for (const t of ['file', 'read', 'edit', 'preview', 'areas', 'names', 'print', 'help']) {
    await tab(page, t);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 390, `${t}: sivun leveys ${w} px`);
    await shot(page, 'mobiili-' + t);
  }
  await tab(page, 'edit');
  assert.ok(await visible(page, '.editor')); assert.ok(!(await visible(page, '#previewPane')));
  await tab(page, 'preview');
  assert.ok(!(await visible(page, '.editor'))); assert.ok(await visible(page, '#previewPane'));
  assert.deepEqual(errors, []);
  await close();
});

test('zoomattu esikatselu seuraa editorin kursoria', async () => {
  const { page, errors, close } = await open(1440, 860);
  await tab(page, 'edit');
  await page.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById('zIn').click(); });
  for (const [x, y] of [[50, 35], [3, 3], [60, 10]]) {
    await page.evaluate((x, y) => { const ed = KG_APP.editor; ed.cur = { x, y }; ed.draw(); }, x, y);
    await wait(100);
    const r = await page.evaluate(() => { const m = document.getElementById('pvCur').getBoundingClientRect(), v = document.getElementById('pvScroll').getBoundingClientRect(); return { m: [m.left, m.top, m.right, m.bottom], v: [v.left, v.top, v.right, v.bottom] }; });
    assert.ok(r.m[0] >= r.v[0] && r.m[2] <= r.v[2] && r.m[1] >= r.v[1] && r.m[3] <= r.v[3], `kursori ${x},${y} näkyy esikatselussa: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(errors, []);
  await close();
});

test('sivupaneelin voi irrottaa kelluvaksi ja raahata Kartan muokkaus- ja Alueet-välilehdillä', async () => {
  const { page, errors, close } = await open(1440, 860);
  await tab(page, 'edit');
  await page.click('#btnFloat'); await wait(200);
  const pos = () => page.$eval('#palPanel', el => ({ p: getComputedStyle(el).position, x: el.getBoundingClientRect().left, y: el.getBoundingClientRect().top }));
  const a = await pos(); assert.equal(a.p, 'fixed');
  const hb = await (await page.$('#sideTitle')).boundingBox();
  await page.mouse.move(hb.x + 5, hb.y + 5); await page.mouse.down(); await page.mouse.move(hb.x + 305, hb.y + 155, { steps: 6 }); await page.mouse.up();
  const b = await pos(); assert.ok(Math.abs(b.x - a.x - 300) < 3 && Math.abs(b.y - a.y - 150) < 3, `paneeli siirtyi: ${JSON.stringify([a, b])}`);
  await tab(page, 'areas'); assert.equal((await pos()).p, 'fixed');
  await tab(page, 'print'); assert.equal((await pos()).p, 'static');
  assert.ok(!(await visible(page, '#btnFloat')));
  assert.deepEqual(errors, []);
  await close();
});

test('alueen rajaus loppuu, kun Alueet-välilehdeltä vaihdetaan pois', async () => {
  const { page, close } = await open(1440, 860);
  await tab(page, 'areas'); await page.click('#toolArea');
  assert.equal(await page.evaluate(() => KG_APP.editor.mode), 'area');
  await tab(page, 'edit');
  assert.equal(await page.evaluate(() => KG_APP.editor.mode), 'paint');
  await close();
});

test('Kartan luku ja Kartan muokkaus ovat välilehtiä, jotka vaihtavat editorin tilan', async () => {
  const { page, errors, close } = await open(1440, 860);
  await tab(page, 'read');
  assert.equal(await page.evaluate(() => KG_APP.editor.readOnly), true);
  assert.ok(!(await visible(page, '.palette')), 'lukutilassa ei sivupaneelia');
  assert.ok(await visible(page, '.editor')); assert.ok(await visible(page, '#previewPane'));
  // lukutilassa napsautus ei muuta karttaa
  const before = await page.evaluate(() => KG_APP.doc.grid.join(''));
  const r = await (await page.$('#ed')).boundingBox(); await page.mouse.click(r.x + 40, r.y + 40);
  assert.equal(await page.evaluate(() => KG_APP.doc.grid.join('')), before);
  await tab(page, 'edit');
  assert.equal(await page.evaluate(() => KG_APP.editor.readOnly), false);
  assert.ok(await visible(page, '.palette'));
  assert.equal(await page.$('#mRead'), null, 'editorin vanha tilapalkki on poistettu');
  assert.deepEqual(errors, []);
  await close();
});

test('valittu pala näkyy selitepalkin yläreunassa myös kelluvana', async () => {
  const { page, errors, close } = await open(1440, 860);
  await tab(page, 'edit');
  await page.click('#palette .pal[data-ch="T"]');
  assert.equal(await page.$eval('#brushCh', el => el.textContent), 'T');
  assert.equal(await page.$eval('#brushName', el => el.textContent), 'havumetsä');
  await page.click('#btnFloat'); await wait(200);
  const inside = await page.evaluate(() => { const p = document.getElementById('palPanel').getBoundingClientRect(), b = document.querySelector('.brushbox').getBoundingClientRect(); return b.top >= p.top && b.bottom <= p.bottom && b.width > 0; });
  assert.ok(inside, 'sivellinruutu on kelluvassa palkissa');
  await page.select('#brush', '3');
  assert.equal(await page.evaluate(() => KG_APP.editor.brushSize), 3);
  await shot(page, 'kelluva-sivellin');
  assert.deepEqual(errors, []);
  await close();
});

test('Ohje-välilehti näyttää ohjeen koko leveydellä', async () => {
  const { page, close } = await open(1440, 860);
  await tab(page, 'help');
  const w = await page.$eval('.panel[data-for=help]', el => el.getBoundingClientRect().width);
  assert.ok(w > 400, `ohjeen leveys ${w}`);
  const text = await page.$eval('.panel[data-for=help]', el => el.textContent);
  for (const k of ['Kartan luku', 'Kartan muokkaus', 'Alueet', 'Näppäimistö']) assert.ok(text.includes(k), k);
  await close();
});

test('välilehdet ovat sovitussa järjestyksessä', async () => {
  const { page, close } = await open(1440, 860);
  const names = await page.$$eval('#mainTabs button', bs => bs.filter(b => b.offsetWidth).map(b => b.textContent));
  assert.deepEqual(names, ['Tiedosto', 'Kartan luku', 'Kartan muokkaus', 'Alueet', 'Nimet', 'Tulostus', 'Ohje']);
  await close();
});

test('ensimmäinen avaus näyttää Tiedosto-välilehden ja siellä lähdekoodin', async () => {
  const { page, errors, close } = await open(1440, 860);
  assert.equal(await page.evaluate(() => document.body.dataset.tab), 'file');
  assert.ok(await visible(page, '#srcTa'));
  assert.match(await page.$eval('#srcTa', el => el.value), /^# .+\n[\s\S]*map \S+ size \d+x\d+/);
  const [f, src] = await page.evaluate(() => ['.filepanel', '#tSrc'].map(s => document.querySelector(s).getBoundingClientRect()).map(r => [r.left, r.width]));
  assert.ok(src[0] > f[0] + f[1] - 1 && src[1] > 500, `lähdekoodi tiedostotoimintojen vieressä: ${JSON.stringify([f, src])}`);
  await shot(page, 'tiedosto');
  assert.deepEqual(errors, []);
  await close();
});

test('esikatselun voi piilottaa erikseen luku-, muokkaus- ja aluetiloissa', async () => {
  const { page, errors, close } = await open(1440, 860);
  const pv = () => visible(page, '#previewPane'), edW = () => page.$eval('.editor', el => el.getBoundingClientRect().width);
  await tab(page, 'edit');
  const w0 = await edW();
  await page.click('#pvToggle'); await wait(150);
  assert.equal(await pv(), false, 'muokkaus: esikatselu piilossa');
  assert.ok(await edW() > w0 + 300, 'kartta saa esikatselun tilan');
  await tab(page, 'read'); assert.equal(await pv(), true, 'luku: oma valinta, näkyy');
  assert.equal(await page.$eval('#pvToggle', el => el.checked), true);
  await tab(page, 'areas'); assert.equal(await pv(), true, 'alueet: oma valinta, näkyy');
  await page.click('#pvToggle'); await wait(150); assert.equal(await pv(), false, 'alueet: piilossa');
  await tab(page, 'print'); assert.equal(await pv(), true, 'tulostuksessa esikatselu näkyy aina');
  await tab(page, 'edit'); assert.equal(await pv(), false, 'muokkauksen valinta säilyy');
  // valinta muistetaan uudelleenlatauksen yli
  await page.reload(); await wait(700);
  assert.equal(await page.evaluate(() => document.body.dataset.tab), 'edit');
  assert.equal(await pv(), false);
  await page.click('#pvToggle'); await wait(400); assert.equal(await pv(), true);
  assert.ok(await page.$eval('#pv svg', el => el.getBoundingClientRect().width > 100), 'esikatselu piirretään, kun se tulee näkyviin');
  assert.deepEqual(errors, []);
  await close();
});

test('zoom-painikkeet ovat leveällä esikatselun alalaidassa', async () => {
  const { page, close } = await open(1440, 860);
  await tab(page, 'edit');
  const [bar, scroll] = await page.evaluate(() => ['.pvbar', '#pvScroll'].map(s => document.querySelector(s).getBoundingClientRect()).map(r => [r.top, r.bottom]));
  assert.ok(bar[0] >= scroll[1] - 1, `palkki esikatselun alla: ${JSON.stringify([bar, scroll])}`);
  assert.ok(await page.$eval('.pvbar', el => el.contains(document.getElementById('zIn')) && el.contains(document.getElementById('zFit'))));
  await close();
});

test('kartta pysyy ruudulla paikallaan siirryttäessä Kartan luvusta Kartan muokkaukseen', async () => {
  for (const [w, h] of [[1440, 860], [390, 800]]) {
    const { page, errors, close } = await open(w, h);
    await tab(page, 'read');
    await page.evaluate(() => { const s = document.getElementById('edScroll'); s.scrollLeft = 400; s.scrollTop = 300; });
    const at = () => page.$eval('#ed', el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
    const a = await at();
    await tab(page, 'edit');
    assert.deepEqual(await at(), a, `${w}px: kartta ei siirry ruudulla`);
    // palan valinta ei vieritä karttaa
    if (w <= 800) { await page.click('#brushBox .bname'); await wait(100); }
    await page.click('#palette .pal[data-ch="T"]');
    await wait(100);
    assert.deepEqual(await at(), a, `${w}px: palan valinta ei siirrä karttaa`);
    await tab(page, 'read');
    assert.deepEqual(await at(), a, `${w}px: takaisin lukuun`);
    assert.deepEqual(errors, []);
    await close();
  }
});

test('mobiilissa palat valitaan avattavasta listasta, jossa on värilliset tiilet', async () => {
  const { page, errors, close } = await open(390, 800);
  await tab(page, 'edit');
  assert.ok(!(await visible(page, '#palList')), 'lista on aluksi kiinni');
  const panelH = await page.$eval('.palette', el => el.getBoundingClientRect().height);
  assert.ok(panelH < 80, `selitepalkki on matala (${panelH} px)`);
  const edTop = await page.$eval('#ed', el => el.getBoundingClientRect().top);
  await page.click('#brushBox .bname'); await wait(150);
  assert.ok(await visible(page, '#palList'), 'napautus avaa listan');
  assert.equal(await page.$eval('#ed', el => el.getBoundingClientRect().top), edTop, 'lista aukeaa kartan päälle eikä siirrä karttaa');
  // listan rivit näyttävät samalta kuin selitepalkissa: värillinen tiili ja nimi
  const rows = await page.$$eval('#palette .pal', bs => bs.map(b => { const c = b.querySelector('.ch'); return [c.textContent, getComputedStyle(c).backgroundColor, b.getBoundingClientRect().width]; }));
  assert.ok(rows.length >= 10);
  assert.ok(new Set(rows.map(r => r[1])).size >= 8, 'tiilillä on eri värit');
  assert.ok(rows.every(r => r[2] > 300), 'rivit koko leveydeltä');
  await shot(page, 'mobiili-tiililista');
  await page.click('#palette .pal[data-ch="T"]'); await wait(100);
  assert.equal(await page.evaluate(() => KG_APP.editor.brush), 'T');
  assert.equal(await page.$eval('#brushCh', el => el.textContent), 'T');
  assert.ok(!(await visible(page, '#palList')), 'valinta sulkee listan');
  // napautus kartalle sulkee avoimen listan valitsematta mitään
  await page.click('#brushBox .bname'); await wait(100);
  await page.mouse.click(200, 700); await wait(100);
  assert.ok(!(await visible(page, '#palList')), 'napautus muualle sulkee listan');
  // esimerkki, jonka legendasta puuttuu uusia paloja: lisäys listan lopusta
  await tab(page, 'file'); await page.select('#exSel', 'meri'); await wait(500); await tab(page, 'edit');
  await page.click('#brushBox .bname'); await wait(100);
  const add = await page.$$('#palAdd .pal.add');
  assert.ok(add.length > 0, 'puuttuvat palat ovat listan lopussa');
  const n0 = await page.evaluate(() => KG_APP.doc.legend.length);
  await add[0].click(); await wait(200);
  assert.equal(await page.evaluate(() => KG_APP.doc.legend.length), n0 + 1, 'pala lisättiin legendaan');
  assert.equal(await page.$eval('#brushCh', el => el.textContent), await page.evaluate(() => KG_APP.editor.brush), 'lisätty pala on valittuna');
  assert.ok(!(await visible(page, '#palList')));
  assert.deepEqual(errors, []);
  await close();
});

test('työpöydällä palat ovat painikkeina eikä pudotusvalikkoa näytetä', async () => {
  const { page, close } = await open(1440, 860);
  await tab(page, 'edit');
  assert.ok(await visible(page, '#palette')); assert.ok(!(await visible(page, '#brushBox .bopen')));
  await page.click('#brushBox .bname'); await wait(100);
  assert.ok(await visible(page, '#palette'), 'sivellinruudun napsautus ei piilota työpöydän listaa');
  await close();
});

test('kapealla zoom-painikkeet ovat esikatselun yläreunassa', async () => {
  const { page, close } = await open(390, 800);
  await tab(page, 'preview');
  const [bar, scroll] = await page.evaluate(() => ['.pvbar', '#pvScroll'].map(s => document.querySelector(s).getBoundingClientRect()).map(r => [r.top, r.bottom]));
  assert.ok(bar[1] <= scroll[0] + 1, `palkki esikatselun yläpuolella: ${JSON.stringify([bar, scroll])}`);
  await close();
});

test('Alueet-välilehdellä maastoa ei piirretä; napsautus valitsee alueen ja kartta vierii vetämällä', async () => {
  for (const [w, h] of [[1440, 860], [390, 800]]) {
    const { page, errors, close } = await open(w, h);
    await tab(page, 'areas');
    const grid = () => page.evaluate(() => KG_APP.doc.grid.join('\n'));
    const g0 = await grid();
    // napsautus ja veto kartalla eivät muuta ruutuja
    const r = await (await page.$('#ed')).boundingBox();
    await page.mouse.click(r.x + 60, r.y + 60);
    await page.mouse.move(r.x + 200, r.y + 200); await page.mouse.down(); await page.mouse.move(r.x + 120, r.y + 140, { steps: 5 }); await page.mouse.up();
    // kirjoitus ei piirrä
    await page.focus('#ed'); await page.keyboard.type('TTT');
    assert.equal(await grid(), g0, `${w}px: kartta ei muuttunut`);
    assert.equal(await page.$eval('#ed', el => getComputedStyle(el).cursor === 'crosshair'), false, 'ei piirtokursoria');
    // napsautus alueen kohdalla valitsee alueen
    const cell = await page.evaluate(() => { const A = Object.values(KG.areas.model(KG_APP.doc).byName).find(a => a.size); const c = [...A.cells][0], W = KG_APP.doc.W; return { x: c % W, y: Math.floor(c / W) }; });
    await page.evaluate(({ x, y }) => { const s = document.getElementById('edScroll'), ed = KG_APP.editor; s.scrollLeft = Math.max(0, x * ed.cw - 20); s.scrollTop = Math.max(0, y * ed.ch - 20); }, cell);
    const pos = await page.evaluate(({ x, y }) => { const r = document.getElementById('ed').getBoundingClientRect(), ed = KG_APP.editor; return [r.left + (x + .5) * ed.cw, r.top + (y + .5) * ed.ch]; }, cell);
    await page.mouse.click(pos[0], pos[1]); await wait(100);
    assert.ok(await page.$eval('#areaList', el => !!el.value), `${w}px: alue valittiin napsautuksella`);
    // Rajaa toimii edelleen, ja Kartan muokkauksessa piirto toimii
    await page.click('#toolArea'); assert.equal(await page.evaluate(() => KG_APP.editor.mode), 'area');
    await tab(page, 'edit');
    await page.mouse.click(r.x + 30, r.y + 30);
    if (w > 800) assert.notEqual(await grid(), g0, 'muokkauksessa piirto toimii');
    assert.deepEqual(errors, []);
    await close();
  }
});
