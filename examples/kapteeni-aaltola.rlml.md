# Kapteeni Aaltolan kartat

> RLML 0.3 -karttaformaatti (luku 8). Piirros on koodilohkossa, yksi merkki on yksi ruutu,
> ja legend kertoo merkin tilen, entiteetit (`with`) ja nimiön (`as`).
> Kartat yhdistetään nimiöillä: TO_-alkuiset ruudut vievät toiselle kartalle,
> ja FROM_-alkuiset ovat saapumiskohtia.

game KAPTEENI_AALTOLA start DECK at START

## Meriskorpionin kansi

map DECK size 32x15

```
                                
                                
  rrrrrrrrrrrrrrrrrrrr          
  rWWYWWW.xx...n...n..r         
  rW,,,,W...........b..rr       
  rV,,,,V.w...j..........r      
  rW,,,,W.............b...r     
  rW,,,,D....m..>..m....g..r    
  rW,,,,W.................r     
  rV,,,,V................r      
  rW,,,,W...b.b......x.rr       
  rWWWYWW..n....n.xx..r         
  rrrrrrrrrrr=rrrrrrrr          
             =                  
             <                  
```

legend:
- ' ' SEA
- r RAIL
- W HULL
- V HULL.window
- Y HULL.lantern
- . DECK
- , CABIN
- D DOOR
- x CRATE
- w HELM
- = GANGPLANK
- < GANGPLANK.end as TO_CAVE
- > HATCH as TO_HOLD
- m DECK with MAST
- b DECK with BARREL
- n DECK with CANNON
- j DECK with GEM
- g DECK with GOLD

at:
- 9,7 as START
- 17,7 as FROM_HOLD
- 13,13 as FROM_CAVE
- 5,5 with MAP_TABLE
- 6,5 with CREW.CARTOGRAPHER
- 7,4 with GOBLET
- 4,7 with CHEST
- 6,9 with KEY
- 17,6 with CREW.MATE
- 11,8 with CREW.CLEANER
- 24,8 with CREW.LOOKOUT
- 21,9 with ANCHOR

vars:
- OUTDOOR true
- EDGE SEA

## Meriskorpionin ruuma

map HOLD size 22x9

```
WWWoWWYWoWWWWoWWWWWWWW
W..n....n....n...W.jgW
Wx..............bW..gW
Wxx..............W...W
W^.......b.......L..uW
Wxx..............W...W
Y.............xx.W..cW
W..n....n....n...W.g.W
WWWoWWWWoWWYWoWWWWWWWW
```

legend:
- W HULL
- o HULL.port
- Y HULL.lantern
- . DECK
- x CRATE
- L DOOR.locked
- ^ LADDER as TO_DECK
- n DECK with CANNON
- b DECK with BARREL
- j DECK with GEM
- g DECK with GOLD
- u DECK with GOBLET
- c DECK with CHEST

at:
- 2,4 as FROM_DECK
- 7,3 with CREW.COOK
- 8,6 with CREW.REPAIRER

vars:
- EDGE HULL

## Luola

map CAVE size 20x20

```
####################
#...#.....T#.....u.#
#...#.###..D..P..P.#
#...D.#R#..#..g....#
##.##.#.#..####L####
#.k...#.#..#P....P.#
#.T####.#..#..H....#
#.......#..#...>.c.#
###M###.#..TP....P.#
#k....#.#..#########
#.R...D.#.......j..#
#.....#.####.#####.#
###D###......#R..#.#
#.....##.###.#...L.#
#..H..#....#.#.c.#.#
#.P.P.T....#.##.##.#
#.....#.M..#....g..#
##R####....######D##
#....g.....T....j..O
####################
```

legend:
- # WALL
- M WALL.moss
- R WALL.ornament
- T WALL.torch
- D DOOR
- L DOOR.locked
- O CAVE_MOUTH as TO_SHIP
- . FLOOR
- > STAIR.down as TO_DEEP
- H FLOOR with HIMMELI
- P FLOOR with PILLAR
- k FLOOR with KEY
- g FLOOR with GOLD
- j FLOOR with GEM
- u FLOOR with GOBLET
- c FLOOR with CHEST

at:
- 18,18 as FROM_SHIP
- 15,6 as FROM_DEEP

vars:
- EDGE WALL

## Luolan alin kerros

map CAVE.DEEP size 20x16

```
####################
#<..#.....T#....g..#
#...#.###..D.P..P..#
#...M.#k#..#.......#
##.##.#.#..###M#.###
#.....#.#..#...#...#
#.T####.#..#.j.D...#
#.......#..#...#.u.#
###.#####..#####...#
#.....M.........#RR#
#.R..P....P.....LHAR
#.....M.........#RR#
#..j....c.......####
#....T......M......#
#..g...........T...#
####################
```

legend:
- # WALL
- M WALL.moss
- R WALL.ornament
- T WALL.torch
- D DOOR
- L DOOR.locked
- . FLOOR
- < STAIR.up as TO_UP
- H FLOOR with HIMMELI
- A FLOOR with AMULET
- P FLOOR with PILLAR
- k FLOOR with KEY
- g FLOOR with GOLD
- j FLOOR with GEM
- u FLOOR with GOBLET
- c FLOOR with CHEST

at:
- 2,1 as FROM_ABOVE

vars:
- EDGE WALL
