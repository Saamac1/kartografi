const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { rlml } = require('./helpers');

test('esimerkkikartta jäsentyy oikean kokoiseksi', () => {
  const doc = rlml.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'merikartta.rlml.md'), 'utf8'));
  assert.equal(doc.W, 64); assert.equal(doc.H, 44);
  assert.equal(doc.grid.length, 44);
  assert.ok(doc.grid.every(r => r.length === 64));
  assert.equal(rlml.typeMap(doc)['Y'], 'palm');
});

test('kirjoitus ja luku säilyttävät kartan, legendan, alueet, säännöt ja tekstit', () => {
  const doc = rlml.blankDoc(5, 3);
  doc.grid[1] = '~.^Y~';
  doc.areas = [{ x: 0, y: 0, w: 5, h: 3, name: 'NORSUSAARI' }, { x: 1, y: 1, w: 2, h: 1, name: 'VAARAVUORI' }, { x: 4, y: 0, w: 1, h: 1, name: 'NORSUSAARI' }];
  doc.rules = [{ level: 0, size: 11, spacing: 'wide' }, { name: 'VAARAVUORI', place: 'center', at: [2, 1.5] }, { name: 'NORSUSAARI', hide: true, outline: 'dotted' }];
  doc.texts = { NORSUSAARI: 'Norsusaari', VAARAVUORI: 'Vaara "vuori"' };
  const back = rlml.parse(rlml.serialize(doc));
  assert.deepEqual(back.grid, doc.grid);
  assert.deepEqual(back.areas, doc.areas);
  assert.deepEqual(back.rules, doc.rules);
  assert.deepEqual(back.texts, doc.texts);
  assert.deepEqual(back.legend.map(e => e.ch + e.spec), doc.legend.map(e => e.ch + e.spec));
  assert.equal(back.title, doc.title);
});

test('tekstin lainausmerkit ovat vapaaehtoiset', () => {
  const doc = rlml.parse('map T size 2x1\n\n```\n..\n```\n\ntext fi\n- A "Synkkä syvä"\n- B Synkkä syvä\n- C "sisällä \\"lainaus\\""\n');
  assert.equal(doc.texts.A, 'Synkkä syvä');
  assert.equal(doc.texts.B, 'Synkkä syvä');
  assert.equal(doc.texts.C, 'sisällä "lainaus"');
});

test('vanha labels:-osio muunnetaan alueiksi, säännöiksi ja teksteiksi', () => {
  const doc = rlml.parse('map T size 10x10\n\n```\n..\n```\n\nlabels:\n- 3,4 Synkkä syvä size 9\n- 5.5,2 Norsusaari\n');
  assert.deepEqual(doc.areas, [{ x: 3, y: 4, w: 1, h: 1, name: 'SYNKKA_SYVA' }, { x: 5, y: 2, w: 1, h: 1, name: 'NORSUSAARI' }]);
  assert.deepEqual(doc.rules, [{ name: 'SYNKKA_SYVA', at: [3, 4], size: 9 }, { name: 'NORSUSAARI', at: [5.5, 2] }]);
  assert.equal(doc.texts.SYNKKA_SYVA, 'Synkkä syvä');
  assert.ok(doc.warnings.length);
});

test('lyhyet rivit täydennetään vedellä ja koon muutos rajaa alueet', () => {
  const doc = rlml.parse('map T size 4x2\n\n```\n..\n.\n```\n\nlegend:\n- ~ WATER\n- . GRASS\n\nareas:\n- 3,1 size 1x1 as A\n- 0,0 size 4x2 as B\n');
  assert.deepEqual(doc.grid, ['..~~', '.~~~']);
  rlml.resize(doc, 2, 2);
  assert.deepEqual(doc.grid, ['..', '.~']);
  assert.deepEqual(doc.areas, [{ x: 0, y: 0, w: 2, h: 2, name: 'B' }]);
});

test('tile-tyypit tunnistetaan kuvauksesta', () => {
  assert.equal(rlml.typeOf('WATER with KRAKEN'), 'kraken');
  assert.equal(rlml.typeOf('FOREST.deciduous'), 'deciduous');
  assert.equal(rlml.typeOf('FOREST'), 'conifer');
  assert.equal(rlml.typeOf('SAND with PALM'), 'palm');
  assert.equal(rlml.typeOf('FLOOR'), 'grass');
});

test('decor-määre luetaan ja kirjoitetaan', () => {
  const doc = rlml.parse('map T size 2x1\n\n```\n~K\n```\n\nlegend:\n- ~ WATER\n- K WATER with KRAKEN decor\n- X GRASS with TREASURE\n');
  assert.deepEqual(doc.legend.map(e => [e.ch, e.spec, !!e.decor]), [['~', 'WATER', false], ['K', 'WATER with KRAKEN', true], ['X', 'GRASS with TREASURE', false]]);
  assert.equal(rlml.typeMap(doc).K, 'kraken');
  assert.match(rlml.serialize(doc), /- K WATER with KRAKEN decor\n/);
  assert.ok(rlml.DEFAULT_LEGEND.find(e => e.ch === 'K').decor);
});
