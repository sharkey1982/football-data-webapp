# Beat the Shark: NFL

The football game's idea, for the NFL. One aim: win the division.
FixtureShark's model predicts where *Your Team* finishes; money is not
scored but has to be managed, as in the football game. Design: the Claude Docs doc "Beat the Shark: NFL, World Cup and
Davis Cup — design" (6 Oct 2026; the tennis game is now the Nations Cup).

Served at `/play/beat-the-shark/nfl/`. It is a folder of the existing game
site (`fixtureshark-beat-the-shark`), so it deploys with the football game
and needs no Netlify setup of its own.

```
games/beat-the-shark/
  shared/core.js        seeded RNG, pacing controls, scoring (shared by the new games)
  shared/base.css       the look (copied from the football game's index.html)
  nfl/index.html        markup; loads the scripts below in order
  nfl/data.js           the real numbers (generated: scripts/beat_the_shark_data.py)
  nfl/config.js         every number that decides how the game plays
  nfl/engine.js         division, roster, the drive engine, fourth downs, the Shark
  nfl/content.js        the writing: the week's events, the trade deadline
  nfl/ui.js             screens; its last line starts the game
  nfl/test/checks.cjs   loading, integrity, engine, stability, balance, screens
```

The football game does not use `shared/` yet. Moving it across is a separate
change, proved the way its first split was: hundreds of seeded seasons must
finish identically before and after.

## Testing

```
node games/beat-the-shark/nfl/test/checks.cjs
```

About 35 seconds; runs in GitHub Actions with the football game's checks.
`SEASONS=n` scales the balance runs; `ONLY=45` runs sections 4 and 5.

| Group | What it checks |
|---|---|
| Loading | The scripts load in order and the start screen draws |
| Integrity | Every event renders with no `undefined`, `NaN` or `[object` text, in the black and in the red; every event has a do-nothing choice |
| Engine | About 22 points a team; margin spread near the site's margin curve (sd 13.26); home edge near the Elo model's 1.8 points; 3 and 7 the two commonest margins |
| Stability | 96 seasons across every level and policy finish without a crash |
| Balance | The targets below |
| Screens | Every level played to the verdict through the real screens: bills, gate, game plan, half time, fourth downs, the deadline; in the red, a forced trade; deep in the red, fired |

The checks were run against deliberately broken copies: a Shark made too
strong fails the balance checks, and an undefined value in an event's
text fails the integrity check.

**Balance targets** (150-season runs at Intermediate, look-ahead samples
reduced for speed). The simulated "good coach" picks the best win chance
at every call and keeps the season's projected cash above zero.

| Target | Range checked | Measured |
|---|---|---|
| The Stingrays (favourites) win the division | 55–80% | 71% |
| A well-played coach wins it | 7–20% (aim 10–15%) | 9% (Beginner 13%) |
| Deciding nothing wins it | under half the well-played rate | 1% |
| Good calls finish higher than no calls | by half a place or more | 0.8 |
| A well-played coach is fired | under 2% | 0% |
| Random play is forced into a trade | 10%+ of seasons | 37% |

## How it plays

The opening screen (shared with the football game, `shared/games.js`)
offers only the sports. The NFL starts as the Beginner head coach's
season; Intermediate and Advanced are built and checked but not on the
opening screen (Chris, 6 Oct 2026).

- **Six teams**, each named for how it decides. The Stingrays (strength 74)
  are always the final boss and the last game. Beginner: 5 games, neutral
  venues. Intermediate and Advanced: 10 games, home and away.
- **The drive engine.** About 11 drives a team. Each ends in a touchdown,
  field goal, punt or turnover, from the offence's rating against the
  defence's, mixed by the share of runs. Late and within three, teams play
  for the kick. Overtime is sudden death.
- **The calls (head coach).** Game plan (run-led, balanced, pass-led) against
  a defence weak to one of them; the injury report (start the questionable
  starter at 85%, or rest him); fourth downs (go, kick or punt); half time
  (open it up, stay the course, run the clock); at Advanced, the two-point
  call. Every option shows its win chance, from playing the game out from
  that moment many times with the same random futures for each option.
- **Money ($m)**, as the football game's cash: the payroll and a chance
  card before every game ("Paying the bills"), the gate on the result
  after it. A bid for a player, the sponsor (a shirt deal or a players'
  bonus), the medical budget, a free agent and the priced trade deadline
  all move it. In the red after a game, the owner forces a trade: you
  choose your best player on offence or on defence. Below −$25m you are
  fired. The NFL has no points deductions, so firing is the second
  sanction.
- **The Shark** simulates the season with every team's hidden swing drawn
  afresh each time, the same injuries and knocks, and the right game plan.
  It predicts where Your Team finishes; it is not a score to beat.
- **The ending**, as the football game's: champions or your position,
  FixtureShark's prediction, the table, and what the season showed.

The general manager role built first (6 Oct) was removed the same evening:
one role, as the football game now has one on its opening screen.

## Real numbers

`scripts/beat_the_shark_data.py` writes `data.js` from the live Elo model's
home advantage (`scripts/nfl_elo.py`) and the margin curve
(`src/lib/nflMarginShape.ts`). Re-run it when either model is refitted; the
engine checks then say whether `HOME_E` in `config.js` still matches.
