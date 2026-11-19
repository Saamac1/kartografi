const test = require('node:test');
const assert = require('node:assert');
const { rlml, areas, renderer, generator } = require('./helpers');

function doc(list) { const d = rlml.blankDoc(20, 12); d.areas = list; return d; }

test('sisäkkäinen alue saa vanhemman ja tason geometriasta', () => {
  const d = doc([{ x: 2, y: 2, w: 10, h: 8, name: 'NORSUSAARI' }, { x: 4, y: 3, w: 3, h: 2, name: 'VAARAVUORI' }, { x: 5, y: 3, w: 1, h: 1, name: 'HUIPPU' }]);
  const M = areas.model(d);
  assert.equal(M.byName.VAARAVUORI.parent, 'NORSUSAARI');
  assert.equal(M.byName.HUIPPU.parent, 'VAARAVUORI');
  assert.deepEqual([0, 1, 2], ['NORSUSAARI', 'VAARAVUORI', 'HUIPPU'].map(n => M.byName[n].level));
  assert.deepEqual(M.at(5, 3), ['NORSUSAARI', 'VAARAVUORI', 'HUIPPU']);
  assert.deepEqual(M.at(9, 8), ['NORSUSAARI']);
  assert.deepEqual(M.at(15, 1), []);
  assert.deepEqual(M.tree, ['NORSUSAARI', 'VAARAVUORI', 'HUIPPU']);
});

test('saman nimen suorakulmiot muodostavat yhdisteen', () => {
  const d = doc([{ x: 0, y: 0, w: 3, h: 3, name: 'A' }, { x: 10, y: 5, w: 2, h: 2, name: 'A' }, { x: 10, y: 5, w: 1, h: 1, name: 'B' }]);
  const M = areas.model(d);
  assert.equal(M.byName.A.size, 13);
  assert.equal(M.byName.B.parent, 'A');
  assert.deepEqual(M.at(11, 6), ['A']);
});

test('samanruutuiset alueet ovat samalla tasolla, myöhempi on tarkempi ja niistä varoitetaan', () => {
  const d = doc([{ x: 1, y: 1, w: 2, h: 2, name: 'A' }, { x: 1, y: 1, w: 2, h: 2, name: 'B' }, { x: 1, y: 1, w: 1, h: 1, name: 'C' }]);
  const M = areas.model(d);
  assert.equal(M.byName.A.parent, null);
  assert.equal(M.byName.B.parent, null);
  assert.deepEqual([0, 0], ['A', 'B'].map(n => M.byName[n].level));
  // lähin vanhempi tasatilanteessa myöhempi, taso ketjun pituus
  assert.equal(M.byName.C.parent, 'B');
  assert.equal(M.byName.C.level, 1);
  assert.deepEqual(M.at(1, 1), ['A', 'B', 'C']);
  assert.deepEqual(M.at(2, 2), ['A', 'B']);
  const v = areas.validate(d, M);
  assert.ok(v.some(x => x.level === 'warn' && /A ja B: samat ruudut/.test(x.msg)), JSON.stringify(v));
  assert.ok(!v.some(x => /A ja C|B ja C/.test(x.msg)));
});

test('osittain päällekkäisten sisällä oleva alue on tasolla 1', () => {
  const M = areas.model(doc([{ x: 0, y: 0, w: 4, h: 4, name: 'A' }, { x: 2, y: 2, w: 3, h: 3, name: 'B' }, { x: 2, y: 2, w: 1, h: 1, name: 'C' }]));
  assert.equal(M.byName.C.parent, 'B');
  assert.equal(M.byName.C.level, 1);
});

test('osittainen päällekkäisyys ei tee vanhempaa ja siitä varoitetaan', () => {
  const d = doc([{ x: 0, y: 0, w: 5, h: 5, name: 'A' }, { x: 3, y: 3, w: 5, h: 5, name: 'B' }, { x: 18, y: 10, w: 5, h: 5, name: 'C' }]);
  d.texts = { A: 'A' }; d.rules = [{ name: 'Z', hide: true }];
  const M = areas.model(d), v = areas.validate(d, M);
  assert.equal(M.byName.B.parent, null);
  assert.deepEqual(M.at(4, 4), ['A', 'B']);
  assert.ok(v.some(x => x.level === 'warn' && /osittain/.test(x.msg)));
  assert.ok(v.some(x => x.level === 'error' && /C/.test(x.msg)));
  assert.ok(v.some(x => x.level === 'warn' && /Z/.test(x.msg)));
});

test('tyylisäännöt: nimisääntö ohittaa tasosäännön', () => {
  const d = doc([{ x: 0, y: 0, w: 9, h: 9, name: 'A' }, { x: 1, y: 1, w: 2, h: 2, name: 'B' }]);
  d.rules = [{ level: 1, size: 7, place: 'center' }, { name: 'B', size: 12 }];
  const M = areas.model(d), st = areas.styleFor(d, M, 'B');
  assert.equal(st.size, 12); assert.equal(st.place, 'center');
  assert.equal(areas.displayName(d, 'SYNKKA_SYVA'), 'Synkka syva');
});

test('generaattorin alueet eivät mene osittain päällekkäin ja kaikki nimet piirtyvät', () => {
  for (const seed of [1, 7, 42]) {
    const d = generator.generate({ W: 64, H: 44, seed });
    const v = areas.validate(d);
    assert.ok(!v.some(x => x.level !== 'info'), seed + ': ' + JSON.stringify(v));
    const body = renderer.scene(d, { cellMM: 5 }).body;
    assert.ok(d.areas.length >= 3);
  }
});

test('saman alueen sisäkkäiset ja jatkuvat rajaukset yhdistetään', () => {
  const d = doc([
    { x: 2, y: 2, w: 6, h: 4, name: 'A' }, { x: 3, y: 3, w: 2, h: 2, name: 'A' },   // sisäkkäinen pois
    { x: 8, y: 2, w: 3, h: 4, name: 'A' },                                          // vierekkäinen samalla rivivälillä -> yksi 9x4
    { x: 3, y: 3, w: 1, h: 1, name: 'B' },                                          // eri alue säilyy
    { x: 0, y: 8, w: 4, h: 2, name: 'C' }, { x: 0, y: 9, w: 4, h: 3, name: 'C' },   // päällekkäin samalla sarakevälillä -> 4x4
    { x: 10, y: 9, w: 2, h: 2, name: 'C' },                                         // erillinen säilyy
  ]);
  const removed = areas.normalize(d);
  assert.equal(removed, 3);
  assert.deepEqual(d.areas, [
    { x: 2, y: 2, w: 9, h: 4, name: 'A' },
    { x: 3, y: 3, w: 1, h: 1, name: 'B' },
    { x: 0, y: 8, w: 4, h: 4, name: 'C' }, { x: 10, y: 9, w: 2, h: 2, name: 'C' },
  ]);
  assert.equal(areas.normalize(d), 0);
});
