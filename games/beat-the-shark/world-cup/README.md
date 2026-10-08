# Beat the Shark: World Cup

A five-a-side World Cup. You manage a real nation, rated by FixtureShark's
international Elo, with invented players. One aim: win the World Cup.
Money is not scored but has to be managed, as in the football and NFL
games. FixtureShark's prediction (how far you should go) is shown, not
scored against. Design: the Claude Docs doc "Beat the Shark: NFL, World Cup
and Davis Cup — design", with Chris's 6 Oct decisions (five-a-side, seven
from ten, real nations, invented players).

Served at `/play/beat-the-shark/world-cup/` from the game site, beside the
football and NFL games, with the shared picker, core and styles.

```
world-cup/index.html        markup; scripts in order
world-cup/data.js           IP1's fitted parameters and the 48 strongest nations
                            (generated: scripts/beat_the_shark_data.py world-cup)
world-cup/config.js         every number that decides how the game plays
world-cup/engine.js         pool, squad, shapes, the match, the tournament, money, the Shark
world-cup/content.js        the decisions between matches
world-cup/ui.js             screens; its last line starts the game
world-cup/test/checks.cjs   loading, integrity, engine, stability, balance, screens
```

## How it plays

- **Your nation:** you pick it from all 48, in four tiers by Elo rank
  (Favourites 1–3, Contenders 4–12, Dark horses 13–30, Underdogs 31–48). Its
  real strength is the difficulty (Chris, 7 Oct 2026): with the Shark's squad
  on the Beginner field, Spain win about 41% and reach the semi-final 98%;
  Japan (15th) 12% and 80%; Peru (45th) 2% and 54%. "Surprise me" draws from
  Elo ranks 18–30 as before. Every nation gets the golden generation
  (`GOLDEN`), so good management beats its Elo.
- **The field.** Beginner (the one on the picker): eight nations in two
  groups of four; your group has a stronger side, a similar one and a weaker
  one; the other holds the favourite. Semi-finals and a final: up to five
  matches. Intermediate and Advanced: 48 nations in four Elo pots, twelve
  groups, a round of 32 with the eight best thirds; knockouts reseeded each
  round, best against worst.
- **The squad: seven from ten.** Two keepers (one saves penalties), three
  defenders (one plays midfield), two midfielders (one plays up front), three
  attackers (one a fragile star, short of games). The forecast updates as
  you pick. The Shark predicts from the best seven of the ten, picked by
  simulation, so a poor selection can cost you.
- **Shapes.** Balanced 1-2-1, All out attack 1-1-2, Shut up shop 2-1-1. A
  shape is only as good as the players in its slots; out of position costs
  rating (`OUT_OF_POSITION`). All out attack with two attackers adds about
  half as many goals again; with a defender pushed up, much less.
- **The match.** IP1 on the Elo gap (tournament matches), with the gap
  scaled for five-a-side (`ELO_SCALE`) and goals scaled up
  (`FIVE_A_SIDE_GOALS`). Your side's Elo moves steeply with the five on the
  pitch (`MY_ELO_PER_POINT`). Two halves of 20 minutes; knockouts level go
  to five minutes each way, then penalties (three each, then sudden death).
- **Decisions.** Shape and who starts (tap to swap; fitness and yellow cards
  shown); half time (a shape or fresh legs, each with its win chance);
  penalties (best takers, freshest legs, or the penalty-saving keeper).
  Beginner meets one new decision per match. In-match decisions are pick,
  then confirm.
- **Incidents.** Condition falls with every match and recovers on the bench
  (keepers tire less); yellow cards (two and you miss a match, wiped after
  the groups); injuries and knocks.
- **Money (£m).** Camp costs and a chance card before every match, prize
  money after it, a bonus for every round reached. The base camp, the
  sponsor, a win bonus, the medical team and the press move it. In the red
  after a match, the FA sends a player home (you choose); below −£8m you are
  sacked.

## Testing

```
node games/beat-the-shark/world-cup/test/checks.cjs
```

About two minutes; in GitHub Actions with the other games' checks.
`SEASONS=n` scales the balance runs; `ONLY=45` runs sections 4 and 5.

Balance (150 tournaments at Beginner, 6 Oct 2026):

| Target | Range checked | Measured |
|---|---|---|
| The field's favourite wins | 35–65% | 52–55% |
| A well-picked, well-managed squad wins it | 7–20% | 9–10% |
| The ten highest-rated, deciding nothing | under 2/3 of that | 2–3% |
| Good management goes further (average stage) | yes | 3.0 v 2.2 |
| A well-run campaign is sacked | under 2% | 0% |
| Random play sends a player home | 10%+ | 18–20% |

## Real numbers

`scripts/beat_the_shark_data.py world-cup` writes `data.js` from
`intl.model_info` (IP1) and `intl.team_summary` (the 48 strongest active
FIFA nations, Russia excluded as banned). It needs `SUPABASE_DB_URL`, or
`--nations-json` and `--params-json` files exported from those queries
(how the 6 Oct file was made, from a cloud session).
