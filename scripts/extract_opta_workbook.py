#!/usr/bin/env python3
"""
Extract the Opta 2011/12 player-match workbook into opta_slot_breakdown.

The database previously held only an aggregated slice of this file -- 121
rows with an UNDIFFERENTIATED set-piece bucket. That truncation is why
the set-piece type split was reported as impossible; it was missing from
the import, not from the source.

Aggregates to formation-slot level rather than storing 10,369 raw rows,
deliberately. This is 2011/12 -- none of these players are current, so
per-player rows answer nothing about today's squads. What carries
forward is the ROLE: what a given slot in a given shape produces, and
how much of it comes from each set-piece type.

Substitute appearances (slot > 11) are excluded. They aren't a formation
position, and folding them in would dilute the per-start rates that make
slots comparable.

Usage:
    pip install xlrd
    python scripts/extract_opta_workbook.py path/to/FF_Prem_11-12_Player_data.xls
Prints SQL to stdout; review before applying.
"""
import sys
from collections import defaultdict

COLUMNS = {
    'formation_code': 'Team Formation',
    'formation_slot': 'Position in Formation',
    'starts': 'Starts',
    'minutes': 'Time Played',
    'goals': 'Goals',
    'goals_open_play': 'Goals Open Play',
    'goals_from_corners': 'Goals from Corners',
    'goals_from_direct_fk': 'Goals from Direct Free Kick',
    'goals_from_set_play': 'Goals from Set Play',
    'goals_from_penalties': 'Goals from penalties',
    'penalties_taken': 'Penalties Taken',
    'penalty_goals': 'Penalty Goals',
    'assists': 'Assists',
    'assist_corner': 'Goal Assist Corner',
    'assist_free_kick': 'Goal Assist Free Kick',
    'assist_throw_in': 'Goal Assist Throw In',
    'assist_set_piece': 'Goal Assist Set Piece',
    'key_passes': 'Key Passes',
    'corners_taken': 'Corners Taken incl short corners',
    'shots_on_target': 'Shots On Target inc goals',
    'shots_off_target': 'Shots Off Target inc woodwork',
    'big_chances': 'Big Chances',
    'touches_opp_box': 'Touches open play opp box',
}
SUMMED = [k for k in COLUMNS if k not in ('formation_code', 'formation_slot')]


def main(path: str) -> None:
    import xlrd

    book = xlrd.open_workbook(path)
    sheet = book.sheet_by_index(0)
    header = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]

    missing = [v for v in COLUMNS.values() if v not in header]
    if missing:
        # Fail loudly rather than silently writing zeros for a column that
        # moved or was renamed -- a quietly-zero statistic is worse than
        # no statistic.
        sys.exit(f"Missing expected columns: {missing}")

    idx = {k: header.index(v) for k, v in COLUMNS.items()}
    agg = defaultdict(lambda: defaultdict(int))

    for r in range(1, sheet.nrows):
        raw_code = sheet.cell_value(r, idx['formation_code'])
        raw_slot = sheet.cell_value(r, idx['formation_slot'])
        if not isinstance(raw_code, (int, float)) or not isinstance(raw_slot, (int, float)):
            continue
        code, slot = str(int(raw_code)), int(raw_slot)
        if not code or slot < 1 or slot > 11:
            continue
        for field in SUMMED:
            v = sheet.cell_value(r, idx[field])
            agg[(code, slot)][field] += int(v) if isinstance(v, (int, float)) else 0

    cols = ['formation_code', 'slot'] + SUMMED
    rows = [
        "('" + code + "'," + str(slot) + "," + ",".join(str(d[f]) for f in SUMMED) + ")"
        for (code, slot), d in sorted(agg.items(), key=lambda kv: (int(kv[0][0]), kv[0][1]))
    ]
    updates = ", ".join(f"{f}=excluded.{f}" for f in SUMMED)
    print(f"-- {len(rows)} formation-slot rows from {path}")
    print(f"insert into public.opta_slot_breakdown ({','.join(cols)}) values")
    print(",\n".join(rows))
    print(f"on conflict (formation_code,slot) do update set {updates};")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
