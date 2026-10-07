# Beat the Shark: Nations Cup

A mixed national team tennis event across four surfaces. You pick a real
nation, rated by FixtureShark's tennis Elo, and captain it with invented
players. One aim: win the Nations Cup. Money is not scored but has to be
managed, as in the other games. FixtureShark's prediction (how far you should
go) is shown, not scored against. Design: the Claude Docs doc "Beat the Shark:
NFL, World Cup and Davis Cup — design", with Chris's decisions of 6 and 7 Oct
(a mixed team event in place of the Davis Cup; pick your nation, so its real
strength sets the difficulty).

Served at `/play/beat-the-shark/nations-cup/` from the game site, beside the
other games, with the shared picker, core and styles.

```
nations-cup/index.html        markup; scripts in order
nations-cup/data.js           each nation's men's and women's strength by surface
                              (generated: scripts/beat_the_shark_data.py nations-cup)
nations-cup/config.js         every number that decides how the game plays
nations-cup/engine.js         players, line-ups, the match model, the tie, the draw, money, the Shark
nations-cup/content.js        the decisions between ties
nations-cup/ui.js             screens; its last line starts the game
nations-cup/test/checks.cjs   loading, integrity, engine, stability, balance, screens
```

## How it plays

- **Your nation.** Any of the 24 strongest tennis nations with both a men's and
  a women's pair (Russia and Belarus are suspended from ITF team events). The
  seed is the difficulty: the top seed, well captained, wins about two times in
  five; the 8th about one in ten; the 14th a few times in a hundred.
- **The draw.** Sixteen nations, knockout, four seeds placed apart. First round
  on hard, quarter-final on clay, semi-final on grass, final indoors.
- **The squad: three men and three women from twelve.** Ratings on hard, clay
  and grass, doubles skill, hand, style and an appearance fee. The star
  singles players are poor at doubles and dislike left-handers; specialists
  are only good on their surface; the doubles specialists are ordinary in
  singles; some pairs have played together before. The forecast updates as
  you pick. The Shark predicts from the best six of the twelve, picked by
  simulation, so a poor selection costs you.
- **A tie.** Five rubbers, best of three sets, first to three: men's singles,
  women's singles, men's doubles, women's doubles, mixed. Two men and two
  women play, two rubbers each, so you choose who plays the singles (and the
  men's or women's doubles) and who plays the mixed (and the doubles); the
  third man and woman rest. Each rubber's chance and the tie's move as you
  choose. The staff's suggestion is the obvious one (the highest-rated plays
  singles), not the best.
- **Decisions.** The line-up; after the singles, bring a rested player into the
  doubles or the mixed; at one set all in a doubles rubber, target their weaker
  player, attack the net or play your own game; once the tie is decided, play
  out the dead rubbers (the gate) or concede them and rest. Beginner meets one
  new decision per tie. All are pick, then confirm.
- **The match model.** Game by game, set by set (tie-break at 6–6), from the
  rating gap: hold rates move with the gap, fitted so a best-of-three match
  follows Elo. Doubles: the pair's mean of singles level plus doubles skill,
  plus the partnership (a left- and right-hander, two net players, two
  baseliners, played together before). Left-handers cost some players more
  than others. Indoors favours serve and volley. Condition falls with every set
  and comes back between ties and on the bench.
- **Money (£m).** Travel and appearance fees and a chance card before every
  tie, prize money after it, the gate for dead rubbers played out. The
  training block, a practice week on the next surface, a sponsor's launch, a
  left-handed hitting partner, the medical team and the agent move it. In the
  red after a tie, the federation sends a player home (you choose); below
  −£2.5m you are sacked.

## Testing

```
node games/beat-the-shark/nations-cup/test/checks.cjs
```

About three minutes; in GitHub Actions with the other games' checks.
`SEASONS=n` scales the balance runs; `ONLY=45` runs sections 4 and 5.

Balance (100 events per policy, Beginner, 7 Oct 2026):

| Target | Range checked | Measured |
|---|---|---|
| The top seed, well captained, wins it | 30–60% | 44% |
| The 8th seed, well captained, wins it | 5–20% | 10% |
| The six highest-rated, deciding nothing (8th) | under 2/3 of that | 0% |
| The 14th seed: the Shark's title chance | 0.5–10% | 3% |
| Good captaincy goes further (average stage, 8th) | yes | 1.3 v 0.7 |
| A well-run event is sacked | under 2% | 0% |
| Random play (top seed) sends a player home | 10%+ | 12% |

## Real numbers

`scripts/beat_the_shark_data.py nations-cup` writes `data.js` from
`tennis.player_ratings` and `tennis.player_people`: for each nation and tour,
its two best active players (a match in the last year) by overall Elo, each
rated half overall and half surface Elo. It needs `SUPABASE_DB_URL`, or
`--nations-json` with the rows of `TENNIS_SQL` (how the 7 Oct file was made,
from a cloud session). The game draws each nation's strength towards the
average (`STRENGTH_SCALE`), keeping the real order: a team event is closer
than the tours. The tennis data is singles only, so doubles and partnerships
are the game's own rules, and the ending says so.
