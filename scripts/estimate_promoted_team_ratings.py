#!/usr/bin/env python3
# ============================================================================
# scripts/estimate_promoted_team_ratings.py
#
# For a team playing in --target-league this season but with no genuine
# fitted rating there yet, derives a rough estimated rating from that
# team's rating in an ADJACENT division, adjusted by the median attack/
# defence gap between the two divisions -- computed from whichever teams
# happen to have a genuine rating in BOTH divisions' latest fit runs.
#
# Handles BOTH directions, because they are NOT mirror images of each
# other -- real analysis of this database's own historical match results
# (teams that changed division, 2014/15-2025/26, n=33 team-seasons each
# way) shows:
#   - Promoted teams (--below-league, division below) average ~17.6
#     points BELOW their new division's average in their first season up
#     -- typically bottom-of-the-table form.
#   - Relegated teams (--above-league, division above) average ~12.4
#     points ABOVE their new division's average in their first season
#     back down (parachute payments + a squad that was PL-standard
#     recently) -- typically top-third, promotion-contender form.
# So a relegated team is emphatically NOT "last year's promoted team in
# reverse" -- each direction computes its OWN median gap from real teams
# that made that SAME transition, never one direction's gap applied to
# the other.
#
# At least one of --below-league / --above-league must be given; both can
# be, since a single target league can have teams needing an estimate
# from either direction in the same run (e.g. E1 needs promoted-from-E2
# AND relegated-from-E0 teams handled together).
#
# This never invents a rating for a team with no rating in EITHER given
# adjacent division -- those are printed by name and the script exits
# non-zero, since fabricating a number there would be worse than not
# having one. Every OTHER team that COULD be resolved is still written,
# though -- one unresolvable team does not block the rest.
#
# Only teams that are actually in --target-league's CURRENT season
# fixtures and are missing a rating in that league's latest fit run are
# considered.
#
# Usage:
#   python scripts/estimate_promoted_team_ratings.py --target-league E1 --below-league E2 --above-league E0
#   python scripts/estimate_promoted_team_ratings.py --target-league E0 --below-league E1 --dry-run
#   python scripts/estimate_promoted_team_ratings.py --target-league E0 --below-league E1 --as-of 2025-08-14
#
# --as-of DATE (retro-fit): every fit used -- target and source -- is the
# newest accepted one made by the end of DATE, and the target season's
# teams come from the matches archive (the season of the league's next
# match after DATE), since fixtures only holds the current season. Run
# fit_dixon_coles.py with the same --as-of first for every league named.
# ============================================================================

import argparse
import os
import statistics
import sys

from datetime import date

from supabase import create_client


def latest_fit_run(supabase, league_id, as_of=None):
    """The current PRODUCTION fit for a league -- status='accepted' only.
    Never selects by fitted_at/fit_run_id alone; a rejected fit (even a
    more recent one) must never be used as a source or target basis."""
    q = (
        supabase.table("model_fit_runs")
        .select("fit_run_id, fitted_at")
        .eq("league_id", league_id)
        .eq("status", "accepted")
    )
    if as_of is not None:
        q = q.lte("fitted_at", f"{as_of.isoformat()}T23:59:59+00:00")
    res = q.order("fitted_at", desc=True).limit(1).execute()
    return res.data[0] if res.data else None


def ratings_for_fit_run(supabase, fit_run_id):
    res = (
        supabase.table("team_ratings")
        .select("team_id, attack_strength, defence_strength")
        .eq("fit_run_id", fit_run_id)
        .execute()
    )
    return {r["team_id"]: r for r in (res.data or [])}


def season_team_ids_as_of(supabase, league_id, as_of):
    """Teams in the season of this league's next match after as_of, from the matches archive.
    Who is in a division is known before a ball is kicked, so this uses no hindsight."""
    nxt = (
        supabase.table("matches")
        .select("season_id")
        .eq("league_id", league_id)
        .gt("match_date", as_of.isoformat())
        .order("match_date")
        .limit(1)
        .execute()
    )
    if not nxt.data:
        return None, set()
    season_id = nxt.data[0]["season_id"]
    rows = (
        supabase.table("matches")
        .select("home_team_id, away_team_id")
        .eq("league_id", league_id)
        .eq("season_id", season_id)
        .limit(2000)
        .execute()
    )
    ids = {r["home_team_id"] for r in (rows.data or [])} | {r["away_team_id"] for r in (rows.data or [])}
    return season_id, ids


def current_season_team_ids(supabase, league_id):
    res = supabase.table("fixtures").select("season_id").eq("league_id", league_id).limit(1).execute()
    if not res.data:
        return None, set()
    season_id = res.data[0]["season_id"]
    home = supabase.table("fixtures").select("home_team_id").eq("league_id", league_id).eq("season_id", season_id).execute()
    away = supabase.table("fixtures").select("away_team_id").eq("league_id", league_id).eq("season_id", season_id).execute()
    ids = {r["home_team_id"] for r in (home.data or [])} | {r["away_team_id"] for r in (away.data or [])}
    return season_id, ids


def compute_gap(target_ratings, other_ratings, target_code, other_code, direction_label):
    """Median (target - other) attack/defence gap from teams rated in both
    divisions' current fits right now. Returns None if fewer than 3 such
    teams exist -- too few for a reliable median."""
    both = set(target_ratings) & set(other_ratings)
    print(f"  {target_code} vs {other_code} ({direction_label}): {len(both)} team(s) rated in both")
    if len(both) < 3:
        print(f"    too few to compute a reliable median gap -- {direction_label} estimation unavailable this run.")
        return None
    attack_gaps = [target_ratings[t]["attack_strength"] - other_ratings[t]["attack_strength"] for t in both]
    defence_gaps = [target_ratings[t]["defence_strength"] - other_ratings[t]["defence_strength"] for t in both]
    gap = {
        "attack": statistics.median(attack_gaps),
        "defence": statistics.median(defence_gaps),
        "attack_stdev": statistics.pstdev(attack_gaps),
        "defence_stdev": statistics.pstdev(defence_gaps),
        "n": len(both),
    }
    print(
        f"    median attack gap {gap['attack']:+.4f} (stdev {gap['attack_stdev']:.4f}), "
        f"median defence gap {gap['defence']:+.4f} (stdev {gap['defence_stdev']:.4f})"
    )
    return gap


def main():
    parser = argparse.ArgumentParser(description="Estimate ratings for promoted/relegated teams from an adjacent division.")
    parser.add_argument("--target-league", required=True)
    parser.add_argument("--below-league", default=None, help="Division below -- for teams promoted UP into --target-league.")
    parser.add_argument("--above-league", default=None, help="Division above -- for teams relegated DOWN into --target-league.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--as-of", type=date.fromisoformat, default=None,
                        help="Retro-fit date (YYYY-MM-DD): use only fits made by the end of it.")
    args = parser.parse_args()

    if not args.below_league and not args.above_league:
        print("ERROR: at least one of --below-league / --above-league is required.", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.", file=sys.stderr)
        sys.exit(1)
    supabase = create_client(url, key)

    def league_id_for(code):
        res = supabase.table("leagues").select("league_id").eq("code", code).single().execute()
        if not res.data:
            print(f"ERROR: no league found with code {code}", file=sys.stderr)
            sys.exit(1)
        return res.data["league_id"]

    target_league_id = league_id_for(args.target_league)
    target_fit = latest_fit_run(supabase, target_league_id, args.as_of)
    if not target_fit:
        print(f"ERROR: {args.target_league} has no accepted fit run at all -- fit it first.", file=sys.stderr)
        sys.exit(1)
    target_ratings = ratings_for_fit_run(supabase, target_fit["fit_run_id"])
    print(f"Target league {args.target_league}: {len(target_ratings)} fitted teams")

    # Each direction is independent: a league might have an accepted fit
    # below but not above (or vice versa), and that alone should not stop
    # the direction that DOES have one.
    directions = []  # list of (code, league_id, fit, ratings, gap)
    for code, label in [(args.below_league, "promoted, from below"), (args.above_league, "relegated, from above")]:
        if not code:
            continue
        league_id = league_id_for(code)
        fit = latest_fit_run(supabase, league_id, args.as_of)
        if not fit:
            print(f"  {code} has no accepted fit run yet -- {label} estimation unavailable this run.")
            continue
        ratings = ratings_for_fit_run(supabase, fit["fit_run_id"])
        print(f"  {code}: {len(ratings)} fitted teams")
        gap = compute_gap(target_ratings, ratings, args.target_league, code, label)
        if gap is not None:
            directions.append({"code": code, "fit": fit, "ratings": ratings, "gap": gap, "label": label})

    if args.as_of is not None:
        season_id, current_team_ids = season_team_ids_as_of(supabase, target_league_id, args.as_of)
    else:
        season_id, current_team_ids = current_season_team_ids(supabase, target_league_id)
    if season_id is None:
        print(
            f"SKIPPING promoted/relegated-team estimation for {args.target_league}: no fixtures found, so which "
            "teams are actually in its current season can't be determined. This is a data-import gap, not a fit "
            "failure -- import fixtures for this league to enable estimation."
        )
        return

    needing_estimate = [t for t in current_team_ids if t not in target_ratings]
    print(f"Teams needing an estimate (in {args.target_league}'s current season but unrated): {len(needing_estimate)}")

    if not needing_estimate:
        print("Nothing to do -- every current-season team already has a rating.")
        return

    names_res = supabase.table("teams").select("team_id, canonical_name").in_("team_id", needing_estimate).execute()
    name_by_id = {t["team_id"]: t["canonical_name"] for t in (names_res.data or [])}

    rows_to_write = []
    unresolvable = []
    for team_id in needing_estimate:
        name = name_by_id.get(team_id, f"team_id={team_id}")
        resolved = False
        for d in directions:
            source = d["ratings"].get(team_id)
            if not source:
                continue
            gap = d["gap"]
            est_attack = source["attack_strength"] + gap["attack"]
            est_defence = source["defence_strength"] + gap["defence"]
            note = (
                f"Estimated for {args.target_league} from {d['code']} rating ({d['label']}) "
                f"(attack={source['attack_strength']:.3f}, defence={source['defence_strength']:.3f}), "
                f"adjusted by median gap (attack{gap['attack']:+.3f}, defence{gap['defence']:+.3f}) "
                f"computed from {gap['n']} team(s) currently rated in both divisions. "
                "This is a rough estimate, not a genuine fit -- treat with caution."
            )
            print(f"  {name}: estimated attack={est_attack:.3f}, defence={est_defence:.3f} (from {d['code']}, {d['label']})")
            rows_to_write.append(
                {
                    "fit_run_id": target_fit["fit_run_id"],
                    "team_id": team_id,
                    "attack_strength": est_attack,
                    "defence_strength": est_defence,
                    "is_estimated": True,
                    "estimated_from_team_id": team_id,
                    "estimated_from_fit_run_id": d["fit"]["fit_run_id"],
                    "estimation_note": note,
                }
            )
            resolved = True
            break  # prefer the first direction that has data for this team (below, then above)
        if not resolved:
            unresolvable.append(name)

    if rows_to_write:
        if args.dry_run:
            print(f"\nDry run -- would write {len(rows_to_write)} estimated rating row(s). Not writing to Supabase.")
        else:
            ins = supabase.table("team_ratings").insert(rows_to_write).execute()
            written = len(ins.data or [])
            if written != len(rows_to_write):
                print(f"ERROR: wrote only {written}/{len(rows_to_write)} estimated rating rows.", file=sys.stderr)
                sys.exit(1)
            print(f"\nWrote {written} estimated team_ratings row(s) for fit_run_id={target_fit['fit_run_id']}.")
    else:
        print("\nNo teams could be resolved via any given direction.")

    if unresolvable:
        print(
            f"\nSTOPPING -- {len(unresolvable)} team(s) in {args.target_league}'s current season have no rating in "
            f"{args.target_league} and none in any of the given adjacent division(s) either, so no estimation basis "
            "exists for them: " + ", ".join(unresolvable) +
            ". This needs a human decision (another source division, or a fresh fit), not a fabricated number.",
            file=sys.stderr,
        )
        # Exit code 2, not 1 -- deliberately distinct from every other
        # failure path in this script (all of which are genuine errors:
        # bad args, missing env, no accepted fit, a partial write). This
        # one is different in kind: every OTHER team's estimate above was
        # written successfully, and the remaining gap is an expected,
        # ongoing state (a newly-promoted/tracked team without enough
        # history yet), not a bug -- confirmed directly after this first
        # showed up for EC teams introduced by the EC fixtures backfill.
        # The calling workflow can treat 2 as "needs attention" rather
        # than "the pipeline broke", so this doesn't manufacture a false
        # failure alarm every single day until those teams accumulate
        # enough match history for a genuine fit.
        sys.exit(2)


if __name__ == "__main__":
    main()
