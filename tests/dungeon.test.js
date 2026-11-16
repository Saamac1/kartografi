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
  assert.strictEqual(x.files[0], game);
  assert.strictEqual(x.files[1], fs.readFileSync(path.join(ex, 'kapteeni-aaltola.paper.rlml.md'), 'utf8'));
  const f = rlml.parseProject(x.files);
  assert.deepStrictEqual(f.maps.map(m => m.style), ['ship', 'ship', 'cave', 'cave']);
  assert.deepStrictEqual(rlml.serializeProject(f), { map: x.files[0], style: x.files[1], lang: x.files[2] });
});
