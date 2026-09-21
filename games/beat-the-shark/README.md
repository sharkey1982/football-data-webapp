# Beat the Shark

A five-minute football management game. FixtureShark's model predicts where
*Your Team* finishes before a ball is kicked; the player's job is to prove it
wrong.

This folder is deployed as **its own Netlify site**, separate from the
analytics site, and served on the main domain at `/play/beat-the-shark/`
through a proxy. The two can never break each other.

```
games/beat-the-shark/
  index.html            markup and styles only; loads the five scripts below
  config.js             every number that decides how the game plays
  engine.js             seeded RNG, league, fixtures, Monte Carlo, squad, scoring
  content.js            the writing: events, press, calls, headlines, windows
  matchday.js           vidiprinter, half time, classified check, Sports Centre
  ui.js                 screen flow, season plan, ending, start screens
  netlify.toml          this site's deploy config
  test/season_sim.cjs   plays full seasons of the real game code, headless
  test/checks.cjs       loading, integrity, stability and balance checks
```

No build step: the scripts are plain files, loaded in that order. **The order
matters** — each file can use anything declared in the ones before it, and
`ui.js` must come last because its final lines start the game. The loading
check fails with a clear message if the order is ever wrong.

---

## One-time setup

### Already done

- **Netlify site created:** `fixtureshark-beat-the-shark`
  (site ID `680e9cff-077d-4ae4-a71e-2d06419b6f2a`).
- **Proxy switched on** in the root `netlify.toml`, including a redirect
  that adds the trailing slash — without it the game's relative script paths
  resolve to `/play/config.js` and the page loads blank.

### The one remaining step: link the site to GitHub

This has to be done in the Netlify dashboard, because it authorises
Netlify's GitHub app — no API or agent can do it on your behalf.

1. Open <https://app.netlify.com/projects/fixtureshark-beat-the-shark>.
2. **Site configuration → Build & deploy → Link repository.**
3. Choose GitHub → `sharkey1982/football-data-webapp`, branch `main`.
4. Set **Base directory** to `games/beat-the-shark`, leave the build command
   empty, and set **Publish directory** to `games/beat-the-shark`.

The first deploy then runs, and every later push that touches this folder
redeploys it automatically. The game appears at `/play/beat-the-shark/` on
the main site.

## Testing

```
node games/beat-the-shark/test/checks.cjs
```

About five seconds, no dependencies. It also runs automatically in GitHub
Actions (`.github/workflows/game-checks.yml`) on any push touching this
folder.

| Group | What it checks |
|---|---|
| Loading | The script files load in order, run separately as a browser runs them |
| Integrity | Every event in every role renders with no `undefined`, `NaN` or `[object` text, and none throws |
| Stability | 540 full seasons complete without a crash, under best, worst and no-decision play |
| Balance | The design targets below still hold |
| Screens (`test/screens.cjs`) | Whole matches played through the real screens: Your Team on the left, the 3pm results, team sheet and half time, heat map wording, luck, the manager's January budget, keepers, and each decision's win-chance line |

**Balance targets**, set from 2,500-season runs:

| Target | Range checked | Why |
|---|---|---|
| Favourite wins the title | 65–85% | Usually, not always — the probability lesson |
| Well-played manager wins the title | 7–17% | Aim is 10–15%; wider for sampling noise |
| No-decision play scores | 44–57 | The Shark's prediction *is* the no-decision baseline, so this should sit near 50 |
| Good management beats the Shark vs none | +20 points or more | Decisions must matter |
| Manager wins the title more than owner | — | The manager is the most influential chair |

The checks have been verified to fail on a deliberately broken build: a
typo'd variable in event text, and a tuning slip making the top club too
strong. A check that cannot fail is not a check.

To test a modified copy without overwriting the real one:

```
GAME=/path/to/copy.html node games/beat-the-shark/test/checks.cjs
```

---

## Changing the game

| To change… | Edit |
|---|---|
| Event text, headlines, press conferences, calls | `content.js` |
| How strong clubs are, what formations do, how hard consequences land | `config.js` |
| The squad's sixteen players and the transfer market's player types | `engine.js` (`ARCHETYPES`), `content.js` (`TARGET_TYPES`) |
| Match simulation, scoring, the league | `engine.js` |
| What happens on matchday | `matchday.js` |
| Screens, the order of the season, the ending | `ui.js` |

Most changes are writing, and now land in `content.js` alone — so a wording
change can no longer put the engine at risk of a stray brace. Run the checks
after any change; if you touched `config.js`, the balance checks say whether
the design still holds.

### When the split was made

The game was split out of a single 2,000-line file without changing its
behaviour. That was verified, not assumed: 900 seeded seasons across every
role and policy produced **identical** finishing positions before and after.
The same technique — fingerprint the outcomes, refactor, compare — is the
safe way to restructure it again.

### A further step, if the event library grows

`content.js` still holds events as functions, because each one computes its
effects from the club's current state. Turning the simplest of them into
pure data would remove code from the writing entirely. Not worth it yet; the
split already isolates the writing from the engine.

## Design rules

- **Deterministic and seeded.** Same seed, same season. No `Math.random()`
  in anything that affects the outcome, or leaderboards become impossible.
- **No AI decides anything.** Every outcome comes from the engine.
- **No real people portrayed.** Club names are nods; no real person or
  company is given actions or words.
