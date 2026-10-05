#!/usr/bin/env python3
# ============================================================================
# scripts/tennis_import.py
#
# Tennis results load (design: claude/tennis-design-2026-10-04.md).
#
# Source: tennis-data.co.uk, one workbook per tour per year:
#   ATP  <base>/<folder>/<year>/<year>.xlsx   (from 2000; .xls before 2013)
#   WTA  <base>/<folder>/<year>w/<year>.xlsx  (from 2007)
# <folder> is obscured and may change, so links are read from alldata.php.
# Cloudflare refuses these downloads from cloud machines (GitHub Actions,
# tested 4 Oct 2026), so this runs on Chris's PC, daily via Windows Task
# Scheduler (task "FixtureShark tennis import", --log). If the site refuses
# Python as well, download the files in a browser and point --files-dir at them.
#
# What it does:
#   0. reads every requested tour-year first, repairs blank and wrong-year
#      dates (repair_dates) and maps each source name to one display name
#      across all of them and the database (build_name_map); then per
#      tour-year:
#   1. refuses it if a required column is missing or two rows share a match
#      key (tour|year|tournament|round|winner|loser, display names);
#   2. upserts through public.tennis_upsert_matches (service_role), which
#      creates tournaments, players and name aliases on first sight; a row
#      whose source data is unchanged is not rewritten;
#   3. reconciles against the file: match count, total games and a hash of
#      every match key must equal public.tennis_year_totals. Any difference
#      fails the run and lists the keys that differ.
# One pipeline_runs row (job_name tennis_import) per run; the integrity
# check tennis_fresh warns after 3 days without a successful run.
#
#   python scripts/tennis_import.py --profile            read + report only, no database
#   python scripts/tennis_import.py                      this year (and last year in January)
#   python scripts/tennis_import.py --years 2000-2026    backfill
#   python scripts/tennis_import.py --files-dir "C:\tennis"   use files saved by hand:
#        <dir>\atp\2026.xlsx and <dir>\wta\2026.xlsx
#
# On the PC (once):  py -3 -m pip install pandas openpyxl xlrd supabase
# Scheduled daily with --log, which appends output to
# %LOCALAPPDATA%\fixtureshark\logs\tennis_import.log instead of the console.
# (No .bat or requirements file: anything else in scripts/ would trigger a
# Netlify production build.)
#
# Credentials: SUPABASE_URL and SUPABASE_SERVICE_KEY from the environment or
# from %LOCALAPPDATA%\fixtureshark\tennis.env (KEY=VALUE lines; never in the
# repo). Downloads are cached in %LOCALAPPDATA%\fixtureshark\tennis-cache;
# past years are downloaded once, the current year every run.
# ============================================================================

import argparse
import datetime as dt
import hashlib
import io
import math
import os
import re
import sys
import time
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

BASE_URL = "http://www.tennis-data.co.uk"
FIRST_YEAR = {"ATP": 2000, "WTA": 2007}
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/129.0 Safari/537.36")
BATCH = 500
REQUIRED = ["Tournament", "Date", "Round", "Winner", "Loser"]
MAX_SETS = 5
ODDS = {"b365": "B365", "ps": "PS", "max": "Max", "avg": "Avg", "bfe": "BFE"}
NOTES: list[str] = []  # data repairs made in this run (dates, names)
APP_DIR = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".local" / "share") / "fixtureshark"


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------
def clean(v) -> str | None:
    """Trimmed text with runs of spaces collapsed; None for blanks and NaN."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def num(v):
    """Number or None. Accepts '6', 6.0, ' ', 'NR', NaN."""
    s = clean(v)
    if s is None:
        return None
    try:
        f = float(s.replace(",", ""))
    except ValueError:
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return int(f) if f.is_integer() else f


def as_int(v):
    n = num(v)
    return int(n) if n is not None else None


def is_blank(v) -> bool:
    """None, NaN or NaT (pd.NaT passes isinstance(v, datetime), so test it first)."""
    if v is None or v is pd.NaT:
        return True
    try:
        return bool(pd.isna(v))
    except (TypeError, ValueError):
        return False


def as_date(v) -> str | None:
    if is_blank(v):
        return None
    if isinstance(v, (pd.Timestamp, dt.datetime, dt.date)):
        return pd.Timestamp(v).date().isoformat()
    if isinstance(v, (int, float)):  # Excel serial day
        return (dt.date(1899, 12, 30) + dt.timedelta(days=int(v))).isoformat()
    t = pd.to_datetime(str(v).strip(), dayfirst=True, errors="coerce")
    return None if pd.isna(t) else t.date().isoformat()


def jsonable(v):
    if is_blank(v) or (isinstance(v, float) and math.isinf(v)):
        return None
    if isinstance(v, (pd.Timestamp, dt.datetime, dt.date)):
        return pd.Timestamp(v).isoformat()
    if hasattr(v, "item"):  # numpy scalar
        return jsonable(v.item())
    if isinstance(v, str):
        return v.strip() or None
    return v


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------------------------------------------------------------------------
# Player names
# ---------------------------------------------------------------------------
# The source has no player ids, only names like "Sinner J.", and spells some
# players several ways. Each source name is mapped to one display name
# before loading, so a player is one row in tennis.players:
#   1. ALIASES below: spelling variants checked by hand (profile of
#      2000-2026, 4 Oct 2026). A tuple limits the alias to a range of years
#      where the short form meant someone else in other years.
#   2. Names equal apart from case, spaces, hyphens, dots, commas,
#      apostrophes or accents ("Del Potro J. M." / "Del Potro J.M.") share a
#      name_key and get one spelling: the alias target if any, else the name
#      already in the database, else the spelling used most in this run.
# The source spelling stays in raw.Winner / raw.Loser. Not merged on purpose
# (different people or unsure): Sousa J./Souza J., Gil F./Gill F., Meligeni
# F./Meligeni Alves F., Peer S./Peers S., Stefani L./Stefanini L., Zhang
# S./Chang S., Yan Z./Yang Z., Samsonova L./Samson L.
ALIASES: dict[str, dict[str, str | tuple[str, int, int]]] = {
    "ATP": {
        "Bautista R.": "Bautista Agut R.",
        "Bogomolov Jr. A.": "Bogomolov A.",
        "Dutra Da Silva R.": "Dutra Silva R.",
        "Estrella V.": "Estrella Burgos V.",
        "Gimeno D.": "Gimeno-Traver D.",
        "Granollers-Pujol G.": "Granollers G.",
        "Granollers-Pujol M.": "Granollers M.",
        "Haider-Mauer A.": "Haider-Maurer A.",
        "March O.": "Marach O.",
        "Mpetshi G.": "Mpetshi Perricard G.",
        "Nadal-Parera R.": "Nadal R.",
        "Querry S.": "Querrey S.",
        "Ramos A.": ("Ramos-Vinolas A.", 2010, 2014),
        "Riba-Madrid P.": "Riba P.",
        "Van D. Merwe I.": "Van Der Merwe I.",
        "Zayed M. S.": "Zayid M.S.",
        "Zayed M.S.": "Zayid M.S.",
        # 5 Oct 2026: the same person under two spellings, confirmed by Wikidata
        # (tennis_people.py) and never in the same draw.
        "Lisnard J.": "Lisnard J.R.",
        "Ferrero J.": "Ferrero J.C.",
        "Chela J.": "Chela J.I.",
        "Mathieu P.": "Mathieu P.H.",
        "Guzman J.": "Guzman J.P.",
        "Scherrer J.": "Scherrer J.C.",
        "Qureshi A.": "Qureshi A.U.H.",
        "Sanchez De Luna J.": "Sanchez de Luna J.A.",
        "Del Potro J.": "Del Potro J.M.",
        "Jun W.": "Jun W.S.",
        "Viola Mat.": "Viola M.",
        "Zayid M.": "Zayid M.S.",
        "Herbert P.": "Herbert P.H.",
        "Galan D.": "Galan D.E.",
        "Silva F.F.": "Ferreira Silva F.",
        "Aragone J.": "Aragone J.C.",
        "Kwon S.": "Kwon S.W.",
        "Moroni G.": "Moroni G.M.",
        "Barrios Vera M.T.": "Barrios M.",
        "Etcheverry T.M.": "Etcheverry T.",
        "Bailly G.": "Bailly G.A.",
    },
    "WTA": {
        "Arruabarrena-Vecino L.": "Arruabarrena L.",
        "Badosa Gibert P.": "Badosa P.",
        "Badosa Gibert. P.": "Badosa P.",
        "Bolsova Zadoinov A.": "Bolsova A.",
        "Date K.": "Date Krumm K.",
        "Duque M. M.": "Duque Marino M.",
        "El Allami Zhara F.": "El Allami Zahra F.",
        "Karatancheva S.": "Karatantcheva S.",
        "Kostanic J.": "Kostanic Tosic J.",
        "Kostanic T. J.": "Kostanic Tosic J.",
        "Lucic M.": "Lucic-Baroni M.",
        "Mattek B.": "Mattek-Sands B.",
        "Medina G. A.": "Medina Garrigues A.",
        "Muguruza Blanco G.": "Muguruza G.",
        "Pavlyuchen. A.": "Pavlyuchenkova A.",
        "Petersson R.": "Peterson R.",
        "Poutchkova O.": "Puchkova O.",
        "Pous-T L.": "Pous Tio L.",
        "Pous-T. L.": "Pous Tio L.",
        "Riske-Amritraj A.": "Riske A.",
        "Saidkhodj. D.": "Saidkhodjaeva D.",
        "Soler-E. S.": "Soler Espinosa S.",
        "Vogele S.": "Voegele S.",
        # 5 Oct 2026: the same person under two spellings, confirmed by Wikidata
        # (tennis_people.py) and never in the same draw.
        "Sun T.": "Sun T.T.",
        "Camerin M.": "Camerin M.E.",
        "Volodko K.": "Bondarenko K.",
        "Hsieh S.": "Hsieh S.W.",
        "Sun S.": "Sun S.N.",
        "Candela E.C.": "Cabeza-Candela E.",
        "Olaru I.": "Olaru R.",
        "Olaru I.R.": "Olaru R.",
        "Munoz D.": "Munoz Gallegos D.",
        "Pliskova Kar.": "Pliskova Ka.",
        "Pliskova Kri.": "Pliskova Kr.",
        "Salerni M.": "Salerni M.E.",
        "Joao Koehler M.": "Koehler M.J.",
        "Gavrilova D.": "Saville D.",
        "Beck An.": "Beck A.",
        "Schmiedlova A.K.": "Schmiedlova A.",
        "Kerkhove L.": "Pattinama Kerkhove L.",
        "Jang S.": "Jang S.J.",
        "Sanders S.": "Hunter S.",
        "Collins D.R.": "Collins D.",
        "Alves C.M.": "Alves C.",
        "Teichmann J.B.": "Teichmann J.",
        "Jimenez V.": "Jimenez Kasintseva V.",
        "Nugroho P.M.": "Nugroho P.",
    },
}


def name_key(name: str) -> str:
    """Letters only, lower case, accents dropped."""
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower())


def tidy_name(name: str) -> str:
    """Cosmetic only (the name_key is unchanged): "Choi J-H." -> "Choi J.H.",
    "Del Potro J. M." -> "Del Potro J.M.", "Kim K" -> "Kim K.",
    "Mccabe J." -> "McCabe J.", "Sharapova, M." -> "Sharapova M."."""
    n = re.sub(r"\.{2,}", ".", name.replace(",", ""))
    n = re.sub(r"\b([A-Z])-(?=[A-Z]\.?(\s|$))", r"\1.", n)
    n = re.sub(r"(?<=\b[A-Z]\.) (?=[A-Z]\.?$)", "", n)
    n = re.sub(r"\b([A-Z])$", r"\1.", n)
    n = re.sub(r"\bMc([a-z])", lambda m: "Mc" + m.group(1).upper(), n)
    return re.sub(r"\s+", " ", n).strip()


_ALIAS_BY_KEY: dict[str, dict[str, str | tuple[str, int, int]]] = {}


def alias_of(tour: str, name: str, year: int) -> str:
    """ALIASES looked up by name_key, so "Ferrero J." and "Ferrero J" both hit."""
    if tour not in _ALIAS_BY_KEY:
        _ALIAS_BY_KEY[tour] = {name_key(k): v for k, v in ALIASES.get(tour, {}).items()}
    a = _ALIAS_BY_KEY[tour].get(name_key(name))
    if isinstance(a, tuple):
        return a[0] if a[1] <= year <= a[2] else name
    return a or name


def build_name_map(tour: str, rows: list[dict], known: list[str]) -> dict[tuple[str, int], str]:
    """(source name, year) -> display name for every name in rows."""
    forced = {name_key(t if isinstance(t, str) else t[0]): (t if isinstance(t, str) else t[0])
              for t in ALIASES.get(tour, {}).values()}
    in_db = {}
    for n in known:
        in_db.setdefault(name_key(n), n)
    used = defaultdict(Counter)
    pairs = set()
    for x in rows:
        for n in (x["winner"], x["loser"]):
            a = alias_of(tour, n, x["year"])
            used[name_key(a)][a] += 1
            pairs.add((n, x["year"]))
    pick = {}
    for k, c in used.items():
        pick[k] = forced.get(k) or in_db.get(k) or tidy_name(sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0])
    return {(n, y): pick[name_key(alias_of(tour, n, y))] for n, y in pairs}


def apply_names(tour: str, year: int, rows: list[dict], names: dict[tuple[str, int], str]) -> list[dict]:
    for x in rows:
        x["winner"], x["loser"] = names[(x["winner"], year)], names[(x["loser"], year)]
        x["source_key"] = "|".join([tour, str(year), x["tournament"], x["round"], x["winner"], x["loser"]])
    check_unique(tour, year, rows)
    return rows


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*",
                                               "Referer": f"{BASE_URL}/alldata.php"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def load_workbook(tour: str, year: int, files_dir: Path | None, current_year: int) -> tuple[str, pd.DataFrame]:
    """(where it came from, DataFrame). Local files first, then cache, then download."""
    folder = f"{year}" if tour == "ATP" else f"{year}w"
    names = [f"{year}.xlsx", f"{year}.xls"]
    if files_dir:
        for n in names:
            p = files_dir / tour.lower() / n
            if p.exists():
                return str(p), read_excel(p.read_bytes(), n)
        raise FileNotFoundError(f"{tour} {year}: none of {names} in {files_dir / tour.lower()}")
    cache = APP_DIR / "tennis-cache" / tour.lower()
    cache.mkdir(parents=True, exist_ok=True)
    if year < current_year:
        for n in names:
            p = cache / n
            if p.exists():
                return f"{p} (cached)", read_excel(p.read_bytes(), n)
    links = file_links()
    urls = ([links[(tour, year)]] if (tour, year) in links
            else [f"{BASE_URL}/{folder}/{n}" for n in names])  # page unreadable: old layout
    errors = []
    for url in urls:
        n = url.rsplit("/", 1)[-1]
        try:
            data = fetch(url)
            df = read_excel(data, n)
            for old in cache.glob(f"{year}.xls*"):  # keep one copy per year
                old.unlink()
            (cache / n).write_bytes(data)
            time.sleep(1)  # be polite to a small site
            return url, df
        except Exception as e:  # noqa: BLE001
            errors.append(f"{url}: {e}")
    raise RuntimeError(f"{tour} {year}: could not download -- " + " | ".join(errors)
                       + ". If the site refuses Python, save the file from a browser and use --files-dir.")


_LINKS: dict | None = None


def file_links() -> dict[tuple[str, int], str]:
    """{(tour, year): url} read from the site's download page each run.

    The files sit under an obscured folder (4 Oct 2026:
    hrjk-85HytOjkhth76j_ygh4jf7/2026/2026.xlsx, WTA in 2026w/) that can
    change, so the links are taken from alldata.php rather than built.
    """
    global _LINKS
    if _LINKS is None:
        _LINKS = {}
        try:
            page = fetch(f"{BASE_URL}/alldata.php").decode("latin-1")
        except Exception as e:  # noqa: BLE001
            print(f"  (download page not read: {e}; trying the old file layout)")
            return _LINKS
        for href in re.findall(r"""href=["']?([^"' >]+?\.xlsx?)""", page, re.I):
            m = re.search(r"(\d{4})(w?)/\1\.xlsx?$", href, re.I)
            if m:
                key = ("WTA" if m.group(2) else "ATP", int(m.group(1)))
                _LINKS[key] = href if href.startswith("http") else f"{BASE_URL}/{href.lstrip('/')}"
    return _LINKS


def read_excel(data: bytes, name: str) -> pd.DataFrame:
    df = pd.read_excel(io.BytesIO(data), engine="openpyxl" if name.endswith("xlsx") else "xlrd")
    df.columns = [clean(c) or f"col{i}" for i, c in enumerate(df.columns)]
    # trailing blank rows
    return df[df[[c for c in ("Winner", "Loser") if c in df.columns]].notna().any(axis=1)].reset_index(drop=True)


def to_rows(tour: str, year: int, df: pd.DataFrame) -> list[dict]:
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"{tour} {year}: missing columns {missing}; file has {list(df.columns)}")
    series_col = "Series" if "Series" in df.columns else "Tier" if "Tier" in df.columns else None
    rows = []
    for i, r in enumerate(df.to_dict("records")):
        tournament, rnd, winner, loser = clean(r["Tournament"]), clean(r["Round"]), clean(r["Winner"]), clean(r["Loser"])
        date = as_date(r["Date"])
        if not all((tournament, rnd, winner, loser)):
            raise ValueError(f"{tour} {year} row {i + 2}: blank tournament/round/winner/loser: "
                             f"{[tournament, rnd, winner, loser]}")
        w_games, l_games = [], []
        for k in range(1, MAX_SETS + 1):
            w, l = as_int(r.get(f"W{k}")), as_int(r.get(f"L{k}"))
            if w is None or l is None:
                break
            w_games.append(w)
            l_games.append(l)
        row = {
            "source_key": "|".join([tour, str(year), tournament, rnd, winner, loser]),
            "tour": tour, "year": year, "tournament": tournament, "round": rnd,
            "winner": winner, "loser": loser, "match_date": date,
            "location": clean(r.get("Location")),
            "series": clean(r.get(series_col)) if series_col else None,
            "court": clean(r.get("Court")), "surface": clean(r.get("Surface")),
            "best_of": as_int(r.get("Best of")),
            "w_rank": as_int(r.get("WRank")), "l_rank": as_int(r.get("LRank")),
            "w_pts": as_int(r.get("WPts")), "l_pts": as_int(r.get("LPts")),
            "w_games": w_games, "l_games": l_games,
            "w_sets": as_int(r.get("Wsets")), "l_sets": as_int(r.get("Lsets")),
            "status": clean(r.get("Comment")),
            "raw": {k: v for k, v in ((k, jsonable(v)) for k, v in r.items()) if v is not None},
        }
        for key, col in ODDS.items():
            row[f"{key}_w"], row[f"{key}_l"] = num(r.get(f"{col}W")), num(r.get(f"{col}L"))
        rows.append(row)
    repair_dates(tour, year, rows)
    check_unique(tour, year, rows)
    return rows


def check_unique(tour: str, year: int, rows: list[dict]) -> None:
    dups = [k for k, n in Counter(x["source_key"] for x in rows).items() if n > 1]
    if dups:
        raise ValueError(f"{tour} {year}: {len(dups)} duplicate match keys, nothing written: {dups[:20]}")


def repair_dates(tour: str, year: int, rows: list[dict]) -> None:
    """Two kinds of bad date seen in the source (profile, 4 Oct 2026):
    - blank: WTA 2010 Guangzhou final, WTA 2012 Cincinnati final. Use the
      tournament's latest date in the file (the semi-final day).
    - wrong year: ATP 2006 Paris final dated 2005-11-05. A season file runs
      from late December of the year before to December; a date outside that
      takes the file's year if that puts it inside.
    Each repair is listed in NOTES (printed by --profile and by the load).
    The source value stays in raw.Date."""
    lo, hi = f"{year - 1}-12-01", f"{year}-12-31"
    for x in rows:
        d = x["match_date"]
        if d and not lo <= d <= hi:
            fixed = f"{year}{d[4:]}"
            if not lo <= fixed <= hi:
                raise ValueError(f"{tour} {year}: date {d} outside the season and not a year typo: {x['source_key']}")
            NOTES.append(f"{tour} {year}: date {d} -> {fixed} (year typo) {x['source_key']}")
            x["match_date"] = fixed
    latest = defaultdict(str)
    for x in rows:
        if x["match_date"]:
            latest[x["tournament"]] = max(latest[x["tournament"]], x["match_date"])
    for x in rows:
        if not x["match_date"]:
            if not latest[x["tournament"]]:
                raise ValueError(f"{tour} {year}: blank date and no other date for the tournament: {x['source_key']}")
            x["match_date"] = latest[x["tournament"]]
            NOTES.append(f"{tour} {year}: blank date -> {x['match_date']} (tournament's latest) {x['source_key']}")


def totals(rows: list[dict]) -> tuple[int, int, str]:
    games = sum(sum(x["w_games"]) + sum(x["l_games"]) for x in rows)
    key_hash = hashlib.md5("#".join(sorted(x["source_key"] for x in rows)).encode("utf-8")).hexdigest()
    return len(rows), games, key_hash


# ---------------------------------------------------------------------------
# Profile (no database): what the file holds, and what to review
# ---------------------------------------------------------------------------
def profile(tour: str, year: int, src: str, df: pd.DataFrame, rows: list[dict] | None, err: str | None) -> None:
    d = pd.to_datetime(df["Date"], errors="coerce", dayfirst=True) if "Date" in df.columns else pd.Series(dtype="datetime64[ns]")
    print(f"\n=== {tour} {year}: {len(df)} rows, {d.min().date() if d.notna().any() else '?'} to "
          f"{d.max().date() if d.notna().any() else '?'}  [{src}]")
    print("  columns:", ", ".join(df.columns))
    for c in ("Series", "Tier", "Court", "Surface", "Round", "Best of", "Comment"):
        if c in df.columns:
            print(f"  {c}:", dict(Counter(df[c].map(clean)).most_common(12)))
    blank = {c: int(df[c].isna().sum()) for c in df.columns if df[c].isna().any()}
    print("  blanks per column:", blank)
    if err:
        print("  REFUSED:", err)
        return
    n, games, _ = totals(rows)
    print(f"  parsed {n} matches, {games} games; sample: {rows[0]['source_key']} {rows[0]['w_games']}-{rows[0]['l_games']}")
    bad = [x["source_key"] for x in rows if x["status"] == "Completed" and x["w_sets"] is not None
           and (x["w_sets"] != sum(w > l for w, l in zip(x["w_games"], x["l_games"]))
                or x["l_sets"] != sum(l > w for w, l in zip(x["w_games"], x["l_games"])))]
    print(f"  completed matches whose set scores disagree with sets won: {len(bad)} {bad[:5]}")


def name_review(names_by_tour: dict[str, dict[tuple[str, int], str]]) -> None:
    """Source spellings that will be loaded under a different display name."""
    for tour, names in names_by_tour.items():
        changed = defaultdict(set)
        for (src, _), disp in names.items():
            if src != disp:
                changed[disp].add(src)
        shown = {n for n in names.values()}
        print(f"\n=== {tour} names: {len({s for s, _ in names})} source spellings -> {len(shown)} players; "
              f"{len(changed)} players with merged spellings")
        for disp in sorted(changed):
            print(f"    {disp}  <-  {sorted(changed[disp])}")


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def read_env_file() -> None:
    p = APP_DIR / "tennis.env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def db_player_names(sb, tour: str) -> list[str]:
    names, start = [], 0
    while True:
        page = (sb.table("tennis_players").select("name").eq("tour", tour)
                .order("player_id").range(start, start + 999).execute().data)
        names += [p["name"] for p in page]
        if len(page) < 1000:
            return names
        start += 1000


def db_keys(sb, tour: str, year: int) -> set[str]:
    keys, start = set(), 0
    while True:
        page = (sb.table("tennis_matches").select("source_key").eq("tour", tour).eq("year", year)
                .order("source_key").range(start, start + 999).execute().data)
        keys |= {p["source_key"] for p in page}
        if len(page) < 1000:
            return keys
        start += 1000


def load(sb, tour: str, year: int, rows: list[dict]) -> str:
    changed = 0
    for i in range(0, len(rows), BATCH):
        changed += sb.rpc("tennis_upsert_matches", {"rows": rows[i:i + BATCH]}).execute().data or 0
    want = totals(rows)
    got = sb.rpc("tennis_year_totals", {"p_tour": tour, "p_year": year}).execute().data[0]
    if (got["matches"], got["games"], got["key_hash"]) != want:
        have = db_keys(sb, tour, year)
        file_keys = {x["source_key"] for x in rows}
        raise RuntimeError(
            f"{tour} {year} does not reconcile: file {want[0]} matches / {want[1]} games, "
            f"database {got['matches']} / {got['games']}. In database not file: {sorted(have - file_keys)[:10]}; "
            f"in file not database: {sorted(file_keys - have)[:10]}")
    return f"{tour} {year}: {len(rows)} ({changed} new/changed)"


def parse_years(spec: str, today: dt.date) -> list[int]:
    if not spec:
        return [today.year - 1, today.year] if today.month == 1 else [today.year]
    out = []
    for part in spec.split(","):
        a, _, b = part.strip().partition("-")
        out += list(range(int(a), int(b or a) + 1))
    return sorted(set(out))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", default="", help="e.g. 2026 or 2000-2026 (default: this year; also last year in January)")
    ap.add_argument("--tour", default="both", choices=["atp", "wta", "both"])
    ap.add_argument("--files-dir", default="", help=r"folder holding atp\<year>.xlsx and wta\<year>.xlsx saved by hand")
    ap.add_argument("--profile", action="store_true", help="read and report only; no database")
    ap.add_argument("--log", action="store_true", help="append output to %%LOCALAPPDATA%%\\fixtureshark\\logs\\tennis_import.log")
    args = ap.parse_args()
    if args.log:
        (APP_DIR / "logs").mkdir(parents=True, exist_ok=True)
        sys.stdout = sys.stderr = open(APP_DIR / "logs" / "tennis_import.log", "a", encoding="utf-8", buffering=1)
        print(f"==== {dt.datetime.now():%Y-%m-%d %H:%M}")

    today = dt.date.today()
    tours = ["ATP", "WTA"] if args.tour == "both" else [args.tour.upper()]
    files_dir = Path(args.files_dir) if args.files_dir else None
    jobs = [(t, y) for t in tours for y in parse_years(args.years, today) if FIRST_YEAR[t] <= y <= today.year]

    # Read everything first: names are settled across all the years in the
    # run (and the database) before anything is written.
    read, failures = {}, []
    for tour, year in jobs:
        try:
            src, df = load_workbook(tour, year, files_dir, today.year)
        except Exception as e:  # noqa: BLE001
            failures.append(str(e))
            print(f"\n=== {tour} {year}: NOT READ -- {e}")
            continue
        try:
            rows, err = to_rows(tour, year, df), None
            read[(tour, year)] = (src, rows)
        except Exception as e:  # noqa: BLE001
            rows, err = None, str(e)
            failures.append(err)
        if args.profile:
            profile(tour, year, src, df, rows, err)

    sb = None
    if not args.profile:
        read_env_file()
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    names_by_tour = {}
    for tour in tours:
        rows = [x for (t, _), (_, r) in read.items() if t == tour for x in r]
        names_by_tour[tour] = build_name_map(tour, rows, db_player_names(sb, tour) if sb else [])
    for (tour, year), (src, rows) in list(read.items()):
        try:
            apply_names(tour, year, rows, names_by_tour[tour])
        except Exception as e:  # noqa: BLE001
            failures.append(str(e))
            print(f"FAILED {e}")
            del read[(tour, year)]

    if args.profile:
        name_review(names_by_tour)
        print(f"\n=== data repairs: {len(NOTES)}")
        for n in NOTES:
            print("   ", n)
        print("\n" + ("PROBLEMS: " + " || ".join(failures) if failures else "OK: nothing refused"))
        return 0

    for n in NOTES:
        print("repair:", n)
    run = sb.table("pipeline_runs").insert({"job_name": "tennis_import", "status": "running"}).execute().data[0]
    done = []
    for (tour, year), (src, rows) in read.items():
        try:
            done.append(load(sb, tour, year, rows))
            print(done[-1], f"[{src}]")
        except Exception as e:  # noqa: BLE001
            failures.append(str(e))
            print(f"FAILED {e}")
    # Events, editions and per-player summaries (phase 3) are rebuilt by the
    # tennis-refresh GitHub job, which runs every two hours and picks up any
    # load: the rebuild takes longer than the API's statement time limit, so
    # it runs over a direct database connection there, not from here.
    summary = "; ".join(done) or "nothing loaded"
    sb.table("pipeline_runs").update({
        "status": "failed" if failures else "success", "summary": summary[:2000],
        "error_message": " || ".join(failures)[:4000] or None, "finished_at": "now()",
    }).eq("run_id", run["run_id"]).execute()
    print(("FAILED: " + " || ".join(failures)) if failures else "OK: " + summary)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
