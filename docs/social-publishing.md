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
- Automatic publishing is on since 20 Oct 2026 (Chris's approval; migration
  `20261020210000_social_autopublish.sql`) for the types in
  `auto_post_types`. It uses the same gate as a manual post. See "Automatic
  posting" below.
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
4. **Automatic publishing**: live 20 Oct 2026 (see "Automatic posting").

## Automatic posting (Phase 4, live 20 Oct 2026; posting plan 21 Oct 2026)

The weekly plan Chris agreed on 21 Oct 2026 (artifact "FixtureShark Posting
Plan"; wording and times there are the reference until he changes them).
Detectors run hourly (pg_cron `social-detect-candidates`, :25), and the
gameweek report calls them as soon as it publishes. A candidate with
`source_data.post_after` is not posted before that time.

| Post | Detector | When it goes |
|---|---|---|
| Overnight FPL price changes | `social_detect_price_changes` (06:00–12:00 UK): today's prices v yesterday's last snapshot. Old → new price and ownership, rises first, the rest counted | ~1h after FPL's morning refresh, only on days prices changed |
| Availability | `social_detect_availability` (Tue–Fri, made 11:00–16:00 UK): new FPL flags (Out / Doubt / Back) since the last availability post, or yesterday, for players owned by 1%+ or in the projected top 50. Not on the deadline day | 12:30 UK |
| Market watch | `social_detect_market` (made 19:00–21:00 UK): the gameweek's three most bought and sold (net), from today's FPL snapshot. Not in the 24h after a deadline, nor on Premier League match days (Chris, 25 Oct 2026). Price calls are in the separate late-evening post below (FPL's own predictor, 26 Oct 2026). Record watch (31 Oct 2026, `private.social_transfer_record_line`): for the gameweek's most-bought player by gross transfers in, compared with `fpl_transfer_record_check()` (the highest single-gameweek transfers in we hold, 2021/22 on, so worded "the most in a gameweek in our records (since 2021/22 ...)", never an all-time record): already past it; "on course" when the pace since the previous day's snapshot reaches it by the deadline (deadline within 48h, already 50%+); else, within 48h and 60%+, the share reached and hours left. To fit 280 the bought/sold lists shrink to two then one name; if still too long, no line | 20:00 UK |
| FPL price watch | Not automatic yet: not in `auto_post_types`, so a draft for Chris. `social_detect_price_watch` (made 22:00–23:59 UK, after the 21:47 UTC FPL refresh): players owned by 5%+ that FPL's own price predictor has past the line (+-100%, `get_price_change_risk` outlook `expected`), so expected to change overnight. Says it is FPL's estimate, not ours, and adds the predictor's record over the last 28 nights (`get_price_predictor_record`) once 7+ nights are held. Rises then falls, most owned first; least-owned names dropped to fit 280. Nothing qualifying: no post | Same evening; expires 23:55 UK |
| Captaincy top five | `social_detect_captaincy`: top five by projected points, plus the top two's blank chance from the newest preview once it has it | 24h before the deadline (the newest ranking replaces older queued ones) |
| Gameweek preview / reflection thread | `social_detect_gameweek_threads`: newest published report's `x_thread`. The reflection is provisional the night the gameweek ends | ~1h after the detector sees it. Links are removed, except the preview's first post, which carries the week's one link |
| Reflection correction | `social_detect_gameweek_threads`, kind `reflection_correction`: the confirmed version's `x_correction` (a captaincy score that bonus changed), as a reply to the posted provisional thread (`reply_to_x_id`) | ~1h after the confirmed version |
| Gameweek team-news update | `social_detect_gameweek_threads`, kind `preview_update`: the preview's `x_update`. Team-news day: the day before a deadline earlier than 17:00 (from 16:00), or the deadline day for an evening deadline (from 12:00). Once per gameweek, no link | ~1h after the detector sees it; expires at the deadline |
| The week ahead | `social_detect_outlook`: whether the next gameweek is normal (Saturday deadline, games Saturday to Monday, everyone once) or what is different; cup and European games for PL teams before it; ties between teams that also meet in the league | 10:00 UK the morning after the previous reflection |
| The week's changes | `social_detect_week_changes` / `social_week_changes_text`: FPL at this deadline v the last (`fpl_deadline_player_state`): price rises and falls, most bought and sold, biggest ownership rise, players ruled out, and a record line when the most-bought player's transfers in beat `fpl_transfer_record_check()`. Reads the `final_call` snapshot (from 31 Oct 2026: pg_cron `fpl-deadline-final-call`, FPL refreshed every minute in the last 3.5 minutes before a deadline, the last one kept) when it exists, else the pre-deadline one (up to an hour early), and then says "by HH:MM". Too long: ownership line, then ruled-out, then (to keep a record line) prices, then the record line go | Deadline + 1h |
| Fixture moved | `social_detect_fixture_moves`: FPL fixture changes (`fpl_fixture_changes`, logged by a trigger on `fpl_fixtures`) at least 30 minutes old, batched. A move to another gameweek says who now blanks or plays twice and names players owned by 5%+; a new date in the same gameweek is posted within three weeks of its deadline; time-only changes are logged, not posted | ~1h after the detector sees it |
| Match-day predictions | Retired 25 Oct 2026 (it told readers nothing new): the daily market view is the one match post. `social_detect_match_predictions` is kept but no longer run | — |
| Daily market view | `social_detect_daily_market` (07:00-11:59, any day): Premier League, Championship, League One, League Two and National League games with both a market price (`fixture_market_latest`) and a pre-kick-off prediction from an accepted fit (`private.social_daily_games`). Leads with the biggest model-v-market gap (5+ points; games with a promoted-team estimated rating left out), worded as an observation, never a tip; then the market overview: strong favourites (65%+, or the three biggest when none), coin flips (no side above 40%); then yesterday's review of the thread we posted, once every listed result is in. Posts nothing when there is no gap of 8+ points and no review (25 Oct 2026: every post carries one thing the reader didn't know). Automatic from 25 Oct 2026, except (28 Oct 2026, Chris: "run these mismatch posts by me first") a post that leads with a model-v-market gap: that stays a draft, Chris is emailed once (social-notify kind `draft`) and approves it on /admin/social. The featured game shows its kick-off and, when confirmed, its UK channel | 09:00, or two hours before the first kick-off if earlier (not before 08:00) |
| Line-ups v our model | Recorded privately, not posted (25 Oct 2026: "the model needs to show it is half decent first"; first slot: model 71/88 starters, "same XI as last league game" 70/88). Every slot goes into `social_lineup_checks`: starters the model expected, starters the naive last-league-game guess got, and each expected starter left out with a reason from our data (flagged at the deadline, flagged since, started a cup/European game in the previous 5 days, didn't start the last league game, or none in our data). A post is made only when `social_settings.lineup_posts_enabled`; it states who we expected, never "biggest surprise". `social_detect_lineups`, every 5 minutes via `social_lineups_tick` (cron `social-lineups`), kick-off + 8 to + 45 minutes for each Premier League kick-off slot: starters from FPL live data (`fpl_live_elements.explain` minutes for that fixture; the 11 with most minutes, once every team in the slot has 11) v the model's XI (the 11 highest start probabilities in the pre-deadline snapshot, `fpl_deadline_player_horizon`). Opener: starters expected, the biggest surprise (a 60%+ starter owned by 5%+ left out, most owned first; else the least expected starter), games with both XIs as expected in one line; then a post per other game: per team, surprise starters (chance we gave) and those left out (chance, ownership 5%+) | Queued 5 minutes after it is made; expires kick-off + 60 |
| Team news | Not automatic yet: not in `auto_post_types`, so each one is a draft for Chris (first real one: GW9, Sat 31 Oct 12:30, Chelsea v Man Utd). Facts only: no model, no odds, no tips, no "surprise". Per Premier League kick-off slot, once FPL live data shows 11 starters per team, one list (Chris, 26 Oct: keep it simple): "Team news, <game or HH:MM games>. Not starting, from the FPL players owned by 10%+ of managers:" then each player with club, ownership and FPL's official status now ("available", or FPL's note such as "hip injury, 75% chance"). Most owned first, up to 6; not those already out at the deadline (injured, suspended, unavailable or 0%). Too long: status dropped, then the least-owned names. Slot skipped if nobody qualifies. Doubts starting and cup-start reasons stay in source_data only. `social_detect_team_news` / `social_team_news_facts`, in `social_lineups_tick` (every 5 minutes) | Kick-off + 5 to + 45 minutes (waits up to + 25 for every team's XI); held 5 minutes when automatic; expires kick-off + 60 |
| Quiz and answer | **Off since 28 Oct 2026** (Chris: "pretty rubbish"): out of `auto_post_types` and the hourly detector run until a better format is agreed; answers to a question already posted still go. `social_detect_quiz`: Wednesday (not a match day), a question about a closed Premier League season (`private.social_history_facts`: most goals, fewest conceded, most draws, most away wins, biggest win; a tie gives no question; never repeated). The answer is a reply to the posted question | Question 12:00, answer 18:00 |
| Did you know | `social_detect_fact`: Tuesday from history; Thursday from this season (`private.social_pl_facts`) only when every PL game that kicked off 6+ hours ago has its confirmed result (`social_pl_results_fresh`), otherwise history. Not on match days | 11:00 |
| Prediction accuracy | `social_detect_accuracy`: right results, the betting favourite's record, best call, biggest surprise, season so far. Checks this gameweek's predictions came from accepted fits made before kick-off (until 25 Oct 2026 it waited for the whole integrity run to pass) | ~1h after it is created |

Team xG changes and record streaks stay manual.

### Opening lines and the hook A/B test (5 Nov 2026)

The five automatic types no longer open with a label ("FPL GW9 captaincy:
FixtureShark projected points"). A BEFORE INSERT trigger on
`social_post_candidates` (`social_hook_before_insert` →
`private.social_hook_apply`, migration `20261105120000_social_hook_ab_test.sql`)
swaps the first line of the first post for the single most surprising or
useful fact in that post's own data. No detector body was changed.

| Type | Facts, in priority order (first that holds) |
|---|---|
| Captaincy | a £7.0m-or-less second pick within 0.2 points of a £10m+ leader; top two within 0.2; a £6.5m-or-less second or third pick behind a £10m+ leader; leader 1.0+ points clear. To fit 280 the fifth-ranked line goes, then the blank-chance line |
| Week's changes | a record line; the most sold player is also ruled out; most sold or most bought (whichever is bigger). The line the hook restates goes |
| Week ahead | teams playing twice; teams not playing; a Friday deadline; a midweek gameweek; 6+ PL teams in cup/European games before it; 10+ days since the last gameweek |
| Fixture moved | teams now playing twice; now blanking; new time; postponed; new date; new gameweek |
| Preview / reflection thread | from `scripts/fpl_gameweek_report.py` (`preview_hooks`, `reflection_hooks`, payload `x_hooks`): another captain likelier than the projection leader to outscore the other seven; the leader's chance under 25%; a team expected to score 2.5+; 5+ teams on three days' rest. Reflection: goals 4+ away from expected (with the verdict's reading of chances v finishing); the premium captain on 3 or fewer with the best captain 6+ more. The team-news update and the reflection correction keep their openers |

Two styles: **A data-first** (a statement of the fact) and **B
question-first** (a short honest question the data answers). Every hook must
pass `private.social_hook_ok` (no betting or hype words, no "!", no emoji but
the thread marker) and both styles must fit 280 with the rest of the post;
otherwise the label stays (`hook_style` null, `hook_skip` says why). The hook
sets `generated_text` too, so the "no new numbers" check holds. A hook error
never blocks a post.

`source_data` records `hook_style`, `hook_text`, `hook_alt` (the other
style), `hook_fact`, `hook_label` (the old first line), `hook_slot` and
`hook_test`.

**Assignment:** alternating per new candidate within each post type, by slot
(one gameweek of captaincy rankings, one thread kind per gameweek, otherwise
one candidate), so a re-made ranking keeps its gameweek's style. Week's
changes and week ahead start on B, the rest on A.

**Window and result:** `private.social_hook_test` (one row): started at the
merge on 5 Nov 2026, `ends_at` 00:00 UK Thu 19 Nov (14 days, 5–18 Nov). The
first candidate after that calls `private.social_hook_decide()`: the style
with the higher average impressions (latest read of the first post of each
thread, posts published in the window) becomes `default_style` for every
post; with no read post on one side there is no winner and A is used. Both
admin emails' X section shows "Hook test (day N of 14): data-first X posts,
avg Y impressions; question-first X posts, avg Z." (`private.social_hook_test_line`)
while it runs, then the result and the style in use for 7 days. To change the
style or extend the test, a migration updates `private.social_hook_test`.

- **Queue:** `private.social_auto_queue()` approves a passing candidate of an
  automatic type (approved_by null, `auto` true), sets `hold_until`, and
  supersedes older queued ones with the same type, kind and expiry.
- **Hold:** default 60 minutes (`hold_minutes`). When the hold starts,
  `social-notify` emails the admin (Resend; `RESEND_API_KEY` secret). The
  email has the text, the time and a link here. **Hold** on the card stops it
  (`social_hold`); **Release** lets it go.
- **Worker:** pg_cron `social-auto-tick` every 10 minutes
  (`social_auto_tick()`):
  - queues new candidates and sends due emails;
  - posts at most one due candidate, 07:00–24:00 UK (midnight since 21 Oct 2026, for the Monday-night reflection), by calling `x-publish`
    with the worker token (`private.social_worker`, checked with
    `social_worker_ok`);
  - revalidates first: a candidate that is no longer true goes stale, and a
    newer one replaces it.
- **Threads:** `thread` holds the posts. `x-publish` posts them as replies.
  A thread counts as one post for the daily and monthly limits and is costed
  per post.
- **Links:** `allow_urls` on, `max_links_per_week` 1 (UK week).
- **Circuit breaker:** these switch automatic posting off
  (`breaker_tripped_at`) and email the admin:
  - an automatic post that failed;
  - an automatic post whose outcome is unknown;
  - a thread that stopped part-way;
  - a post stuck 'publishing' for 15 minutes.

  Reset with **Reset and resume** on this page. Manual posting is unaffected.
- **Budget:** $5 a month, 160 posts a month (120 from 21 Oct, 160 from 25 Oct 2026), 8 a day (5 from 20 Oct; 8 from 25 Oct 2026 for line-up posts on busy Saturdays), 60 minutes apart.

## Engagement (from 25 Oct 2026)

Chris, 25 Oct 2026: every post should tell readers something new, and post
types that don't land get dropped. To decide that from data:

- **`x-metrics`** (Edge Function, `verify_jwt` off; worker token or an admin
  JWT): reads every post published in the last 30 days (each post of a
  thread), newest first, at most 300 a run, 100 ids per `GET /2/tweets`. It
  asks for `public_metrics,non_public_metrics,organic_metrics` (our own posts,
  user-context token, under 30 days old) and falls back to `public_metrics`
  if X refuses (400/403). Deleted posts come back as errors and count as
  missing. Tokens are refreshed exactly as in `x-publish`.
- **Schedule (from 4 Nov 2026):** pg_cron `social-x-metrics` daily at 18:55
  UK (`55 17,18 * * *`, `private.social_metrics_daily_tick`; only the run in
  the London 18:00 hour reads), scope `daily`: the first post of each thread
  published in the last 7 days, so the 19:25 admin digest has fresh figures.
  `social-x-metrics-weekly`, Monday 07:40 UTC, scope `weekly`: one settled
  read of every post of each thread published 7 to 14 days ago. From 5 Nov
  2026, scope `overnight` at 07:20 UK (`admin-morning-prep-tick`,
  `20 6,7 * * *`, London hour 7 only): the first post of each thread
  published in the last 12 hours (~1-2 posts a night), so the 07:30 admin
  overnight email has fresh figures for overnight posts. "Read from X
  now" on /admin/social still reads every post of the last 30 days.
- **Cost:** X bills owned reads per post, about $0.001; each run logs its
  estimate in `social_metrics_runs.estimated_cost_usd`. At ~19 posts a week:
  daily ~$0.60 a month, weekly ~$0.15 a month, overnight ~$0.05 a month:
  about $0.80 in all (Chris's limit: about $1 a month). Not counted against the $5 posting budget.
- **Tables:** `social_post_metrics` (one row per post per read: impressions,
  likes, replies, reposts, quotes, bookmarks, link and profile clicks, raw
  `metrics` jsonb); `social_metrics_runs` (one row per run). Admin read only.
- **Report:** `social_metrics_report()` (admin only), shown as "Engagement" on
  /admin/social: per post type the posts, median views, median engagements
  and engagement rate (engagements / views), plus the five best and worst
  posts by rate (20+ views). It uses each post's latest read and leaves out
  posts under 24 hours old at that read. A thread counts once: the views of
  its first post, engagements summed over all its posts.

## Replies (from 5 Nov 2026)

Chris, 31 Oct 2026: post less, reply more. Approved 5 Nov 2026. Migration
`20261105200000_social_replies.sql`, Edge Function `x-replies`.

X refuses automated replies to accounts that have not mentioned or engaged
with us (our earlier API replies to big accounts were blocked). So there are
two paths:

**1. Reply ideas (Chris posts them himself).** pg_cron `social-reply-ideas`
runs hourly at :40 and calls `x-replies` (kind `ideas`) only in the London
hours in `social_settings.reply_ideas_hours` (default `{17}`: 17:40 UK, before
the 19:25 email).

- Accounts: `social_reply_accounts` (seeded: OfficialFPL, PremierLeague,
  OptaJoe, FFScout, FPLGeneral, BenCrellin, LetsTalk_FPL, FPLFocal). A handle
  is checked once with `GET /2/users/by` before its first read; one X does not
  know is switched off (`active` false, `note` says why). To add one:
  a migration inserts a row; to drop one, set `active` false.
- One `GET /2/tweets/search/recent` a run: the active accounts' own posts (no
  replies or reposts) with FPL or stats words, since the last read, at most 10.
- `private.social_reply_facts(text)` finds the players (web or full name,
  whole word), teams and topics (captaincy, price changes) a post names and
  returns what our data says about each as full sentences with their page:
  FPL price, ownership and season points; our GW projection and its rank;
  FPL's injury flag; FPL's price predictor when 50%+ of the way; the team's
  next Premier League game and our expected-goals forecast; our top three
  projected captains; the predictor's 90%+ players.
- Claude (`claude-haiku-4-5`, ~$0.003 a draft, not X money) drafts a reply
  from those sentences only and scores how much it adds (0-10).
  `public.social_reply_check` enforces the house rules: under 280 (a link
  counts 23), every number in the facts, at most one link and only a fact's
  fixtureshark.com page, no @ or #, no betting or hype words, emoji or "!".
  A draft that fails twice falls back to a plain sentence-and-link template.
- At most `reply_ideas_per_day` (3) a London day, score 5+, are stored in
  `social_reply_ideas` (status `suggested`), with the facts offered and used,
  the post link and a one-tap link
  `https://x.com/intent/post?in_reply_to=<id>&text=<draft>`.
- Posted: while an idea is open, the next read also reads our own timeline
  (owned reads, at most 10) and marks an idea `posted` when one of our posts
  replies to it. Ideas not posted within 3 days become `ignored`.
- **Intent links on phones** (reported by other tools, e.g. pounce.so's help
  page, Nov 2026; not yet tried on Chris's phone): the X web intent opens the
  composer in the X app on iPhone and the reply goes in the thread. X's
  Android app drops the `in_reply_to` part (it posts a new post), so the emails also give the post
  link: open it, tap Reply, paste the draft. Either way the X app must be
  signed in as **@FixtureSharkHQ**, not Chris's own account: the intent posts
  as whichever account is active.

**2. Mentions (X allows replying to these).** pg_cron `social-mentions`
every 3 hours at :10 UTC (`x-replies` kind `mentions`):
`GET /2/users/:id/mentions` since the last read, 5 a page, up to 4 pages, with
the authors. Each mention goes into `social_mentions` with a category: our
own; spam (spam words in the post or bio); bot (account under 14 days old with
under 5 followers); not worth it (only a tag, link or emoji); otherwise
Claude decides question, comment, spam, abuse, bot or not worth it, and drafts
a reply for a question or comment from the facts for the mention and, when it
replies to one of our posts, that post (no link: a post with a link costs
$0.200 v $0.015). `public.social_mention_candidate` checks it and makes a
`social_post_candidates` row: `post_type` `mention_reply`, `in_reply_to_x_id`
the mention, the mention and facts in `source_data`, the "Replying to @x"
line in its checks (shown on the /admin/social card), expires 48 hours after
the mention. Chris gets the draft email (social-notify kind `draft`, now with
who wrote what and a link), approves and presses Publish on
[/admin/social](https://fixtureshark.com/admin/social?show=queue). `x-publish`
posts it as a reply to `in_reply_to_x_id` (and refuses a mention reply
without one).

- `social_settings.auto_mention_replies` (**off**): when on, and automatic
  posting is on, a mention reply is queued as an automatic post instead
  (approved, `hold_until` = now + `hold_minutes`), so the normal hold email
  and Hold button apply and `social_auto_tick` posts it.
- Limits: mention replies count against `max_replies_per_day` (5) and go at
  least 5 minutes apart; they do not use up the posts' daily or monthly
  limits or the 60-minute gap (`private.social_limit_reasons(cost, url,
  post_type)`). Spend and the $5 budget count everything.

**3. Quote posts (not automated).** X allows quote posts of anyone's post by
the API. If wanted later: the reply-ideas pipeline already finds a post and
checks a draft; a quote would be a candidate with `quote_tweet_id` (POST
/2/tweets `quote_tweet_id`) through the normal approval, counted as a post
($0.015, or $0.200 with a link) against the post limits. Keep them rare and
only when our number adds something; Chris approves each.

**Emails.** Both admin emails (19:25 and 07:30) have "Reply ideas" and
"Mentions" after the X section (`private.admin_reply_sections`, called from
`private.admin_digest`): each open idea from the last 36 hours (author, time,
snippet, post link, draft, one-tap link shown as "Reply on X"), ideas posted
in the window, the last read; mentions in the window with their draft's state,
earlier drafts still waiting, what was skipped, the last read and the month's
reply reads.

**Cost.** X pay-per-use: other accounts' posts $0.005 each, owned reads
(mentions, our timeline) $0.001, user objects $0.010, per item returned. Ideas:
10 posts a day = $0.05 (~$1.52 a month); our timeline a few posts a day only
while ideas are open (~$0.05-0.10 a month); handle checks once ($0.08).
Mentions: what is returned, with authors ~$0.011 each (a few cents a month).
`social_settings.reply_reads_budget_usd` ($1.50) caps all of it
(`public.social_reply_budget`, checked before every read with the run's worst
case): the ideas read keeps pace with the month (allowance to tomorrow) and
leaves $0.06 for mentions, so on a 31-day month an ideas read may be skipped
on a day or two; nothing reads once posts + metric reads + these would pass
`monthly_budget_usd` ($5). Each run's estimate is in
`social_reply_runs.estimated_cost_usd` (and Claude's in `llm_cost_usd`).

**Settings** (by migration; not on /admin/social yet): `reply_ideas_enabled`,
`reply_ideas_hours`, `reply_ideas_per_day`, `mentions_enabled`,
`auto_mention_replies`, `max_replies_per_day`, `reply_reads_budget_usd`. A
second daily read (e.g. `{8,17}`) doubles the ideas cost to ~$3 a month.

**Tables** (admin read only): `social_reply_accounts`, `social_reply_runs`,
`social_reply_ideas`, `social_mentions`. If a later migration rewrites the
`social_post_candidates_post_type_check` list, keep `mention_reply` in it.

## Future content

NFL, tennis, Beat the Shark blackjack and poker challenges: add a post type
(check constraint), a detector function returning
`{status, checks, candidate_id}`, a revalidation branch and a label in
`src/lib/socialApi.ts`. `sport` is already a column.

### Gameweek schedule (from GW9, 2026/27)

- **Reflection:** provisional on the night the gameweek's last match ends (workflow `gameweek-report.yml`, 21:20, 22:20 and 22:50 UTC: `--auto --only reflection`), 2h15m after the last kick-off, before FPL confirms bonus. The FPL points are refreshed first (`private.refresh_fpl_current_event()`). A confirmed version follows once FPL confirms bonus and the closing prices are in (at most 44 hours after the last kick-off); if bonus changed a captaincy score the thread gave, X gets one reply.
- **Preview:** first version on Friday morning when the deadline is Saturday or Sunday, otherwise the day before the deadline. Its X thread carries the week's one link.
- **Team-news update:** extra pipeline runs (Friday 16:11 UTC; Tuesday and Friday 12:11 UTC for evening deadlines) refresh the preview after the press conferences; the refresh compares the day's first version with the latest (`team_news_thread`) and, if anything changed, queues a short linkless thread: what changed, then the captaincy numbers now.
- **Midweek cup and European minutes** are not in the database yet, so the preview names teams on short rest but cannot yet say who played 90 minutes on Wednesday.

### Cup and European lineups

`cup_lineup_players`: who started, came on and went off in cup and European games for PL teams. Narrative only (reflection, preview, articles); the projections, start chances and formations never read it (Chris, 21 Oct 2026). Entered from what Chris sends (e.g. BBC line-up screenshots), through a migration.
