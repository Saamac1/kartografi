const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { rlml, renderer, generator, print, tiles } = require('./helpers');
const game = fs.readFileSync(path.join(__dirname, '..', 'examples', 'kapteeni-aaltola.rlml.md'), 'utf8');
const STYLE = { CAVE: 'cave', DECK: 'ship', HOLD: 'ship' };

test('pelitiedoston kaikki kartat säilyvät kierrätyksessä', () => {
  const f = rlml.parseFile(game);
  assert.ok(f.maps.length >= 4);
  assert.strictEqual(rlml.serialize(f.maps[0]), game);
});

test('luola- ja laivakartat piirtyvät pelkällä mustalla', () => {
  const f = rlml.parseFile(game);
  for (const m of f.maps) {
    m.style = STYLE[m.name] || m.style;
    const svg = renderer.svgWhole(renderer.scene(m, { grid: true }), m.title);
    assert.match(svg, /^<svg/);
    assert.ok(!/NaN|undefined/.test(svg), m.name + ' sisältää NaN/undefined');
    const cols = new Set((svg.match(/#[0-9a-fA-F]{3,6}\b/g) || []).map(c => c.toLowerCase()));
    for (const c of cols) assert.ok(['#000', '#000000', '#fff', '#ffffff'].includes(c), m.name + ' väri ' + c);
  }
});

test('kartan piirtotapa kirjoitetaan tyylitiedostoon ja luetaan takaisin', () => {
  const f = rlml.parseFile(game);
  const m = f.maps.find(x => x.name === 'CAVE');
  m.style = 'cave'; m.styleSet = true;
  const pj = rlml.serializeProject(f);
  assert.match(pj.style, /^maps\.theme paper\n- CAVE cave$/m);
  assert.strictEqual(pj.map, game);
  assert.strictEqual(rlml.parseProject([pj.map, pj.style]).maps.find(x => x.name === 'CAVE').style, 'cave');
});

test('luolageneraattori on deterministinen ja kierrättyy', () => {
  const a = generator.generateCave({ W: 48, H: 32, seed: 3 });
  const b = generator.generateCave({ W: 48, H: 32, seed: 3 });
  assert.deepStrictEqual(a.grid, b.grid);
  assert.strictEqual(a.style, 'cave');
  const t = rlml.serialize(a);
  assert.strictEqual(rlml.serialize(rlml.parse(t)), t);
  assert.ok(a.grid.join('').includes('>'));
});

test('tunnistamaton pala ei kaada piirtoa', () => {
  const c = tiles.classify('GLORP', []);
  assert.ok(c.unknown);
});

test('fitCell hyväksyy mitat', () => {
  const m = generator.generateCave({ W: 40, H: 30, seed: 1 });
  const fit = print.fitCell(renderer.dims(m, renderer.DEFAULTS), 'A4', 'auto', 10);
  assert.ok(fit.cellMM > 1 && fit.cellMM < 10, JSON.stringify(fit));
});

test('esimerkkivalikon tiedostot ovat ajan tasalla', () => {
  const ex = path.join(__dirname, '..', 'examples');
  require('../src/examples.js');
  const x = globalThis.KG.examples.find(v => v.id === 'aaltola');
  assert.deepStrictEqual(x.files.map(f => f.name), ['kapteeni-aaltola.rlml.md', 'kapteeni-aaltola.paper.rlml.md', 'kapteeni-aaltola.fi.rlml.md']);
  assert.strictEqual(x.files[0].text, game);
  for (const f of x.files) assert.strictEqual(f.text, fs.readFileSync(path.join(ex, f.name), 'utf8'), f.name);
  const f = rlml.parseProject(x.files);
  assert.deepStrictEqual(f.maps.map(m => m.style), ['ship', 'ship', 'cave', 'cave']);
  assert.deepStrictEqual(rlml.projectFiles(f).map(o => [o.name, o.text]), x.files.map(o => [o.name, o.text]));
});

test('sijoitetut kohteet (at:) voi jättää pois selitteestä, ja valinta säilyy tallennuksessa', () => {
  const ex = path.join(__dirname, '..', 'examples');
  const files = ['kapteeni-aaltola.rlml.md', 'kapteeni-aaltola.paper.rlml.md', 'kapteeni-aaltola.fi.rlml.md'].map(f => fs.readFileSync(path.join(ex, f), 'utf8'));
  const deck = () => rlml.parseProject(files).maps.find(m => m.name === 'DECK');
  const legendText = d => renderer.scene(d, { cellMM: 6 }).body;
  const d = deck();
  assert.ok(rlml.atRoots(d).includes('CREW'));
  const before = legendText(d).length;
  d.atDecor.push('CREW');
  assert.ok(legendText(d).length < before, 'miehistö jäi pois selitteestä');
  // tallennus ja luku: paperityyliin rivi CREW decor
  const pj = rlml.serializeProject(d.file);
  assert.match(pj.style, /^- CREW decor$/m);
  const back = rlml.parseProject([pj.map, pj.style, pj.lang]).maps.find(m => m.name === 'DECK');
  assert.deepEqual(back.atDecor, ['CREW']);
  assert.equal(legendText(back).length, legendText(d).length);
});

test('kartasto voi koostua useasta karttatiedostosta ja kielestä', () => {
  const sea = rlml.mapOfKind('sea', 10, 8), f = rlml.projectOf(sea, 'Testi');
  const files = rlml.projectFiles(f).concat([{ name: 'luolat.rlml.md', text: rlml.fileTemplate(f, 'map') }, { name: 'testi.en.rlml.md', text: 'language en\nX.NAME y\n' }]);
  const p = rlml.parseProject(files), out = rlml.projectFiles(p);
  assert.deepStrictEqual(out.filter(o => o.text.trim()).map(o => o.name), ['testi.rlml.md', 'testi.paper.rlml.md', 'testi.fi.rlml.md', 'luolat.rlml.md', 'testi.en.rlml.md']);
  assert.strictEqual(p.maps.length, 2);
  assert.deepStrictEqual(p.maps.map(m => m.style), ['sea', 'sea']);
  assert.strictEqual(out.find(o => o.name === 'testi.en.rlml.md').text, 'language en\nX.NAME y\n');
  const again = rlml.projectFiles(rlml.parseProject(out));
  assert.deepStrictEqual(again, out);
});

test('kartan laji päätellään paloista, kun piirtotapa puuttuu', () => {
  const f = rlml.parseProject([game]);
  assert.deepStrictEqual(f.maps.map(m => m.style), ['ship', 'ship', 'cave', 'cave']);
  assert.match(rlml.projectFiles(f).find(o => o.kind === 'style').text, /- DECK ship/);
  for (const k of ['sea', 'cave', 'ship']) { const m = rlml.mapOfKind(k, 12, 6); assert.strictEqual(m.grid.length, 6); assert.strictEqual(m.style, k); }
});
