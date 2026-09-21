# Beat the Shark

A five-minute football management game. FixtureShark's model predicts where
*Your Team* finishes before a ball is kicked; the player's job is to prove it
wrong.

This folder is deployed as **its own Netlify site**, separate from the
analytics site, and served on the main domain at `/play/beat-the-shark/`
through a proxy. The two can never break each other.

```
games/beat-the-shark/
  index.html            the whole game — self-contained, no build step
  netlify.toml          this site's deploy config
  test/season_sim.cjs   plays full seasons of the real game code, headless
  test/checks.cjs       integrity, stability and balance checks
```

---

## One-time setup

### 1. Create the game's Netlify site

In the Netlify dashboard: **Add new site → Import an existing project →
GitHub → `sharkey1982/football-data-webapp`**, then set:

| Setting | Value |
|---|---|
| Base directory | `games/beat-the-shark` |
| Build command | *(leave empty)* |
| Publish directory | `games/beat-the-shark` |

It will only redeploy when this folder changes (see the `ignore` rule in
`netlify.toml`).

### 2. Switch on the `/play` proxy

In the **root** `netlify.toml`, uncomment the `[[redirects]]` block at the
bottom and replace `GAME-SITE-NAME` with the new site's Netlify subdomain.
The game then appears at `/play/beat-the-shark/` on the main site.

---

## Testing

```
node games/beat-the-shark/test/checks.cjs
```

About five seconds, no dependencies. It also runs automatically in GitHub
Actions (`.github/workflows/game-checks.yml`) on any push touching this
folder.

| Group | What it checks |
|---|---|
| Integrity | Every event in every role renders with no `undefined`, `NaN` or `[object` text, and none throws |
| Stability | 540 full seasons complete without a crash, under best, worst and no-decision play |
| Balance | The design targets below still hold |

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

Most changes are writing — event text, headlines, outcomes. About two-thirds
of the script is prose, interleaved with the engine, which is why a wording
change can break it. Run the checks after every change.

**Tuning values** live near the top of the script:

- `TIERS` — the five rival clubs, their strengths and names
- `FORMATIONS` — attack/defence trade-off per shape
- `DELAY_AMP`, `NOISE` — how hard delayed consequences land, and how
  uncertain immediate effects are

If you change these, the balance checks will tell you whether the design
still holds.

### A future improvement

Splitting the event text out of `index.html` into a separate content file
would let most changes be made without touching engine code at all. Worth
doing before the event library grows much further.

---

## Design rules

- **Deterministic and seeded.** Same seed, same season. No `Math.random()`
  in anything that affects the outcome, or leaderboards become impossible.
- **No AI decides anything.** Every outcome comes from the engine.
- **No real people portrayed.** Club names are nods; no real person or
  company is given actions or words.
