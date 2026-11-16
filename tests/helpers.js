// Lataa selainmoduulit Nodeen samassa järjestyksessä kuin index.html
const path = require('path');
const src = f => path.join(__dirname, '..', 'src', f);
const rlml = require(src('rlml.js'));
const font = require(src('font.js'));
const areas = require(src('areas.js'));
const renderer = require(src('renderer.js'));
const generator = require(src('generator.js'));
const print = require(src('print.js'));
module.exports = { rlml, font, areas, renderer, generator, print };
