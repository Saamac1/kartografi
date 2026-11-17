# Karttageneraattori

Selainpohjainen työkalu RLML-karttojen muokkaamiseen ja tulostettavien
mustavalkoisten vektorikarttojen (SVG) tekemiseen. Tyyli on vanhan
kaiverretun merikartan kaltainen: rosoinen rantaviiva, vaakaviivoitettu meri
(matalikko tummin), vuoret, kukkulat, havu- ja lehtimetsä, pensaikko, palmut,
joet, aarre ja kraken. Samalla työkalulla piirretään myös luolien ja laivojen
pohjapiirrokset (ks. *Tyylit*).

Pelin kevyempi visualisointi tehdään erikseen; tämä työkalu on paperille.

## Käyttö

Avaa `index.html` selaimessa. Rakennusvaihetta tai palvelinta ei tarvita, ja
tiedostot ovat tavallisia skriptejä, joten `file://` toimii.

- **Selite (vasen):** valitse piirrettävä pala. Sivellinkoko 1–5 ruutua.
  *⧉ Kelluva* irrottaa selitepalkin siirrettäväksi ikkunaksi editorin päälle
  (vedä otsikosta, kulmasta muutat kokoa). Merikartalla *Lisää selitteeseen*
  näyttää oletuspalat, joita kartan legendassa ei vielä ole.
- **Uudet merikartan palat:** rantakallio `C` (`CLIFF`), hiekkaranta `s`
  (`SAND`), rakennukset `h` (`GRASS with HOUSE`), linnan rauniot `R`
  (`GRASS with CASTLE_RUINS`) sekä koristeet luurankoluola `S`
  (`ROCK with SKULL_CAVE`) ja tulivuori `V` (`VOLCANO`). Koristeesta piirretään
  yksi kuva yhtenäistä aluetta kohden, ja kuva kasvaa alueen mukana. Vuoriston
  sisäosan huiput piirretään korkeampina kuin reunojen.
- **Esikatselu seuraa kursoria:** kun kartta on zoomattu niin, ettei se mahdu
  kerralla näkyviin, esikatselu vierittää editorin kursorin kohdan näkyviin
  (punainen ruutu). Esikatselua voi myös siirrellä vetämällä.
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
  tuottavat aina saman kartan. Rannoille tulee yhtenäisinä pätkinä
  rantakallioita (etenkin ylänköjen ja vuorten vierellä) ja hiekkarantoja
  (matalilla rannoilla).
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
sormi piirtää ja kaksi sormea vierittää, ja editorin yläpalkissa ovat Kumoa- ja
Tee uudelleen -painikkeet. Esikatselua ei voi irrottaa omaksi
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
- *Lataa SVG* tallentaa vektorikuvan ja *Lataa PNG* saman kuvan rasterina
  (96, 150 tai 300 dpi, valkoinen pohja). Hyvin suuri kuva pienennetään
  16 megapikseliin, koska puhelinselaimet eivät piirrä isompaa.
- claude.ai-artefaktissa tiedostot tallennetaan claude.ai:n
  tallennusvahvistuksen kautta; *Tulosta…* ja *Irrota ikkunaksi* eivät ole
  siellä käytettävissä (lataa tulostussivu ja tulosta se selaimesta).

## RLML

Työkalu lukee ja kirjoittaa RLML-dataformaattia (`~/rlml/dataformaatit`).
Kartta on kolmessa tiedostossa, koska RLML pitää merkityksen, tekstit ja
ulkoasun erillään:

| tiedosto | sisältö | luku |
|----------|---------|------|
| `NIMI.rlml.md` | kartat: `map`, piirros, `legend:`, alueet `areas:` | 8, 8.11 |
| `NIMI.paper.rlml.md` | paperikartan tyyli: `maps.theme paper`, `tiles.glyphs paper`, `areas.labels paper` | 9.6 |
| `NIMI.fi.rlml.md` | kielitiedosto: kartan ja alueiden näkyvät nimet | 10 |

*Avaa…* hyväksyy yhden tai useamman tiedoston kerralla ja tunnistaa lajin
sisällöstä; karttatiedosto on pakollinen. *Tallenna RLML* tallentaa kaikki
kolme. *RLML-lähde*-välilehdellä voi muokata kutakin tiedostoa erikseen.

````
# KAPTEENI AALTOLAN KARTTA

map MERIKARTTA size 64x44

```
~~~~..^^TT...
```

legend:
- ~ WATER
- . GRASS
- T FOREST.conifer
- K WATER with KRAKEN

areas:
- 8,6 size 26x17 as NORSUSAARI
- 30,3 size 7x6 as NORSUSAARI
- 14,9 size 7x5 as VAARAVUORI
````

```
maps.theme paper
- default sea

tiles.glyphs paper
- KRAKEN decor

areas.labels paper
- level 0 size 11 spacing wide
- SYNKKA_SYVA size 9 place water
- VAARAVUORI outline dotted
```

```
language fi
MERIKARTTA.NAME Kapteeni Aaltolan kartta
MERIKARTTA.NORSUSAARI.NAME Norsusaari
MERIKARTTA.VAARAVUORI.NAME Vaaravuori
```

Vanhat kokeilumuodot (kartan sisäiset `style paper`, `labels paper`,
`tiles paper`, `text fi`, legendin `decor` ja `labels:`) luetaan edelleen
ja tallennetaan uusiin muotoihin.

### Alueet (`areas:`)

- `- x,y size LxK as NIMI`: suorakulmio ruutuina (0,0 vasen yläkulma).
  Saman nimen rivit muodostavat yhdisteen.
- Ruutu kuuluu kaikkiin alueisiin, joihin se osuu. Alue A on alueen B
  vanhempi, jos kaikki B:n ruudut ovat A:ssa ja A on suurempi (pienin
  tällainen). Taso = vanhempien määrä.
- Ruudun tarkin alue on pienin sen sisältävä; tasatilanteessa myöhemmin
  määritelty. Editorin tilarivi näyttää polun, esim. *Norsusaari › Vaaravuori*.
- Osittaisesta päällekkäisyydestä varoitetaan; vanhempaa ei silloin synny.
- Editori yhdistää saman alueen rajaukset: toisen sisään jäävä suorakulmio
  poistetaan, ja kaksi suorakulmiota, joiden yhdiste on suorakulmio,
  yhdistetään yhdeksi.

### Kartan piirtotapa (`maps.theme paper`)

| tapa   | piirto |
|--------|--------|
| `sea`  | merikartta (oletus) |
| `cave` | luola: luonnonseinät rosoisina, rakennetut (`WALL.ornament`, ovet) suorina, kallio viivoitettu seinän vierestä |
| `ship` | laiva: runko umpiviivoitettuna, kansilankut, ympärillä vaakaviivoitettu meri |

Editorin *Tyyli*-valinta kirjoittaa rivin tyylitiedostoon. Jos kartassa on
seinä- tai kansipaloja mutta piirtotapa puuttuu, editori varoittaa.

### Palojen piirto (`tiles.glyphs paper`)

Palan piirto päätellään legendan nimestä (`WALL.moss`, `FLOOR with CHEST`,
`STAIR.down as TO_DEEP`, `HULL.port`…). Rivi `- TILE [LAJI] [määreet] [decor]`
ohittaa päättelyn:

```
tiles.glyphs paper
- WALL.crystal solid straight pattern runes
- FLOOR.bridge floor pattern planks
- MARSH shrubs
- KRAKEN decor
```

Lajit: merikartalla `water`, `grass`, `shrubs`, `conifer`, `deciduous`,
`palm`, `mountain`, `hill`, `river`, `treasure`, `kraken`, `cliff`, `beach`,
`building`, `ruins`, `skullcave`, `volcano`; luolassa ja
laivassa `solid`, `floor`, `void`, `door`, `stairs`, `exit`. Määreet `rough`,
`straight`, `thin`, `pattern planks|boards|gangplank|moss|runes`,
`symbol NIMI`, `locked`, `up`, `down`. `decor` jättää palan pois
selitteestä (Tulostus-välilehden *Selitteessä*-valinnat asettavat sen).
Tunnistamaton pala piirretään lattiana, jonka keskellä on sen merkki.
Poistumat (`as TO_DEEP`) saavat nimen kielitiedoston avaimesta
`KARTTA.TO_DEEP.NAME` tai tunnisteesta.

### Alueiden nimet (`areas.labels paper`)

`- level N` tai `- ALUE [in KARTTA]` ja valinnaisesti `size N` (16 = ruudun
korkeus), `spacing wide|normal`, `place land|water|center`, `at x,y`, `hide`,
`outline dotted`. Oletus < tasosääntö < nimisääntö. `land` sijoittaa nimen
alueen maaruutujen painopisteeseen, `water` syvimpään kohtaan; piirtäjä
siirtää nimeä, jos se osuisi toiseen nimeen, selitteeseen tai vuoriin.
Ilman `in`-määrettä sääntö koskee tiedoston kaikkia karttoja.

### Nimet (kielitiedosto)

`KARTTA.NAME` on kartan otsikko ja `KARTTA.ALUE.NAME` alueen nimi. Ilman
nimeä näytetään tunniste muokattuna (`SYNKKA_SYVA` → *Synkka syva*).
Nimet-välilehdellä niitä muokataan kartta kerrallaan.

## Esimerkit

*Esimerkit*-valikosta avautuvat Kapteeni Aaltolan seikkailun kartat
(Meriskorpionin kansi ja ruuma, luola ja sen alin kerros) sekä merikartta.
Kumpikin on kolmena tiedostona kansiossa `examples/`; valikon sisältö kootaan niistä komennolla
`node tools/build-examples.js`.

## Monta karttaa yhdessä tiedostossa

Tiedosto voi sisältää useita `## Otsikko` + `map`-lohkoja (esim. pelin
kansi, ruuma ja luolat). Editorin *Kartta*-valinnalla vaihdetaan
muokattavaa karttaa, *+ kartta* lisää uuden samalla legendalla, ja
*Tallenna RLML* tallentaa koko tiedoston. Osiot, joita työkalu ei tunne
(`at:`, `vars:`…), säilyvät sellaisinaan.

*Generoi* tekee merikartalle saariston ja luolakartalle luolaston
(soluautomaatti, portaat, aarteet, himmelisali). Laivoille ei ole
generaattoria.

## Rakenne

```
index.html          käyttöliittymä
css/app.css
src/rlml.js         RLML-tiedoston luku ja kirjoitus
src/font.js         päätteellinen kursiivi viivafontti
src/areas.js        alueet: yhdisteet, hierarkia, tarkistukset
src/tiles.js        palojen luokittelu (luola/laiva) ja oletukset
src/renderer.js     merikartta SVG:ksi (yksikkö 16 / ruutu, viivat millimetreinä)
src/dungeon.js      luola- ja laivakartat SVG:ksi
src/generator.js    satunnainen saaristo ja luolasto
src/print.js        arkki- ja lehtijako, tulostus-HTML
src/editor.js       ruudukkoeditori
src/main.js         kytkennät
tests/              yksikkötestit (node --test)
examples/           esimerkkikartat (merikartta, pelin neljä karttaa)
```

## Testit

```
npm test
```

Testit käyttävät Noden omaa testiajuria; riippuvuuksia ei ole.
