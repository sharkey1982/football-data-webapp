# Beat the Shark: NFL

The football game's idea, for the NFL. FixtureShark's model predicts how
many games *Your Team* wins in a six-team division; the player's job is to
win more. Design: the Claude Docs doc "Beat the Shark: NFL, World Cup and
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
| Integrity | Every event, in both roles, renders with no `undefined`, `NaN` or `[object` text; every event has a do-nothing choice |
| Engine | About 22 points a team; margin spread near the site's margin curve (sd 13.26); home edge near the Elo model's 1.8 points; 3 and 7 the two commonest margins |
| Stability | 96 seasons across every level, role and policy finish without a crash |
| Balance | The targets below |
| Screens | Every level and role played to the verdict through the real screens; the coach sees a plan, half-time and fourth-down call; the GM sees none of them |

The checks were run against deliberately broken copies: a Shark made too
strong fails the balance checks, and an undefined value in an event's
text fails the integrity check.

**Balance targets** (measured over 150-season runs at Intermediate, with
look-ahead samples reduced for speed):

| Target | Range checked |
|---|---|
| The Stingrays (favourites) win the division | 55–80% |
| A well-played coach beats the Shark | 48–72% (aim: 6 in 10) |
| A well-played coach wins the division | 7–20% |
| Deciding nothing beats the Shark | under 1 in 3 |
| Good calls beat no calls | by 15+ score points |
| The head coach's calls matter more than the GM's | yes |
| Beginner: a well-played coach beats the Shark | 45–75% |

## How it plays

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
- **The GM** runs the cap, contracts and trades; his coach makes the
  best calls himself.
- **The Shark** simulates the season with every team's hidden swing drawn
  afresh each time, the same injuries and knocks, the right game plan, and
  `SHARK_UPLIFT` for a well-run team. Score: 50 for matching its expected
  wins, ±15 a win, +10 for the title.

## Real numbers

`scripts/beat_the_shark_data.py` writes `data.js` from the live Elo model's
home advantage (`scripts/nfl_elo.py`) and the margin curve
(`src/lib/nflMarginShape.ts`). Re-run it when either model is refitted; the
engine checks then say whether `HOME_E` in `config.js` still matches.
