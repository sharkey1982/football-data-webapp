#!/usr/bin/env python3
# ============================================================================
# scripts/estimate_promoted_team_ratings.py
#
# For a team playing in --target-league this season but with no genuine
# fitted rating there yet (freshly promoted, zero matches in the fitting
# window), derives a rough estimated rating from that team's rating in
# --source-league (the division below), adjusted by the median attack/
# defence gap between the two divisions -- computed from whichever teams
# happen to have a genuine rating in BOTH divisions' latest fit runs.
#
# This never invents a rating for a team with no source-league rating
# either -- it aborts and names the team, since silently fabricating a
# number there would be worse than not having one.
#
# Only teams that are actually in --target-league's CURRENT season
# fixtures and are missing a rating in that league's latest fit run are
# considered -- not every team that happens to lack a target-league
# rating (most Championship teams, say, simply aren't Premier League
# teams and have no business getting a PL estimate).
#
# Usage:
#   python scripts/estimate_promoted_team_ratings.py --target-league E0 --source-league E1
#   python scripts/estimate_promoted_team_ratings.py --target-league E0 --source-league E1 --dry-run
# ============================================================================

import argparse
import os
import statistics
import sys

from supabase import create_client


def latest_fit_run(supabase, league_id):
    """The current PRODUCTION fit for a league -- status='accepted' only.
    Never selects by fitted_at/fit_run_id alone; a rejected fit (even a
    more recent one) must never be used as a source or target basis."""
    res = (
        supabase.table("model_fit_runs")
        .select("fit_run_id, fitted_at")
        .eq("league_id", league_id)
        .eq("status", "accepted")
        .order("fitted_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def ratings_for_fit_run(supabase, fit_run_id):
    res = (
        supabase.table("team_ratings")
        .select("team_id, attack_strength, defence_strength")
        .eq("fit_run_id", fit_run_id)
        .execute()
    )
    return {r["team_id"]: r for r in (res.data or [])}


def current_season_team_ids(supabase, league_id):
    # The "current season" for a league is whichever season_id its fixtures
    # table has rows for -- fixtures only exist for the season being played.
    res = supabase.table("fixtures").select("season_id").eq("league_id", league_id).limit(1).execute()
    if not res.data:
        return None, set()
    season_id = res.data[0]["season_id"]
    home = supabase.table("fixtures").select("home_team_id").eq("league_id", league_id).eq("season_id", season_id).execute()
    away = supabase.table("fixtures").select("away_team_id").eq("league_id", league_id).eq("season_id", season_id).execute()
    ids = {r["home_team_id"] for r in (home.data or [])} | {r["away_team_id"] for r in (away.data or [])}
    return season_id, ids


def main():
    parser = argparse.ArgumentParser(description="Estimate ratings for promoted teams from the division below.")
    parser.add_argument("--target-league", required=True)
    parser.add_argument("--source-league", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

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
    source_league_id = league_id_for(args.source_league)

    target_fit = latest_fit_run(supabase, target_league_id)
    source_fit = latest_fit_run(supabase, source_league_id)
    if not target_fit:
        print(f"ERROR: {args.target_league} has no fit run at all -- fit it first.", file=sys.stderr)
        sys.exit(1)
    if not source_fit:
        print(f"ERROR: {args.source_league} has no fit run at all -- fit it first.", file=sys.stderr)
        sys.exit(1)

    target_ratings = ratings_for_fit_run(supabase, target_fit["fit_run_id"])
    source_ratings = ratings_for_fit_run(supabase, source_fit["fit_run_id"])

    print(f"Target league {args.target_league}: {len(target_ratings)} fitted teams")
    print(f"Source league {args.source_league}: {len(source_ratings)} fitted teams")

    both = set(target_ratings) & set(source_ratings)
    print(f"Teams with ratings in BOTH leagues: {len(both)}")
    if len(both) < 3:
        print(
            f"ERROR: only {len(both)} team(s) rated in both {args.target_league} and {args.source_league} -- "
            "too few to compute a reliable median gap. Aborting.",
            file=sys.stderr,
        )
        sys.exit(1)

    attack_gaps = [target_ratings[t]["attack_strength"] - source_ratings[t]["attack_strength"] for t in both]
    defence_gaps = [target_ratings[t]["defence_strength"] - source_ratings[t]["defence_strength"] for t in both]
    median_attack_gap = statistics.median(attack_gaps)
    median_defence_gap = statistics.median(defence_gaps)
    print(f"Median attack gap ({args.target_league} - {args.source_league}): {median_attack_gap:.4f}")
    print(f"Median defence gap ({args.target_league} - {args.source_league}): {median_defence_gap:.4f}")
    print(
        f"(derived from {len(both)} team(s): "
        f"attack stdev={statistics.pstdev(attack_gaps):.4f}, defence stdev={statistics.pstdev(defence_gaps):.4f})"
    )

    season_id, current_team_ids = current_season_team_ids(supabase, target_league_id)
    if season_id is None:
        print(
            f"No fixtures found for {args.target_league} -- cannot determine which teams are "
            "actually in this league's current season. Import fixtures first. Aborting.",
            file=sys.stderr,
        )
        sys.exit(1)

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
        source = source_ratings.get(team_id)
        if not source:
            unresolvable.append(name)
            continue
        est_attack = source["attack_strength"] + median_attack_gap
        est_defence = source["defence_strength"] + median_defence_gap
        note = (
            f"Estimated for {args.target_league} from {args.source_league} rating "
            f"(attack={source['attack_strength']:.3f}, defence={source['defence_strength']:.3f}), "
            f"adjusted by median gap (attack{median_attack_gap:+.3f}, defence{median_defence_gap:+.3f}) "
            f"computed from {len(both)} team(s) with ratings in both divisions. "
            "This is a rough estimate, not a genuine fit -- treat with caution."
        )
        print(f"  {name}: estimated attack={est_attack:.3f}, defence={est_defence:.3f}")
        rows_to_write.append(
            {
                "fit_run_id": target_fit["fit_run_id"],
                "team_id": team_id,
                "attack_strength": est_attack,
                "defence_strength": est_defence,
                "is_estimated": True,
                "estimated_from_team_id": team_id,
                "estimated_from_fit_run_id": source_fit["fit_run_id"],
                "estimation_note": note,
            }
        )

    if unresolvable:
        print(
            f"\nSTOPPING -- {len(unresolvable)} team(s) in {args.target_league}'s current season have no rating in "
            f"{args.target_league} AND none in {args.source_league} either, so no estimation basis exists for them: "
            + ", ".join(unresolvable)
            + ". This needs a human decision (which division to source from, or a fresh fit), not a fabricated number.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.dry_run:
        print("\nDry run -- not writing to Supabase.")
        return

    ins = supabase.table("team_ratings").insert(rows_to_write).execute()
    written = len(ins.data or [])
    if written != len(rows_to_write):
        print(f"ERROR: wrote only {written}/{len(rows_to_write)} estimated rating rows.", file=sys.stderr)
        sys.exit(1)
    print(f"\nWrote {written} estimated team_ratings row(s) for fit_run_id={target_fit['fit_run_id']}.")


if __name__ == "__main__":
    main()
