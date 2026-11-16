// Kokoaa examples/-kansion kartta-, tyyli- ja kielitiedostot selaimen esimerkkivalikkoon (src/examples.js)
const fs = require('fs'), path = require('path');
const ex = p => fs.readFileSync(path.join(__dirname, '..', 'examples', p), 'utf8');
const list = [
  { id: 'aaltola', name: 'Aaltolan seikkailu', files: ['kapteeni-aaltola.rlml.md', 'kapteeni-aaltola.paper.rlml.md', 'kapteeni-aaltola.fi.rlml.md'].map(ex) },
  { id: 'meri', name: 'Merikartta', files: ['merikartta.rlml.md', 'merikartta.paper.rlml.md', 'merikartta.fi.rlml.md'].map(ex) },
];
fs.writeFileSync(path.join(__dirname, '..', 'src', 'examples.js'),
  '// Generoitu: node tools/build-examples.js\n(function () {\n  const KG = (globalThis.KG = globalThis.KG || {});\n  KG.examples = ' + JSON.stringify(list, null, 1) + ';\n})();\n');
console.log('src/examples.js', list.map(l => l.id).join(', '));
