#!/usr/bin/env python3
"""Fetch statutory accounts filings for one or more companies from the public
Companies House website (no API key), for finance ingestion.

Why it exists: Claude work sessions cannot reach Companies House (the egress
allowlist blocks it), so the GitHub Actions workflow `finance-fetch.yml` runs
this in the cloud and uploads the files as a run artifact. The session then
fetches that branch with git and does extraction/OCR there.

It only reads the "accounts" category of each company's filing history and
downloads the original documents. It writes nothing to the database.

Output (per company) under --out:
  <company>/<made_up_to>_<transaction_id>.pdf    (and .xhtml when iXBRL exists)
  <company>/manifest.json   one entry per filing: filed date, type,
                            description, made-up date, source URLs,
                            retrieved_at, bytes and SHA-256 of each document.

Usage:
  python3 scripts/finance_fetch_companies_house.py --out work/ch \
      --company 01989823:2020 --company 00054222:2020
  (":2020" = keep filings made up to a date in 2020 or later)
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://find-and-update.company-information.service.gov.uk"
UA = "FixtureShark finance ingestion (https://fixtureshark.com; GitHub Actions)"
MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"], start=1)}
ABBR = {k[:3]: v for k, v in MONTHS.items()}


def get(url: str, tries: int = 4) -> tuple[bytes, str, str]:
    """GET with retries. Returns (body, final_url, content_type)."""
    last: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read(), r.geturl(), r.headers.get("Content-Type", "")
        except (urllib.error.URLError, TimeoutError) as e:  # 429/5xx/network
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"GET failed after {tries} tries: {url}: {last}")


def parse_date(text: str) -> str | None:
    """'31 May 2024' / '24 Feb 2025' -> '2024-05-31'."""
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text)
    if not m:
        return None
    mon = MONTHS.get(m.group(2)) or ABBR.get(m.group(2)[:3])
    if not mon:
        return None
    return dt.date(int(m.group(3)), mon, int(m.group(1))).isoformat()


def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def list_filings(company: str, debug_dir: Path) -> list[dict]:
    rows: list[dict] = []
    for page in range(1, 20):
        url = f"{BASE}/company/{company}/filing-history?category=accounts&page={page}"
        body, _, _ = get(url)
        text = body.decode("utf-8", "replace")
        table = re.search(r'<table[^>]*id="fhTable".*?</table>', text, re.S)
        if not table:
            if page == 1:  # page layout changed: keep the HTML for diagnosis
                (debug_dir / "filing-history-page1.html").write_text(text)
                print(f"::warning::{company}: no filing table found; page saved")
            break
        found = 0
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table.group(0), re.S):
            tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            if len(tds) < 3:
                continue
            links = re.findall(r'href="(/company/[^"]+/filing-history/([^/"]+)/document\?format=([a-z]+)[^"]*)"', tr)
            if not links:
                continue
            desc = strip_tags(tds[2])
            found += 1
            ftype = strip_tags(tds[1])
            # The site does not always honour ?category=accounts (26 Oct 2026:
            # every filing came back), so keep accounts types explicitly:
            # AA = annual accounts, AAMD = amended accounts.
            if ftype not in ("AA", "AAMD"):
                continue
            rows.append({
                "company_number": company,
                "filed_date": parse_date(strip_tags(tds[0])),
                "filing_type": strip_tags(tds[1]),
                "description": desc,
                "made_up_to": parse_date(desc.split("made up to", 1)[-1]) if "made up to" in desc else None,
                "transaction_id": links[0][1],
                "documents": {fmt: BASE + html.unescape(href) for href, _, fmt in links},
            })
        if found == 0 or 'class="pager-next"' not in text and f"page={page + 1}" not in text:
            break
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--company", action="append", required=True,
                    help="COMPANY_NUMBER[:FROM_YEAR], repeatable")
    args = ap.parse_args()
    out = Path(args.out)
    failures = 0
    for spec in args.company:
        company, _, from_year = spec.partition(":")
        company = company.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{8}", company):
            print(f"::error::bad company number {company!r}")
            return 2
        min_year = int(from_year) if from_year else 0
        cdir = out / company
        cdir.mkdir(parents=True, exist_ok=True)
        manifest = []
        for f in list_filings(company, cdir):
            if f["made_up_to"] and int(f["made_up_to"][:4]) < min_year:
                continue
            if not f["made_up_to"] and f["filed_date"] and int(f["filed_date"][:4]) < min_year:
                continue
            f["files"] = []
            for fmt, url in f["documents"].items():
                ext = {"pdf": "pdf", "xhtml": "xhtml", "zip": "zip"}.get(fmt, fmt)
                try:
                    body, final, ctype = get(url)
                except RuntimeError as e:
                    print(f"::warning::{e}")
                    failures += 1
                    continue
                name = f"{f['made_up_to'] or f['filed_date']}_{f['transaction_id']}.{ext}"
                (cdir / name).write_bytes(body)
                f["files"].append({
                    "format": fmt, "file": name, "source_url": url,
                    # signed S3 query strings expire; keep only the stable part
                    "resolved_url": final.split("?", 1)[0],
                    "content_type": ctype, "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                })
                time.sleep(0.6)  # be polite to Companies House
            manifest.append(f)
        (cdir / "manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"{company}: {len(manifest)} accounts filings, "
              f"{sum(len(m['files']) for m in manifest)} documents")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
