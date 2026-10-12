# Social publishing to X (@FixtureSharkHQ)

Controlled posting of FixtureShark insights to X. Built Oct 2026. Admin page:
[/admin/social](https://fixtureshark.com/admin/social).

## Rules

- Nothing is posted because a data job finished. A detector writes
  **candidates**; a person approves them; in Phase 3 a person presses
  **Publish** on one approved candidate.
- Every number in a post comes from `source_data`, saved with the candidate.
  An edit may reword but may not add a number that is not in the generated
  text (checked in the database, `social_review`).
- Data checks run when the candidate is made, again on approval and again at
  publish (`private.social_revalidate`). Stale or inconsistent data is
  rejected, and the reason is kept in `social_detector_runs`.
- Live posting needs all of: kill switch **off**, live publishing **on**,
  X connected **as @FixtureSharkHQ** (username and pinned X user id), an
  approved, unexpired candidate that still passes revalidation, and the
  limits below. All enforced in `social_claim_for_publish`.
- Automatic publishing cannot be switched on (`social_update_settings`
  refuses it). Phase 4 needs its own reviewed migration and Chris's approval.
- Existing ingestion and model jobs are only read, never changed.

## Pieces

| Piece | What it does |
|---|---|
| `supabase/migrations/20261012210000_social_publishing.sql` | Tables, RLS (admin read only, writes through functions), detectors, revalidation, review/publish gates, token storage, weekly report view, detector schedule |
| `social_post_candidates` | Post type, text, generated text, source data, model version, snapshot time, validation, approval, publication status, X post id |
| `social_publish_attempts` | Every dry run and live attempt; spend and rate limits are counted from here |
| `social_audit_log` | Append-only (a trigger blocks update/delete) |
| `social_detector_runs` | Each run, each detector, every check, including rejections |
| `social_fixture_forecast_obs` | Team goal forecast history (`fixtures` only keeps the latest value) |
| `social_x_connection` | Which account is connected; no secrets |
| Vault secret `x_oauth_fixturesharkhq` | Access and refresh token (encrypted) |
| `private.social_oauth_states` | PKCE verifier per state hash; single use, 10 minutes |
| Edge Function `x-oauth-start` | Admin only. Makes state + PKCE (S256) and returns X's authorise URL |
| Edge Function `x-oauth-callback` | X redirects here. Checks state, exchanges the code, checks scopes and account, stores tokens, redirects to /admin/social |
| Edge Function `x-publish` | Admin only. `dry_run` (never touches tokens or X) or `live` (one post) |
| pg_cron `social-detect-candidates` | 01:25, 07:25, 13:25, 19:25 UTC: `social_run_detectors()`. Writes candidates only |

## Detectors and their checks

**FPL captaincy** (`fpl_captaincy`). Runs 72h to 3h before the next deadline.
Source: `fpl_player_projections`, latest model version (as the gameweek
report does), baseline scenario, summed over the gameweek (double gameweeks
count both). Top five available (`status = 'a'`) players with price.
Checks: every gameweek fixture mapped; projections for every fixture, one per
player per fixture, under 30h old; FPL data refreshed in the last 12h; last
projection run succeeded; FPL team → FixtureShark team mapping consistent;
players' expected goals add up to the team forecast (market goals, else
Dixon-Coles) within 0.05 for every team and fixture; ranked players play in
their projected fixtures. A new top three supersedes pending ones; at
publish, the top three, model version, deadline, prices, statuses and
rounded points must be unchanged. Expires at the deadline.

**Team xG change** (`team_xg_change`). Each run records market-rated and
Dixon-Coles goals for the next three gameweeks' fixtures (a row only on
change). A candidate needs a market-rated forecast that moved by at least
0.30 goals and 20% against the same fixture's forecast from 2-8 days ago,
with: same method and model version, same kick-off date (same horizon), no
`model_change_log` entry since, forecast under 36h old, last market goals
run succeeded, player projections reconcile with the new forecast (0.05),
and no post on that fixture in 7 days. Two per run at most. Expires at
kick-off. History starts when this is deployed, so nothing appears for two days.

**Prediction accuracy** (`prediction_accuracy`). The last finished FPL
gameweek. Uses `model_scorecard_matches` (pre-match model probabilities;
market = closing average odds) and base rates from the previous five Premier
League seasons. Checks: every fixture has a confirmed result; every result
scored; one model version; closing odds for every match; at least 8 matches;
latest `model_integrity_checks` run did not fail; scorecard refreshed after
the last kick-off. Reports average log loss (model, market, base rates) and
how often the model's most likely result happened.

**Historical insight** (`historical_insight`). An ongoing Premier League
streak in `history_streaks` (length 5+) that is a club record or among the
five longest of its kind. Checks: every played Premier League fixture has its
result loaded; streak start not truncated; streak runs to the club's latest
match; no Premier League seasons missing inside it. Expires at the club's
next kick-off.

## Limits (defaults; change on /admin/social)

| Setting | Default |
|---|---|
| Kill switch | **On** |
| Live publishing | **Off** |
| Automatic publishing | Off (cannot be enabled yet) |
| Posts per day / month | 3 / 40 |
| Minutes between posts | 60 |
| Monthly budget | $2.00 |
| Links in posts | Off (X charges $0.200 for a post with a URL v $0.015 without) |
| Live attempts per candidate | 2 |

Spend counts posted and unknown-outcome attempts. A live attempt with no
answer from X (timeout, network, X 5xx) becomes **needs check**: it is never
retried automatically, because it may have posted. Check the account, then
press "It posted" (with the post id) or "It did not post".

## X Developer Console

[console.x.com](https://console.x.com). Ideally the developer app belongs to
@FixtureSharkHQ, so billing and the app sit with the brand account. Either
way, only an authorisation by @FixtureSharkHQ is accepted.

- User authentication: OAuth 2.0, type **Web App, Automated App or Bot**
  (confidential client)
- App permissions: **Read and write** (no Direct Messages)
- Callback URI: `https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-oauth-callback`
  (exact match, no trailing slash)
- Website URL: `https://fixtureshark.com`
- Copy the OAuth 2.0 **Client ID** and **Client Secret** (the secret is shown
  once) into Supabase Edge Function secrets `X_CLIENT_ID` and
  `X_CLIENT_SECRET`
- Credits: buy a small amount and set a spending limit for the billing cycle;
  leave auto-recharge off

Scopes requested: `tweet.read tweet.write users.read offline.access`
(post; X requires tweet.read and users.read with it; identify the account;
refresh token). Changing app permissions later means reconnecting.

## Connecting

1. Sign in to X as @FixtureSharkHQ (a private window keeps the personal
   account out of it).
2. In the same browser, sign in to FixtureShark as admin and open
   /admin/social → **Connect @FixtureSharkHQ** → approve on X.
3. Back on /admin/social: "Connected @FixtureSharkHQ". Any other account is
   refused, its tokens revoked, nothing stored.

Disconnect removes the stored tokens. To cut access at X as well, revoke the
app in @FixtureSharkHQ's [connected apps](https://x.com/settings/connected_apps).

## Phases

1. **Candidates only.** Migration merged; detector runs; no credentials.
2. **Review and dry run.** /admin/social: approve, edit, reject, schedule,
   dry run. Dry runs report every reason a live post would be blocked.
3. **One live post.** X app set up, secrets set, account connected; Chris
   turns the kill switch off and live publishing on, approves one candidate,
   presses Publish, then turns the kill switch back on.
4. **Automatic publishing** for validated, pre-approved templates: not built.
   Needs a reviewed migration and Chris's explicit approval. Scheduled times
   are recorded now but nothing publishes them.

## Future content

NFL, tennis, Beat the Shark blackjack and poker challenges: add a post type
(check constraint), a detector function returning
`{status, checks, candidate_id}`, a revalidation branch and a label in
`src/lib/socialApi.ts`. `sport` is already a column.
