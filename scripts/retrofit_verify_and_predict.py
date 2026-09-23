#!/usr/bin/env python3
# ============================================================================
# scripts/retrofit_verify_and_predict.py
#
# Second half of the retro-fit (see .github/workflows/retrofit-season.yml):
#
#   1. VERIFY every as-of date's fit before anything is predicted from it.
#      For each date, the accepted retro-fit must be stamped exactly
#      fitted_at = DATE 23:59:59 UTC with window_end_date = as_of_date = DATE.
#      A wrong stamp would silently break point-in-time selection (a fit
#      serving matches it has already seen), so ANY mismatch stops the run
#      before a single prediction is written. A date with no accepted fit
#      (rejected by the quality gates) is reported, not fatal -- the
#      previous week's fit simply serves those matches.
#   2. PREDICT: public.backfill_match_predictions(league, season), which
#      uses the newest accepted fit with fitted_at::date < match date.
#   3. REPORT coverage: matches in the season vs matches predicted, and
#      which fit dates served them.
#
# Usage:
#   python scripts/retrofit_verify_and_predict.py --league-code E0 --season-id 12 --dates 2025-08-14,2025-08-21
# ============================================================================

import argparse
import os
import sys
from collections import Counter
from datetime import date, datetime, timezone

from supabase import create_client


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league-code", required=True)
    ap.add_argument("--season-id", type=int, required=True)
    ap.add_argument("--dates", required=True, help="Comma-separated as-of dates (YYYY-MM-DD).")
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    league_id = sb.table("leagues").select("league_id").eq("code", args.league_code).single().execute().data["league_id"]
    dates = [date.fromisoformat(d.strip()) for d in args.dates.split(",") if d.strip()]

    fits = (
        sb.table("model_fit_runs")
        .select("fit_run_id, as_of_date, fitted_at, window_end_date, status")
        .eq("league_id", league_id)
        .eq("is_retrofit", True)
        .eq("status", "accepted")
        .in_("as_of_date", [d.isoformat() for d in dates])
        .execute()
        .data
        or []
    )
    by_date = {f["as_of_date"]: f for f in fits}

    missing, bad = [], []
    for d in dates:
        f = by_date.get(d.isoformat())
        if not f:
            missing.append(d.isoformat())
            continue
        expected = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=timezone.utc)
        got = datetime.fromisoformat(f["fitted_at"].replace("Z", "+00:00"))
        if got != expected or f["window_end_date"] != d.isoformat():
            bad.append(f"fit {f['fit_run_id']} as of {d}: fitted_at={f['fitted_at']} window_end={f['window_end_date']}")

    print(f"{args.league_code}: {len(dates)} as-of date(s), {len(by_date)} accepted retro-fit(s) verified")
    if missing:
        print(f"::warning::No accepted {args.league_code} retro-fit for: {', '.join(missing)} -- earlier fits serve those matches")
    if bad:
        print("::error::Retro-fit stamp mismatch -- NOT predicting from these:", file=sys.stderr)
        for b in bad:
            print("  " + b, file=sys.stderr)
        sys.exit(1)
    if not by_date:
        print("::error::No accepted retro-fits at all -- nothing to predict from.", file=sys.stderr)
        sys.exit(1)
    if args.verify_only:
        return

    written = sb.rpc("backfill_match_predictions", {"p_league_id": league_id, "p_season_id": args.season_id}).execute().data
    print(f"backfill_match_predictions wrote {written} prediction(s)")

    matches = (
        sb.table("matches").select("match_id").eq("league_id", league_id).eq("season_id", args.season_id).limit(2000).execute().data
        or []
    )
    ids = [m["match_id"] for m in matches]
    preds = []
    for i in range(0, len(ids), 200):
        preds += sb.table("match_predictions").select("match_id, fit_as_of_date").in_("match_id", ids[i : i + 200]).execute().data or []
    print(f"Coverage: {len(preds)}/{len(ids)} {args.league_code} matches in season {args.season_id} have a prediction")
    for d, n in sorted(Counter(p["fit_as_of_date"] for p in preds).items()):
        print(f"  fit as of {d}: {n} match(es)")
    if len(preds) < len(ids):
        print(f"::warning::{len(ids) - len(preds)} match(es) unpredicted -- a team unrated at the time, or no fit before the match")


if __name__ == "__main__":
    main()
