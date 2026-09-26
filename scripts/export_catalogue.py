#!/usr/bin/env python3
# ============================================================================
# scripts/export_catalogue.py
#
# Writes docs/catalogue.md from public.meta_flow_nodes: every live table, view
# and function with its layer, status, whether the public site / an AI tool may
# use it, what it's for and how it's refreshed.
#
# The database is the source of truth (edit entries on the Data Flow page or
# with an UPDATE); this file is the reviewable, diffable copy. It runs in the
# weekly "Export database definitions" workflow, so a changed description
# shows up in the same PR as the changed definition.
#
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY. For a local dry run:
#   python scripts/export_catalogue.py --from-json nodes.json
# ============================================================================

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "catalogue.md"

LAYER_ORDER = ["source", "pipeline", "model", "fantasy", "finance", "broadcast",
               "api", "ai_lab", "helper", "admin", "meta", "scratch"]
LAYER_BLURB = {
    "source": "Raw and reference data as it arrives: results, fixtures, FPL, teams, leagues.",
    "pipeline": "Jobs, run logs and intermediate objects that move data between layers.",
    "model": "Dixon-Coles match model, its fits, predictions, scorecards and inputs.",
    "fantasy": "FPL data and FixtureShark's FPL projections.",
    "finance": "Club accounts from Companies House filings: raw facts, mapped metrics and the published views the finance pages read.",
    "broadcast": "UK TV/streaming listings for the Watch Guide.",
    "api": "Functions and views the site calls to render pages.",
    "ai_lab": "AI Lab: the benchmark questions and grading helpers. Admin-only; never readable by the AI under test.",
    "helper": "Triggers and small utilities.",
    "admin": "Admin-only checks, audits and tools.",
    "meta": "This catalogue and the schema-export machinery.",
    "scratch": "Backups, superseded versions and unused objects: do not build on these.",
}


def load(args) -> list[dict]:
    if args.from_json:
        return json.loads(Path(args.from_json).read_text(encoding="utf-8"))
    from supabase import create_client
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
    sb = create_client(url, key)
    rows, start = [], 0
    while True:
        page = (sb.table("meta_flow_nodes")
                .select("node_key,kind,layer,status,is_public,ai_relevant,purpose,refresh_note,purpose_reviewed_at")
                .eq("is_present", True).order("node_key").range(start, start + 999).execute().data or [])
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def cell(text) -> str:
    return (text or "").replace("|", "\\|").replace("\n", " ").strip()


def flag(v) -> str:
    return "yes" if v else ("no" if v is False else "?")


def render(rows: list[dict]) -> str:
    rows = [r for r in rows if r.get("node_key")]
    total = len(rows)
    documented = sum(1 for r in rows if (r.get("purpose") or "").strip())
    ai = sum(1 for r in rows if r.get("ai_relevant"))
    lines = [
        "# FixtureShark data catalogue",
        "",
        "Generated from `public.meta_flow_nodes` by `scripts/export_catalogue.py`. "
        "**Do not edit here**: change entries in the database (Data Flow page, or an UPDATE); "
        "the weekly export brings this file back in line.",
        "",
        f"{total} live objects, {documented} documented, {ai} marked usable by AI tools. "
        "Objects whose definition changes after their entry was reviewed appear in "
        "`meta_catalogue_gaps` and as the `catalogue_current` warning in the daily integrity run.",
        "",
        "Columns: **Status** current / superseded / experimental / unused. **Public**: the public site reads it. "
        "**AI**: may back a read-only AI Lab tool. Methodology for the models is in `docs/methodology/`.",
        "",
    ]
    by_layer: dict[str, list[dict]] = {}
    for r in rows:
        by_layer.setdefault(r.get("layer") or "unassigned", []).append(r)
    order = [l for l in LAYER_ORDER if l in by_layer] + sorted(l for l in by_layer if l not in LAYER_ORDER)
    lines.append("## Contents\n")
    for layer in order:
        lines.append(f"- [{layer}](#{layer}) ({len(by_layer[layer])})")
    lines.append("")
    for layer in order:
        lines += [f"## {layer}", ""]
        if layer in LAYER_BLURB:
            lines += [LAYER_BLURB[layer], ""]
        lines += ["| Object | Kind | Status | Public | AI | Purpose | Refresh |",
                  "|---|---|---|---|---|---|---|"]
        for r in sorted(by_layer[layer], key=lambda r: (r["node_key"].startswith("function:"), r["node_key"])):
            name = r["node_key"].split(":", 1)[1]
            kind = r.get("kind") or ("function" if r["node_key"].startswith("function:") else "")
            lines.append(f"| `{cell(name)}` | {kind} | {r.get('status') or '?'} | {flag(r.get('is_public'))} | "
                         f"{flag(r.get('ai_relevant'))} | {cell(r.get('purpose'))} | {cell(r.get('refresh_note'))} |")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--from-json", help="render from a JSON list of meta_flow_nodes rows instead of the database")
    args = p.parse_args()
    rows = load(args)
    if not rows:
        sys.exit("No catalogue rows returned -- refusing to overwrite docs/catalogue.md.")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(rows), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(OUT.parent.parent)}: {len(rows)} objects "
          f"({datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC).")


if __name__ == "__main__":
    main()
