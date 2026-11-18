const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');

test('sw.js on ajan tasalla (node tools/build-sw.js)', () => {
  const before = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  execFileSync(process.execPath, [path.join(root, 'tools', 'build-sw.js')]);
  const after = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.strictEqual(after, before, 'sw.js oli vanhentunut – se kirjoitettiin uudelleen, aja testit uudestaan');
});

test('manifestin kuvakkeet ovat olemassa', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
});
