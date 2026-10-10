# Shark Fantasy

A fictional, persistent football universe with an FPL-style fantasy game on
top. Design and approved rules: project doc `claude/shark-fantasy-design-2026-10-10.md`.

Approved by Chris (10 Oct 2026):
- the rules in design §3, as proposed;
- results revealed live through Sunday afternoon (deadline 12:00, kick-off 15:00);
- the game lives in the Beat the Shark section (listed with the Beat the Shark
  games; pages in the main site, since it needs sign-in);
- identities: originals plus about 10 comic originals; historical figures
  deferred until reviewed.

## Phase 2: offline simulation prototype (this folder's engine)

No database, nothing live. The engine is pure TypeScript in
`src/sharkfantasy/engine/`:

| File | What it does |
|---|---|
| `rng.ts` | seeded, named random streams (no `Math.random`) |
| `params.ts` | every football number, the calibration targets, `ENGINE_VERSION` |
| `names.ts`, `world.ts` | generate 10 clubs × 20 players and their managers from a seed |
| `strength.ts`, `manager.ts` | team strength from the XI; AI managers pick formation and XI (injuries, bans, form, rotation) |
| `match.ts` | the minute-by-minute match: shots, goals, assists, saves, penalties, own goals, cards, injuries, substitutions → the event log; player stats derived from it |
| `scoring.ts` | fantasy scoring v1 and the Shark Rating bonus |
| `season.ts` | fixtures (balanced round-robin), table, Finals Sunday, injuries and bans between rounds |
| `calibrate.ts` | measures over many seasons against the targets |

Run the calibration report (about 25 s):

```
npx tsx scripts/sf/sim-season.ts 40 25
```

It writes `docs/shark-fantasy/calibration.md` and exits non-zero if any
target fails or the same seed doesn't reproduce identical output. Tests:
`src/__tests__/sharkFantasyEngine.test.ts`.

### Observations for Phase 3
- Forwards average fewer fantasy points per appearance than FPL forwards
  (2.5 v 3.6): ours share goals with attacking midfielders and come off the
  bench more. Prices are set from expected points, so this doesn't unbalance
  the game, but forwards may need a bigger share of 90-minute starts.
- Generated names and club names still need the check against real
  footballers and clubs before anything is public (design §10).

## Phase 3a: the game logic and the bots (offline)

Still no database. `src/sharkfantasy/fantasy/` holds the game rules as pure
functions; the database functions in Phase 3b mirror them, and the tests pin
both to the same examples.

| File | What it does |
|---|---|
| `rules.ts` | the approved rules v1 (money in tenths: 1000 = 100.0) |
| `squad.ts` | squad and lineup checks, FPL auto-subs, round score (captain ×2, or the vice) |
| `market.ts` | initial prices (from the projection, within each position's band), weekly form price changes, the half-the-rise selling price, transfers, hits, free transfers banking to 3 |
| `publicview.ts` | everything a manager may see: noisy scouting reports, results, minutes, goals, availability. **The fantasy side reads only this, never the hidden attributes.** |
| `projection.ts` | the Shark's public projection: expected points per player per round, from the public view. Shrinkage fitted on simulated seasons. |
| `bots.ts` | bot managers: optimiser (HiGHS), template, set-and-forget, points-chaser, random |
| `league.ts` | a season of bots played round by round as the live game will run it |

Run the bot test (about 9 minutes for 100 seasons):

```
npx tsx scripts/sf/bots.ts 100
```

It writes `docs/shark-fantasy/bots.md` and exits non-zero if a pass rule
fails. Tests: `src/__tests__/sharkFantasyGame.test.ts`.

## Phase 3b: the database and the round runner

Migration `supabase/migrations/20261010200000_shark_fantasy_schema.sql`: the
`sf` schema (design §2), as for nfl and tennis — raw tables unexposed, the site
reads `public.sf_*` views, every write goes through a function.

- **Hidden:** `sf.worlds`, `sf.player_hidden` and `sf.engine_snapshots` have no
  grant to anon or authenticated at all (not even admins through the API).
- **Prototype flag:** a universe is visible only if `is_public`, or to admins.
  Nothing is public yet.
- **State machine:** a round is `upcoming → open → locked → final`.
  `sf_lock_round` (the deadline) freezes every squad into
  `entry_round_snapshots`, charges hits and rolls free transfers on.
  `sf_commit_round` writes results, events, stats, scores, prices, projections
  and the engine state in one transaction, and refuses unless the round is
  locked and none of its fixtures is final. Re-running either is a no-op.
- **Immutable:** triggers refuse any change to final results, events, stats,
  scores and snapshots (fixes would go through `sf.corrections`).
- **Squad rules in SQL:** `sf.save_team` (behind `sf_save_team` for people and
  `sf_bot_save_team` for bots) checks the squad, lineup, club limit and money
  against `sf.game_rules` with the database clock, and records transfers.
- **Live results:** the views reveal events by match minute after kick-off
  (second half from 15 minutes after the first ends); scores and points at full
  time.

Runner: `src/sharkfantasy/runner.ts`, driven by `scripts/sf/run-round.ts`
(locally with `--psql`, or the service role) and the manually dispatched
workflow `.github/workflows/sf-round.yml`:

```
npx tsx scripts/sf/run-round.ts create  --universe test
npx tsx scripts/sf/run-round.ts season  --universe test     # bots + forced locks, whole season (test universes only)
npx tsx scripts/sf/run-round.ts advance --universe proto    # at the deadline: bots, lock, play
```

End-to-end check against a local Postgres (stub of Supabase's roles and auth):
`scripts/sf/db-check.ts`. It runs a whole season through the database with 24
bots and checks that every bot scores exactly what the same season gives in
memory, then idempotency, immutability, visibility by role, and a signed-in
manager's squad, transfers and hits.
