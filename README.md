# Karttageneraattori

Selainpohjainen työkalu RLML-karttojen muokkaamiseen ja tulostettavien
mustavalkoisten vektorikarttojen (SVG) tekemiseen. Tyyli on vanhan
kaiverretun merikartan kaltainen: rosoinen rantaviiva, vaakaviivoitettu meri
(matalikko tummin), vuoret, kukkulat, havu- ja lehtimetsä, pensaikko, palmut,
joet, aarre ja kraken.

Pelin kevyempi visualisointi tehdään erikseen; tämä työkalu on paperille.

## Käyttö

Avaa `index.html` selaimessa. Rakennusvaihetta tai palvelinta ei tarvita, ja
tiedostot ovat tavallisia skriptejä, joten `file://` toimii.

- **Selite (vasen):** valitse piirrettävä pala. Sivellinkoko 1–5 ruutua.
- **Editori (keskellä):**
  - hiiren vasen nappi piirtää, oikea poimii palan kartalta, Vaihto + napsautus täyttää yhtenäisen alueen
  - näppäimistö toimii kuten vimin korvaustila: nuolet liikuttavat kursoria
    (Vaihto = 5 askelta), kirjoitettu merkki korvaa ruudun ja kursori siirtyy
    oikealle, Enter siirtää seuraavalle riville kirjoituksen aloitussarakkeeseen,
    Askelpalautin siirtää vasemmalle, Home/End/PageUp/PageDown, Ctrl+Z / Ctrl+Y
- **Esikatselu (oikealla):** päivittyy muokatessa. *Irrota ikkunaksi* avaa sen
  omaan ikkunaansa (esim. toiselle näytölle); ikkunan sulkeminen palauttaa sen.
  *Lehtijako* näyttää A4-lehtien rajat.
- **Generoi:** uusi saaristo annetulla siemenellä ja koolla. Sama siemen ja koko
  tuottavat aina saman kartan.
- **Nimet-välilehti:** otsikko ja paikannimet (`x,y NIMI size 10`), tai
  *Lisää kursorin kohtaan*.
- **RLML-lähde-välilehti:** kartta tekstinä; muokkaa ja lue takaisin.
- Kartta tallentuu selaimen muistiin automaattisesti; *Tallenna RLML* lataa
  sen tiedostona.

## Tulostus

- **Koko kuva yhdelle arkille:** valitse paperi (A4–A0) ja suunta; kartta
  skaalataan marginaalien sisään.
- **A4-lehdet liimausreunoin:** valitse ruudun koko millimetreinä ja
  liimausreunan leveys. Jokaisella lehdellä on oikeassa ja alareunassa
  liimausalue (katkoviiva, "LIIMA"), vasemmassa ja yläreunassa leikkausmerkit
  ("LEIKKAA"), kohdistusristit samoissa karttakohdissa molemmilla lehdillä,
  lehden tunnus (A1, B1 …) sekä pieni lehtikaavio.
  Leikkaa lehti LEIKKAA-reunasta ja liimaa se edellisen lehden liima-alueen
  päälle niin, että ristit osuvat päällekkäin.
- Viivavahvuudet annetaan millimetreinä (oletus: piirto 0,3, ranta 0,6, ohut
  0,15, meri 0,18 mm), joten ne pysyvät samoina kartan koosta riippumatta.
- *Tulosta…* avaa selaimen tulostusikkunan oikealla sivukoolla. *Lataa
  tulostussivu (HTML)* tekee tiedoston, jonka voi avata ja tulostaa myöhemmin.
  Tulosta 100 %:n koossa (ei "sovita sivulle").

## RLML

Kartta on RLML-karttatiedosto (markdown):

````
# KAPTEENI AALTOLAN KARTTA

map MERIKARTTA size 64x44

```
~~~~..^^TT...
```

legend:
- ~ WATER
- . GRASS
- , SHRUBS
- T FOREST.conifer
- D FOREST.deciduous
- Y SAND with PALM
- ^ MOUNTAIN
- n HILL
- r RIVER
- X GRASS with TREASURE
- K WATER with KRAKEN

labels:
- 20,19 NORSUSAARI size 11
````

Piirtotyyppi päätellään legendan tile-kuvauksesta (`WATER`, `MOUNTAIN`,
`FOREST.deciduous`, `… with PALM` jne.), joten merkit voi vaihtaa vapaasti.
`labels:` on tämän työkalun laajennus.

## Rakenne

```
index.html          käyttöliittymä
css/app.css
src/rlml.js         RLML-tiedoston luku ja kirjoitus
src/font.js         päätteellinen kursiivi viivafontti
src/renderer.js     kartta SVG:ksi (yksikkö 16 / ruutu, viivat millimetreinä)
src/generator.js    satunnainen saaristo
src/print.js        arkki- ja lehtijako, tulostus-HTML
src/editor.js       ruudukkoeditori
src/main.js         kytkennät
tests/              yksikkötestit (node --test)
examples/           esimerkkikartta
```

## Testit

```
npm test
```

Testit käyttävät Noden omaa testiajuria; riippuvuuksia ei ole.
