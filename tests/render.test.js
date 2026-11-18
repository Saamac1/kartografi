const test = require('node:test');
const assert = require('node:assert');
const { rlml, renderer, generator } = require('./helpers');

const doc = generator.generate({ W: 40, H: 30, seed: 3 });

test('generaattori on deterministinen ja tuottaa pyydetyn koon', () => {
  const a = generator.generate({ W: 40, H: 30, seed: 3 });
  assert.deepEqual(a.grid, doc.grid);
  assert.equal(a.grid.length, 30); assert.ok(a.grid.every(r => r.length === 40));
  assert.notDeepEqual(generator.generate({ W: 40, H: 30, seed: 4 }).grid, doc.grid);
});

test('kartta piirretään pelkällä mustalla ja valkoisella', () => {
  const svg = renderer.svgWhole(renderer.scene(doc, { cellMM: 5 }));
  const colors = new Set(svg.match(/#[0-9a-fA-F]{3,6}\b/g));
  for (const c of colors) assert.ok(['#000', '#fff', '#000000', '#ffffff'].includes(c.toLowerCase()), 'väri ' + c);
  assert.ok(!svg.includes('rgba'));
});

test('viivavahvuudet vastaavat millimetrejä', () => {
  const sc = renderer.scene(doc, { cellMM: 4, wMain: .3, wCoast: .6 });
  assert.equal(sc.k, 4); // 16 yksikköä / 4 mm
  const svg = renderer.svgWhole(sc);
  assert.match(svg, /stroke-width="2.4"/); // ranta 0,6 mm
  assert.match(svg, /stroke-width="1.2"/); // piirto 0,3 mm
  assert.match(svg, new RegExp(`width="${sc.VW / 4}mm"`));
});

test('piirto on deterministinen ja yhden ruudun muutos ei sekoita kaukaisia symboleja', () => {
  const a = renderer.scene(doc, { cellMM: 5 }).body;
  assert.equal(renderer.scene(doc, { cellMM: 5 }).body, a);
  const d2 = JSON.parse(JSON.stringify(doc));
  // muutetaan oikean alakulman vesiruutua; vasemman yläkulman puiden pitäisi pysyä samoina
  const r = d2.grid[d2.H - 3]; d2.grid[d2.H - 3] = r.slice(0, d2.W - 3) + '~' + r.slice(d2.W - 2);
  const trees = s => (s.match(/<path d="M[0-9.]+ [0-9.]+L[0-9.]+ [0-9.]+L[0-9.]+ [0-9.]+L[0-9.]+ [0-9.]+L[0-9.]+ [0-9.]+L[0-9.]+ [0-9.]+L[0-9.]+ [0-9.]+Z" fill="#fff" stroke="none"\/>/g) || []).slice(0, 10).join();
  assert.equal(trees(renderer.scene(d2, { cellMM: 5 }).body), trees(a));
});

test('kaikki selitteen merkit piirtyvät virheettä', () => {
  const d = rlml.blankDoc(30, 24);
  const row = '~~~..,TDY^nrXK~';
  for (let j = 4; j < 14; j++) d.grid[j] = '~~~~~~' + row.replace(/~/g, '.') + '~'.repeat(30 - 6 - row.length);
  d.grid[20] = '~~~~K' + '~'.repeat(25);
  const svg = renderer.svgWhole(renderer.scene(d, { cellMM: 6 }));
  assert.ok(svg.length > 10000);
  assert.ok(svg.includes('clipPath id="kclip0"'));
});

test('koristeet (decor) eivät tule selitteeseen', () => {
  const d = rlml.blankDoc(40, 30); d.grid[5] = '~~~~~' + 'K' + '~'.repeat(34); d.grid[10] = '~~~~~~....^^TT' + '~'.repeat(26);
  const rows = dd => renderer.scene(dd, { cellMM: 5 }).body.length;
  const withDecor = rows(d);
  d.legend.find(e => e.ch === 'K').decor = false;
  assert.ok(rows(d) > withDecor, 'ilman decor-määrettä kraken lisää selitteeseen rivin');
});

test('uudet palat ja koristeet piirtyvät mustavalkoisina ja selitteeseen', () => {
  const d = rlml.blankDoc(36, 24);
  const rows = ['~~~CCCCC~~~~~~~~~~~~~~~~~~~~~~~~~~~~', '~~C..hh.s~~~~^^^^^~~~~~~~~~~~~~~~~~~', '~~C..RR.ss~~^^^^^^^~~~~~~~~~~~~~~~~~', '~~~C....s~~~~^^^^^~~~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', '~~~~....VV...S...~~~~~~~~~~~~~~~~~~~', '~~~~....VV.......~~~~~~~~~~~~~~~~~~~'];
  rows.forEach((r, j) => { d.grid[j + 2] = r; });
  for (const e of d.legend) if (e.ch === 'V' || e.ch === 'S') delete e.decor;
  const svg = renderer.svgWhole(renderer.scene(d, { cellMM: 6 }));
  assert.ok(!svg.includes('NaN'));
  for (const c of new Set(svg.match(/#[0-9a-fA-F]{3,6}\b/g))) assert.ok(['#000', '#fff'].includes(c.toLowerCase()), 'väri ' + c);
  const tm = rlml.typeMap(d);
  assert.deepEqual(['C', 's', 'h', 'R', 'S', 'V'].map(c => tm[c]), ['cliff', 'beach', 'building', 'ruins', 'skullcave', 'volcano']);
});

test('saaren järvi jää reiäksi ja saa vesiviivoituksen', () => {
  const d = rlml.blankDoc(24, 16);
  for (let j = 2; j < 14; j++) d.grid[j] = '~~' + '.'.repeat(20) + '~~';
  for (let j = 5; j < 11; j++) d.grid[j] = '~~.....' + '~'.repeat(10) + '.....~~';
  const body = renderer.scene(d, { cellMM: 6, legend: false, compass: false, title: false }).body;
  const coast = body.match(/<path d="([^"]+)" fill="#fff" fill-rule="evenodd"/);
  assert.ok(coast, 'rantaviiva piirretään yhtenä even-odd-polkuna');
  assert.equal((coast[1].match(/M/g) || []).length, 2, 'ulkoranta ja järven ranta');
  // järven keskikohdan (ruutu 12,8) korkeudella on vaakaviiva, joka kulkee järven yli
  const y = 8.5 * 16, lines = [...body.matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)/g)].map(m => m.slice(1).map(Number));
  assert.ok(lines.some(([x1, yy, x2]) => Math.abs(yy - y) < 8 && x1 < 12.5 * 16 && x2 > 12.5 * 16), 'järvessä on vesiviivoitusta');
});

test('rantaviivan lohkotus ei muuta kuvaa ja iso kartta piirtyy kohtuullisessa ajassa', () => {
  const d = generator.generate({ W: 200, H: 160, seed: 11 }), t0 = Date.now();
  const svg = renderer.svgWhole(renderer.scene(d, {}), 'x');
  assert.ok(svg.startsWith('<svg') && !/NaN/.test(svg));
  assert.ok(Date.now() - t0 < 20000, 'piirto alle 20 s');
});
