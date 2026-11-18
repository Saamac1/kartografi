const test = require('node:test');
const assert = require('node:assert');
const { rlml } = require('./helpers');

const SRC = `# Maailma

atlas MAAILMA sheet 6x3 grid 3x2 fill WATER

legend:
- ~ WATER
- . GRASS

areas:
- 4,1 size 4x2 as NORSUSAARI

## A01

map MAAILMA.A01

\`\`\`
~~~~~~
~~..~~
~~~~~.
\`\`\`

at:
- 2,1 as START

areas:
- 2,1 size 2x1 as LAHDE

## B01

map MAAILMA.B01

\`\`\`
~~~~~~
......
~~~~~~
\`\`\`

legend:
- x GRASS with TREASURE

## C02

map MAAILMA.C02

\`\`\`
xx~~~~
\`\`\`

legend:
- x WALL
`;
const LANG = 'language fi\nMAAILMA.NAME Maailma\nMAAILMA.NORSUSAARI.NAME Norsusaari\nMAAILMA.A01.LAHDE.NAME Lähde\n';
const STYLE = 'maps.theme paper\n- MAAILMA sea\n\nareas.labels paper\n- LAHDE in MAAILMA.A01 size 7\n';
const open = () => rlml.parseProject([{ name: 'maailma.rlml.md', text: SRC }, { name: 'maailma.paper.rlml.md', text: STYLE }, { name: 'maailma.fi.rlml.md', text: LANG }]);

test('atlaksen lehdet kootaan yhdeksi kartaksi; puuttuvat lehdet täytetään', () => {
  const f = open(), A = f.maps[0];
  assert.strictEqual(f.maps.length, 1);
  assert.deepStrictEqual([A.name, A.W, A.H], ['MAAILMA', 18, 6]);
  assert.strictEqual(A.grid[1], '~~..~~......~~~~~~');
  assert.ok(A.grid.slice(3).join('').replace(/,/g, '').split('').every(c => c === '~'), 'A02 ja B02 puuttuvat: täyttöä');
  assert.deepStrictEqual(A.areas.map(a => a.name), ['NORSUSAARI', 'A01.LAHDE']);
  assert.deepStrictEqual(A.at, [{ x: 2, y: 1, as: 'START' }]);
  assert.strictEqual(A.texts['A01.LAHDE'], 'Lähde');
  assert.deepStrictEqual(A.rules, [{ name: 'A01.LAHDE', size: 7 }]);
});

test('ristiriitainen legendamerkki vaihdetaan ja siitä varoitetaan', () => {
  const A = open().maps[0];
  const wall = A.legend.find(e => e.spec === 'WALL');
  assert.notStrictEqual(wall.ch, 'x');
  assert.strictEqual(A.grid[3].slice(12, 14), wall.ch + wall.ch);
  assert.match(A.warnings.join(' '), /Merkki x .*C02/);
});

test('jako lehdiksi: yksi tiedosto ja lehti per tiedosto kiertävät tavu tavulta', () => {
  const f = open(), out = rlml.projectFiles(f);
  assert.deepStrictEqual(rlml.projectFiles(rlml.parseProject(out)), out);
  const map = out[0].text;
  assert.match(map, /^atlas MAAILMA sheet 6x3 grid 3x2 fill WATER$/m);
  assert.deepStrictEqual([...map.matchAll(/^map (\S+)$/gm)].map(m => m[1]), ['MAAILMA.A01', 'MAAILMA.B01', 'MAAILMA.C02']);
  assert.match(out.find(o => o.kind === 'style').text, /^- LAHDE in MAAILMA\.A01 size 7$/m);
  f.maps[0].atlas.layout = 'files';
  const files = rlml.projectFiles(f);
  assert.deepStrictEqual(files.map(o => o.name), ['maailma.rlml.md', 'maailma-A01.rlml.md', 'maailma-B01.rlml.md', 'maailma-C02.rlml.md', 'maailma.paper.rlml.md', 'maailma.fi.rlml.md']);
  assert.doesNotMatch(files[0].text, /^map /m);
  const again = rlml.parseProject(files);
  assert.strictEqual(again.maps[0].atlas.layout, 'files');
  assert.deepStrictEqual(rlml.projectFiles(again), files);
});

test('lehtien nimet: kirjain on sarake ja numero rivi', () => {
  const at = { rows: 14 };
  assert.deepStrictEqual([rlml.sheetId(at, 0, 0), rlml.sheetId(at, 1, 9), rlml.sheetId(at, 25, 0), rlml.sheetId(at, 26, 0), rlml.sheetId({ rows: 120 }, 2, 4)], ['A01', 'B10', 'Z01', 'AA01', 'C005']);
  assert.deepStrictEqual(rlml.parseSheetId('AB12'), { c: 27, r: 11 });
});

test('tavallisesta kartasta atlas ja takaisin; lehtijaon muutos', () => {
  const m = rlml.mapOfKind('sea', 20, 10); m.name = 'MERI'; rlml.projectOf(m, 'Meri');
  m.grid[9] = '.'.repeat(20);
  m.raw = [{ head: 'at:', lines: ['- 15,9 as START'] }]; m.areas = [{ x: 1, y: 1, w: 2, h: 2, name: 'X' }];
  rlml.makeAtlas(m, 8, 8, 'WATER');
  assert.deepStrictEqual([m.W, m.H, m.atlas.cols, m.atlas.rows], [24, 16, 3, 2]);
  const names = rlml.projectFiles(m.file)[0].text.match(/^map \S+$/gm);
  assert.deepStrictEqual(names, ['map MERI.A02', 'map MERI.B02', 'map MERI.C02'], 'tyhjät lehdet A01–C01 jätetään pois');
  assert.match(rlml.projectFiles(m.file)[0].text, /## B02[\s\S]*at:\n- 7,1 as START/);
  m.areas.push({ x: 9, y: 1, w: 2, h: 2, name: 'B01.LAHTEET' }); m.texts['B01.LAHTEET'] = 'Lähteet';
  assert.strictEqual(rlml.resplitAtlas(m, 12, 8), 1);
  assert.deepStrictEqual([m.W, m.H], [24, 16]);
  assert.ok(m.areas.some(a => a.name === 'B01_LAHTEET') && m.texts.B01_LAHTEET === 'Lähteet');
  rlml.unmakeAtlas(m);
  assert.ok(!m.atlas); assert.match(rlml.projectFiles(m.file)[0].text, /^map MERI size 24x16$/m);
});
