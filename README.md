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
- **Lue karttaa / Muokkaa karttaa (editorin yläpalkki):** lukutilassa
  karttaa vieritetään vetämällä ja napsautus näyttää ruudun tiedot
  (maasto ja aluepolku); mitään ei voi muuttaa vahingossa. Muokkaustilassa:
  - hiiren vasen nappi piirtää, oikea poimii palan kartalta, Vaihto + napsautus täyttää yhtenäisen alueen
  - näppäimistö toimii kuten vimin korvaustila: nuolet liikuttavat kursoria
    (Vaihto = 5 askelta), kirjoitettu merkki korvaa ruudun ja kursori siirtyy
    oikealle, Enter siirtää seuraavalle riville kirjoituksen aloitussarakkeeseen,
    Askelpalautin siirtää vasemmalle, Home/End/PageUp/PageDown, Ctrl+Z / Ctrl+Y
  - palan valinta selitteestä vaihtaa muokkaustilaan ja maaston piirtoon
- **Esikatselu (oikealla):** päivittyy muokatessa. *Irrota ikkunaksi* avaa sen
  omaan ikkunaansa (esim. toiselle näytölle); ikkunan sulkeminen palauttaa sen.
  *Lehtijako* näyttää A4-lehtien rajat.
- **Generoi:** uusi saaristo annetulla siemenellä ja koolla. Sama siemen ja koko
  tuottavat aina saman kartan.
- **Nimetyt alueet (vasen):** *Lisää* luo alueen nimestä. Valitse alue
  listasta ja
  - *Rajaa*: raahaa suorakulmio alueelle, kulmakahvasta muutat kokoa, oikea
    napsautus poistaa suorakulmion
  - *Siirrä*: tartu alueeseen kartalla ja raahaa (tai nuolinäppäimet). Alue
    siirtyy sisältöineen ja sisempine alueineen; tyhjäksi jäävä osa täytetään
    vedellä (legendan ensimmäinen WATER-pala).
  - *Valmis* tai Esc palaa maaston piirtoon ja poistaa valinnan.
  Lista näyttää hierarkian, ja alla näkyvät tarkistusten huomautukset.
- **Nimet-välilehti:** otsikko, piirto-ohjeet (`labels paper`) ja tekstit
  (`text fi`).
- **RLML-lähde-välilehti:** kartta tekstinä; muokkaa ja lue takaisin.
- Kartta tallentuu selaimen muistiin automaattisesti; *Tallenna RLML* lataa
  sen tiedostona.

### Puhelimessa

Kapealla näytöllä editori, esikatselu sekä tulostus ja nimet ovat omilla
välilehdillään, ja tiedosto- ja generointipainikkeet ovat ☰-valikossa.
Puhelin aloittaa lukutilassa, jossa yksi sormi vierittää. Muokkaustilassa yksi
sormi piirtää ja kaksi sormea vierittää. Esikatselua ei voi irrottaa omaksi
ikkunakseen.

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

Kartta on RLML-karttatiedosto (markdown). Tämä työkalu kokeilee kolmea uutta
osiota: `areas:` (merkitys), `labels paper` (piirto-ohjeet) ja `text fi`
(näkyvät nimet).

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
- K WATER with KRAKEN decor

areas:
- 8,6 size 26x17 as NORSUSAARI
- 30,3 size 7x6 as NORSUSAARI
- 14,9 size 7x5 as VAARAVUORI
- 2,16 size 12x10 as SYNKKA_SYVA

labels paper
- level 0 size 11 spacing wide
- level 1 size 8.5
- SYNKKA_SYVA size 9 place water
- VAARAVUORI outline dotted

text fi
- NORSUSAARI "Norsusaari"
- VAARAVUORI "Vaaravuori"
- SYNKKA_SYVA "Synkkä syvä"
````

Piirtotyyppi päätellään legendan tile-kuvauksesta (`WATER`, `MOUNTAIN`,
`FOREST.deciduous`, `… with PALM` jne.), joten merkit voi vaihtaa vapaasti.
Määre `decor` legendarivin lopussa merkitsee palan koristeeksi (esim.
kraken): se piirretään kartalle, mutta sitä ei listata selitteeseen.
Tulostus-välilehden *Selitteessä*-valinnat asettavat saman määreen.

### Alueet (`areas:`)

- `- x,y size LxK as NIMI`: suorakulmio ruutuina (0,0 vasen yläkulma).
  Saman nimen rivit muodostavat yhdisteen.
- Ruutu kuuluu kaikkiin alueisiin, joihin se osuu. Alue A on alueen B
  vanhempi, jos kaikki B:n ruudut ovat A:ssa ja A on suurempi (pienin
  tällainen). Taso = vanhempien määrä.
- Ruudun tarkin alue on pienin sen sisältävä; tasatilanteessa myöhemmin
  määritelty. Editorin tilarivi näyttää polun, esim. *Norsusaari › Vaaravuori*.
- Osittaisesta päällekkäisyydestä varoitetaan; vanhempaa ei silloin synny.
- Saman alueen rajaukset yhdistetään automaattisesti: toisen sisään jäävä
  suorakulmio poistetaan, ja kaksi suorakulmiota, joiden yhdiste on
  suorakulmio (sama rivi- tai sarakeväli, päällekkäin tai vierekkäin),
  yhdistetään yhdeksi.

### Piirto-ohjeet (`labels paper`)

`- level N | NIMI` ja valinnaisesti `size N`, `spacing wide|normal`,
`place land|water|center`, `at x,y`, `hide`, `outline dotted`.
Oletus < tasosääntö < nimisääntö. `land` sijoittaa nimen alueen maaruutujen
painopisteeseen, `water` syvimpään kohtaan; piirtäjä siirtää nimeä, jos se
osuisi toiseen nimeen, selitteeseen tai vuoriin.

### Tekstit (`text fi`)

`- NIMI "Näkyvä teksti"`; lainausmerkit ovat vapaaehtoisia. Ilman tekstiä
näytetään tunniste muokattuna (`SYNKKA_SYVA` → *Synkka syva*).

Vanha `labels:`-osio (`- x,y TEKSTI size N`) luetaan edelleen ja muunnetaan
yhden ruudun alueiksi.

## Rakenne

```
index.html          käyttöliittymä
css/app.css
src/rlml.js         RLML-tiedoston luku ja kirjoitus
src/font.js         päätteellinen kursiivi viivafontti
src/areas.js        alueet: yhdisteet, hierarkia, tarkistukset
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
