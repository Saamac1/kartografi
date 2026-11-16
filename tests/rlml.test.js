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

test('kirjoitus ja luku säilyttävät kartan, legendan ja nimet', () => {
  const doc = rlml.blankDoc(5, 3);
  doc.grid[1] = '~.^Y~'; doc.labels = [{ x: 2, y: 1, text: 'Norsusaari', size: 11 }, { x: 0, y: 0, text: 'Syvä', size: 10 }];
  const back = rlml.parse(rlml.serialize(doc));
  assert.deepEqual(back.grid, doc.grid);
  assert.deepEqual(back.labels, doc.labels);
  assert.deepEqual(back.legend.map(e => e.ch + e.spec), doc.legend.map(e => e.ch + e.spec));
  assert.equal(back.title, doc.title);
});

test('lyhyet rivit täydennetään vedellä ja koon muutos rajaa nimet', () => {
  const doc = rlml.parse('map T size 4x2\n\n```\n..\n.\n```\n\nlegend:\n- ~ WATER\n- . GRASS\n\nlabels:\n- 3,1 X\n');
  assert.deepEqual(doc.grid, ['..~~', '.~~~']);
  rlml.resize(doc, 2, 2);
  assert.deepEqual(doc.grid, ['..', '.~']);
  assert.equal(doc.labels.length, 0);
});

test('tile-tyypit tunnistetaan kuvauksesta', () => {
  assert.equal(rlml.typeOf('WATER with KRAKEN'), 'kraken');
  assert.equal(rlml.typeOf('FOREST.deciduous'), 'deciduous');
  assert.equal(rlml.typeOf('FOREST'), 'conifer');
  assert.equal(rlml.typeOf('SAND with PALM'), 'palm');
  assert.equal(rlml.typeOf('FLOOR'), 'grass');
});
