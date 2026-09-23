#!/usr/bin/env python3
# ============================================================================
# scripts/netlify_usage_estimate.py
#
# Estimates Netlify credits used this billing cycle, so running out is a
# visible pipeline warning rather than a suspended site (it happened
# 2026-09-23: the only warnings were emails nobody saw in time).
#
# Netlify has no public API for the credit balance, but every production
# deploy starts from something GitHub records:
#   1. a push to main that changes a site file (the same skip rule as
#      netlify.toml's `ignore`, mirrored in SKIP_PATTERNS below), and
#   2. a workflow run whose "Trigger site rebuild" step called the build hook.
# Each production deploy costs 15 credits. Pushes are counted per
# first-parent commit, so several commits pushed at once count as several:
# an UPPER bound, which is the safe direction for a warning. Bandwidth and
# requests are not visible here -- check the dashboard's daily breakdown.
#
# Usage (Actions or locally, from a full clone with GITHUB_TOKEN set):
#   python scripts/netlify_usage_estimate.py [--log]
#     --log  write a pipeline_runs row (needs SUPABASE_URL/SUPABASE_SERVICE_KEY)
# Exit: 0 ok, 0 + ::warning:: at >= warn, 1 at >= fail.
# ============================================================================

import argparse
import fnmatch
import json
import os
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timezone

REPO = "sharkey1982/football-data-webapp"
HOOK_WORKFLOWS = ["daily-import.yml", "fpl-projections-pipeline.yml"]
HOOK_STEP = "Trigger site rebuild"
# Keep in step with netlify.toml [build] ignore.
SKIP_PATTERNS = ["games/*", "docs/*", "supabase/*", ".github/*", "src/__tests__/*",
                 "scripts/*.py", "scripts/requirements.txt", "*.md"]


def cycle_start(today: date, day: int) -> date:
    if today.day >= day:
        return today.replace(day=day)
    y, m = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    return date(y, m, day)


def is_site_file(path: str) -> bool:
    if path.endswith(".md") and "/" not in path:
        return False
    return not any(fnmatch.fnmatch(path, p) for p in SKIP_PATTERNS if p != "*.md")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def deploying_pushes(since: date, ref: str) -> int:
    commits = git("log", "--first-parent", f"--since={since.isoformat()}T00:00:00Z", "--format=%H", ref).split()
    n = 0
    for c in commits:
        files = git("diff-tree", "--no-commit-id", "--name-only", "-r", "-m", "--first-parent", c).split()
        if any(is_site_file(f) for f in files):
            n += 1
    return n


def gh(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
                                               "Accept": "application/vnd.github+json"})
    return json.load(urllib.request.urlopen(req))


def hook_calls(since: date) -> int:
    n = 0
    for wf in HOOK_WORKFLOWS:
        page = 1
        while True:
            d = gh(f"https://api.github.com/repos/{REPO}/actions/workflows/{wf}/runs"
                   f"?per_page=100&page={page}&created=%3E%3D{since.isoformat()}")
            runs = d.get("workflow_runs", [])
            for r in runs:
                if r["status"] != "completed":
                    continue
                for job in gh(r["jobs_url"]).get("jobs", []):
                    n += sum(1 for s in job.get("steps", []) if s["name"] == HOOK_STEP and s["conclusion"] == "success")
            if len(runs) < 100:
                break
            page += 1
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--allowance", type=int, default=3000, help="Monthly credits (Pro: 3,000)")
    ap.add_argument("--cycle-start-day", type=int, default=10)
    ap.add_argument("--credits-per-deploy", type=int, default=15)
    ap.add_argument("--warn", type=float, default=0.5)
    ap.add_argument("--fail", type=float, default=0.75)
    ap.add_argument("--ref", default="origin/main")
    ap.add_argument("--log", action="store_true")
    a = ap.parse_args()

    today = datetime.now(timezone.utc).date()
    since = cycle_start(today, a.cycle_start_day)
    pushes = deploying_pushes(since, a.ref)
    hooks = hook_calls(since)
    credits = (pushes + hooks) * a.credits_per_deploy
    share = credits / a.allowance
    summary = (f"Netlify deploy credits since {since}: ~{credits} of {a.allowance} ({share:.0%}) -- "
               f"{pushes} site-changing push(es) + {hooks} build-hook rebuild(s), {a.credits_per_deploy} each. "
               f"Upper-bound estimate; excludes bandwidth/requests.")
    print(summary)
    status = "failed" if share >= a.fail else "warning" if share >= a.warn else "success"
    if status == "failed":
        print(f"::error::{summary} Hold non-urgent merges and batch changes; top-ups cost money.")
    elif status == "warning":
        print(f"::warning::{summary}")

    if a.log:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        sb.table("pipeline_runs").insert({"job_name": "netlify_usage_estimate", "status": status,
                                          "summary": summary, "finished_at": "now()"}).execute()
    sys.exit(1 if status == "failed" else 0)


if __name__ == "__main__":
    main()
