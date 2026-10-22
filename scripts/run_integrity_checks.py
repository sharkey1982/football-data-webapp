#!/usr/bin/env python3
# ============================================================================
# scripts/run_integrity_checks.py
#
# Runs every integrity check function -- one guard per incident in
# docs/incidents.md -- prints each result and exits 1 if any check failed, so
# the daily workflow goes red instead of a problem sitting unnoticed.
#
# pipeline_runs gets one row per area (integrity_football, integrity_nfl,
# integrity_tennis, integrity_intl, integrity_club_grounds, integrity_gsc,
# integrity_ga, integrity_broadcasts, integrity_jobs) and the combined row
# model_integrity_checks.
# Until 6 Oct only the combined row existed, so a football failure that had
# been red for days hid any new NFL, tennis or international failure. An
# area whose function errors or returns nothing is recorded as failed and the
# other areas still run.
#
# 16 Oct 2026: the checks run over the direct database connection
# (SUPABASE_DB_URL) when it is set. Through the API every call is cut off at
# 8 seconds (statement_timeout of the authenticator role): on 14 and 15 Oct
# check_model_integrity timed out there (57014) and the area reported one
# line, "check_model_integrity_runs", hiding the two real failures inside it
# (played_without_result, no_stuck_runs). The checks take about 3 s warm; the
# limit here is 120 s per area. The API stays as a fallback, and an area's
# error text is now kept in pipeline_runs.error_message.
#
# Also new: area "jobs" (public.check_job_health: failed, stale and stuck
# jobs, registry gaps), plus GitHub workflows compared with
# public.job_registry -- a scheduled workflow missing from the registry, or
# whose latest scheduled run failed, is reported (needs GITHUB_TOKEN with
# actions: read; skipped without it).
#
# 22 Oct 2026 (audit P-02): acknowledgements. The run had been red for 25
# days on known, accepted failures (tennis from the PC), which hid every new
# one. public.integrity_acknowledgements lists (check_name, subject, reason,
# acknowledged_until). An acknowledged failure is reported as a WARNING,
# with its reason, until that date; then it fails again by itself. subject
# null covers the whole check; a subject covers one item of a list check
# such as jobs_stale ("...: a (..); b (..)"), and the check still fails if
# any item in it is not acknowledged. Each area's runtime is logged
# (pipeline_runs started_at/finished_at) and an area slower than
# SLOW_AREA_S warns: check_model_integrity took 10.6 s on 22 Oct against
# "about 3 s" above.
# ============================================================================

from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import time
import urllib.request

AREAS = [
    ("football", "check_model_integrity"),
    ("football_feeds", "check_fixture_feed_names"),  # FixtureDownload names all mapped
    ("nfl", "check_nfl_integrity"),
    ("tennis", "check_tennis_integrity"),        # results imported from Chris's PC
    ("intl", "check_intl_integrity"),
    ("club_grounds", "check_club_grounds"),      # Your Local Clubs; postcodes.io
    ("gsc", "check_gsc_integrity"),              # Search Console import (gsc-import.yml)
    ("ga", "check_ga_integrity"),                # Google Analytics import (ga-import.yml)
    ("broadcasts", "check_broadcast_integrity"), # UK TV research route (docs/broadcast-research.md)
    ("jobs", "check_job_health"),                # every production job (job_registry / job_health)
    ("deadlines", "check_deadline_runs"),        # FPL runs close to each deadline; pg_cron dispatcher (P-01/P-06)
    ("credentials", "check_credentials"),        # expiring keys (credential_expiries), X connection (SEC-13)
]

# Workflows that are not production data jobs and need no registry row.
NOT_JOBS = {"delete-merged-branch", "game-checks", "lab-experiment", "model-experiment", "fpl-evals"}


SLOW_AREA_S = 60  # the per-area statement limit is 120 s


def list_items(detail: str) -> list[str]:
    """Item names of a list check's detail: 'Heading: a (x); b (y)' -> ['a', 'b']."""
    if ": " not in (detail or ""):
        return []
    body = detail.split(": ", 1)[1]
    return [m.group(0) for part in body.split("; ") if (m := re.match(r"[^\s(]+", part.strip()))]


def apply_acknowledgements(rows: list[dict], acks: list[dict], today: dt.date) -> list[dict]:
    """Failed rows covered by an active acknowledgement become warnings."""
    active = [a for a in acks if a["acknowledged_until"] >= today]
    out = []
    for r in rows:
        if r["status"] != "failed":
            out.append(r)
            continue
        mine = [a for a in active if a["check_name"] == r["check_name"]]
        whole = next((a for a in mine if not a.get("subject")), None)
        if whole:
            out.append({**r, "status": "warning",
                        "detail": f"ACKNOWLEDGED until {whole['acknowledged_until']} ({whole['reason']}): {r['detail']}"})
            continue
        subjects = {a["subject"]: a for a in mine if a.get("subject")}
        items = list_items(r["detail"])
        covered = [i for i in items if i in subjects]
        if items and len(covered) == len(items):
            until = min(subjects[i]["acknowledged_until"] for i in covered)
            out.append({**r, "status": "warning",
                        "detail": f"ACKNOWLEDGED until {until} ({'; '.join(f'{i}: ' + subjects[i]['reason'] for i in covered)}): {r['detail']}"})
        elif covered:
            out.append({**r, "found": len(items) - len(covered),
                        "detail": f"{r['detail']} [acknowledged: {', '.join(covered)}]"})
        else:
            out.append(r)
    return out


def acknowledgement_row(acks: list[dict], today: dt.date) -> dict:
    active = [a for a in acks if a["acknowledged_until"] >= today]
    names = ", ".join(f"{a['check_name']}{'/' + a['subject'] if a.get('subject') else ''} until {a['acknowledged_until']}" for a in active)
    return {"check_name": "integrity_acknowledgements", "status": "ok", "found": len(active),
            "detail": "Failures reported as warnings until a date (public.integrity_acknowledgements): " + (names or "none")}


def area_status(rows: list[dict]) -> str:
    if any(r["status"] == "failed" for r in rows):
        return "failed"
    if any(r["status"] == "warning" for r in rows):
        return "warning"
    return "success"


def summarise(rows: list[dict]) -> str:
    failed = [r for r in rows if r["status"] == "failed"]
    warned = [r for r in rows if r["status"] == "warning"]
    text = f"{len(rows)} integrity checks: {len(failed)} failed, {len(warned)} warning"
    if failed or warned:
        text += " -- " + ", ".join(f"{r['check_name']}={r['found']}" for r in failed + warned)
    return text


class Runner:
    """Calls check functions over the direct connection when available, else the API."""

    def __init__(self) -> None:
        self.db = None
        self.sb = None
        url = os.environ.get("SUPABASE_DB_URL")
        if url:
            from db_direct import DirectDB
            self.db = DirectDB(url, statement_timeout_s=120, client_timeout_s=180)
        if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
            from supabase import create_client
            self.sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

    def check(self, fn: str) -> list[dict]:
        if self.db is not None:
            try:
                return self.db.query(f"select check_name, status, found, detail from public.{fn}()", fetch="all") or []
            except Exception as e:  # noqa: BLE001 -- fall back to the API, then report
                print(f"::warning::{fn} over the direct connection failed ({e}); trying the API")
                if self.sb is None:
                    raise
        return self.sb.rpc(fn, {}).execute().data or []

    def query(self, sql: str) -> list[dict]:
        if self.db is not None:
            return self.db.query(sql, fetch="all") or []
        raise RuntimeError("needs SUPABASE_DB_URL")

    def acknowledgements(self) -> list[dict]:
        sql = "select check_name, subject, reason, acknowledged_until from public.integrity_acknowledgements"
        if self.db is not None:
            return self.db.query(sql, fetch="all") or []
        data = self.sb.table("integrity_acknowledgements").select("check_name,subject,reason,acknowledged_until").execute().data or []
        return [{**a, "acknowledged_until": dt.date.fromisoformat(a["acknowledged_until"])} for a in data]

    def log(self, row: dict) -> None:
        if self.db is not None:
            cols = list(row)
            self.db.query(
                f"insert into public.pipeline_runs ({', '.join(cols)}, finished_at) values "
                f"({', '.join(['%s'] * len(cols))}, now()) returning run_id",
                [row[c] for c in cols])
        else:
            row = {k: (v.isoformat() if isinstance(v, dt.datetime) else v) for k, v in row.items()}
            self.sb.table("pipeline_runs").insert({**row, "finished_at": dt.datetime.now(dt.timezone.utc).isoformat()}).execute()


def github_rows(runner: Runner) -> list[dict]:
    """Scheduled GitHub workflows vs job_registry, and their latest scheduled run."""
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo or runner.db is None:
        return [{"check_name": "github_workflows", "status": "ok", "found": 0,
                 "detail": "skipped (needs GITHUB_TOKEN, GITHUB_REPOSITORY and SUPABASE_DB_URL)"}]

    def gh(path: str) -> dict:
        req = urllib.request.Request(f"https://api.github.com/repos/{repo}/{path}",
                                     headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)

    registered = {r["job_key"] for r in runner.query("select job_key from public.job_registry where location = 'github_actions'")}
    unregistered, failing = [], []
    for wf in gh("actions/workflows?per_page=100")["workflows"]:
        name = os.path.splitext(os.path.basename(wf["path"]))[0]
        if wf["state"] != "active" or name in NOT_JOBS or name.startswith("probe"):
            continue
        runs = gh(f"actions/workflows/{wf['id']}/runs?event=schedule&per_page=1").get("workflow_runs", [])
        if not runs:
            continue  # never scheduled: not a scheduled job
        if name not in registered:
            unregistered.append(name)
        last = runs[0]
        # integrity-checks goes red whenever a check fails; those checks are
        # already reported line by line, so its own red run is not repeated.
        if name != "integrity-checks" and last.get("status") == "completed" and last.get("conclusion") not in ("success", "skipped", "neutral"):
            failing.append(f"{name} ({last.get('conclusion')} {last.get('created_at', '')[:16]})")
    return [
        {"check_name": "github_workflows_registered", "status": "warning" if unregistered else "ok",
         "found": len(unregistered), "detail": "Scheduled GitHub workflows not in public.job_registry: " + (", ".join(unregistered) or "none")},
        {"check_name": "github_scheduled_runs_ok", "status": "failed" if failing else "ok",
         "found": len(failing), "detail": "Scheduled GitHub workflows whose latest scheduled run did not succeed: " + (", ".join(failing) or "none")},
    ]


def main() -> None:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    runner = Runner()
    today = dt.datetime.now(dt.timezone.utc).date()
    try:
        acks = runner.acknowledgements()
        ack_error = None
    except Exception as e:  # noqa: BLE001 -- without them every failure stays a failure
        acks, ack_error = [], f"{type(e).__name__}: {e}"[:300]
    all_rows: list[dict] = []
    for area, fn in AREAS:
        error = None
        started = dt.datetime.now(dt.timezone.utc)
        t0 = time.monotonic()
        try:
            rows = runner.check(fn)
            if not rows:
                raise RuntimeError(f"{fn} returned nothing")
        except Exception as e:  # noqa: BLE001 -- one broken area must not hide the others
            error = f"{type(e).__name__}: {e}"[:2000]
            rows = [{"check_name": f"{fn}_runs", "status": "failed", "found": 1, "detail": error[:300]}]
        if area == "jobs":
            try:
                rows += github_rows(runner)
            except Exception as e:  # noqa: BLE001
                rows.append({"check_name": "github_workflows", "status": "warning", "found": 1, "detail": f"GitHub API: {e}"[:300]})
            rows.append(acknowledgement_row(acks, today) if ack_error is None else
                        {"check_name": "integrity_acknowledgements", "status": "warning", "found": 1,
                         "detail": f"Could not read acknowledgements, so none applied: {ack_error}"})
        rows = apply_acknowledgements(rows, acks, today)
        seconds = time.monotonic() - t0
        if seconds > SLOW_AREA_S:
            rows.append({"check_name": f"{fn}_runtime", "status": "warning", "found": round(seconds),
                         "detail": f"{fn} took {seconds:.1f} s (warns above {SLOW_AREA_S} s; the limit is 120 s)"})
        for r in rows:
            mark = {"ok": "ok  ", "warning": "WARN", "failed": "FAIL"}.get(r["status"], r["status"])
            print(f"[{area}] [{mark}] {r['check_name']}: {r['found']} -- {r['detail']}")
            if r["status"] == "failed":
                print(f"::error::{area} {r['check_name']}: {r['found']} -- {r['detail']}")
            elif r["status"] == "warning":
                print(f"::warning::{area} {r['check_name']}: {r['found']} -- {r['detail']}")
        runner.log({"job_name": f"integrity_{area}", "status": area_status(rows),
                    "summary": f"{summarise(rows)} ({seconds:.1f} s)", "error_message": error,
                    "started_at": started})
        all_rows += rows
    summary = summarise(all_rows)
    status = area_status(all_rows)
    runner.log({"job_name": "model_integrity_checks", "status": status, "summary": summary, "error_message": None})
    print(summary)
    sys.exit(1 if status == "failed" else 0)


if __name__ == "__main__":
    main()
