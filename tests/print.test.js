const test = require('node:test');
const assert = require('node:assert');
const { print } = require('./helpers');

test('A4-lehdet peittävät koko kuvan ja menevät päällekkäin liimausreunan verran', () => {
  const imgW = 402, imgH = 282, o = { paper: 'A4', orient: 'portrait', margin: 7, overlap: 12 };
  const L = print.tiles(imgW, imgH, o);
  assert.equal(L.aw, 196); assert.equal(L.ah, 283);
  for (let x = 0; x <= imgW; x += 3) for (let y = 0; y <= imgH; y += 3)
    assert.ok(L.sheets.some(s => x >= s.x0 && x <= s.x0 + L.aw && y >= s.y0 && y <= s.y0 + L.ah), `kohta ${x},${y} jää lehtien ulkopuolelle`);
  const a = L.sheets.find(s => s.c === 0 && s.r === 0), b = L.sheets.find(s => s.c === 1 && s.r === 0);
  assert.equal(Math.round((a.x0 + L.aw - b.x0) * 1000) / 1000, 12);
  assert.deepEqual(L.sheets.map(s => s.name), ['A1', 'B1', 'C1']);
});

test('liian suuri liimausreuna hylätään', () => {
  assert.throws(() => print.tiles(500, 500, { paper: 'A4', orient: 'portrait', margin: 10, overlap: 200 }));
});

test('koko kuva sovitetaan paperille marginaalien sisään', () => {
  const fit = print.fitCell(64, 44, 'A3', 'auto', 10);
  assert.equal(fit.orient, 'landscape');
  const w = (64 * 16 + 48) * fit.cellMM / 16, h = (44 * 16 + 48) * fit.cellMM / 16;
  assert.ok(w <= 400 + 1e-9 && h <= 277 + 1e-9);
  assert.ok(Math.abs(w - 400) < 1e-6 || Math.abs(h - 277) < 1e-6);
});
