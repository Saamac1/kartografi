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
  const expect = { map: true, areas: true, file: true, print: false, names: false, src: false };
  for (const [t, editor] of Object.entries(expect)) {
    await tab(page, t);
    assert.ok(await visible(page, `.panel[data-for=${t}]`), `${t}: paneeli näkyy`);
    const others = await page.$$eval(`.panel:not([data-for=${t}])`, els => els.filter(e => e.offsetHeight).length);
    assert.equal(others, 0, `${t}: muut paneelit piilossa`);
    assert.equal(await visible(page, '.editor'), editor, `${t}: editori ${editor ? 'näkyy' : 'piilossa'}`);
    assert.ok(await visible(page, '#previewPane'), `${t}: esikatselu näkyy`);
    await shot(page, 'tyopoyta-' + t);
  }
  assert.ok(!(await visible(page, '#mainTabs button[data-tab=preview]')), 'Esikatselu-välilehti vain mobiilissa');
  assert.deepEqual(errors, []);
  await close();
});

test('mobiilissa kartta ja esikatselu ovat eri välilehdillä eikä sivu levene', async () => {
  const { page, errors, close } = await open(390, 800);
  for (const t of ['map', 'areas', 'preview', 'file', 'print', 'names', 'src']) {
    await tab(page, t);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 390, `${t}: sivun leveys ${w} px`);
    await shot(page, 'mobiili-' + t);
  }
  await tab(page, 'map');
  assert.ok(await visible(page, '.editor')); assert.ok(!(await visible(page, '#previewPane')));
  await tab(page, 'preview');
  assert.ok(!(await visible(page, '.editor'))); assert.ok(await visible(page, '#previewPane'));
  assert.deepEqual(errors, []);
  await close();
});

test('zoomattu esikatselu seuraa editorin kursoria', async () => {
  const { page, errors, close } = await open(1440, 860);
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

test('sivupaneelin voi irrottaa kelluvaksi ja raahata Kartta- ja Alueet-välilehdillä', async () => {
  const { page, errors, close } = await open(1440, 860);
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
  await tab(page, 'map');
  assert.equal(await page.evaluate(() => KG_APP.editor.mode), 'paint');
  await close();
});
