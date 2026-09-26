#!/usr/bin/env python3
# ============================================================================
# scripts/export_db_definitions.py
#
# Writes every live view and function in the public schema to
# supabase/definitions/<kind>/<name>.sql, one file per object, from
# export_schema_definitions() (service-role only).
#
# Why: much of the model -- including the whole FPL projection chain -- was
# built directly in the database and never recorded in migrations, so a bad
# edit couldn't be rolled back and nobody could diff what changed. This
# makes the live definitions reviewable in git; run weekly, the PR it opens
# is also a drift report (any live change never committed shows up there).
#
# Files for objects that no longer exist are removed, so drops show too.
# Requires SUPABASE_URL and SUPABASE_SERVICE_KEY.
# ============================================================================

import os
import re
import sys
from pathlib import Path

from supabase import create_client

OUT = Path(__file__).resolve().parent.parent / "supabase" / "definitions"
FOLDERS = {"view": "views", "materialized_view": "materialized_views", "function": "functions"}


def file_name(name: str) -> str:
    # "get_player_by_slug(p_slug text)" -> "get_player_by_slug__p_slug_text.sql";
    # arguments stay in the name so overloads get separate files.
    base, _, args = name.partition("(")
    args = re.sub(r"[^A-Za-z0-9]+", "_", args.rstrip(")")).strip("_")
    return f"{base}__{args}.sql" if args else f"{base}.sql"


def main() -> None:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
    rows = create_client(url, key).rpc("export_schema_definitions").execute().data or []
    if not rows:
        sys.exit("Export returned nothing -- refusing to delete every definition file.")

    written: set[Path] = set()
    for r in rows:
        folder = OUT / FOLDERS[r["kind"]]
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / file_name(r["name"])
        header = f"-- Live definition exported from the database ({r['kind']} {r['name']}).\n-- Do not edit here: change it with a migration; the next export will reflect it.\n\n"
        path.write_text(header + r["definition"].rstrip() + "\n", encoding="utf-8")
        written.add(path)

    removed = 0
    for folder in FOLDERS.values():
        for path in (OUT / folder).glob("*.sql") if (OUT / folder).exists() else []:
            if path not in written:
                path.unlink()
                removed += 1
    counts = {k: sum(1 for r in rows if r["kind"] == k) for k in FOLDERS}
    print(f"Exported {len(rows)} definitions {counts}; removed {removed} stale file(s).")


if __name__ == "__main__":
    main()
