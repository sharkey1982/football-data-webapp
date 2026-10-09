#!/usr/bin/env python3
# ============================================================================
# scripts/analysis/build_fdr_pit.py
#
# Point-in-time FPL fixture difficulty (FDR) for 2022/23-2025/26, for the
# "xG or FDR?" article. We only store FDR for the current season, so this
# reads the public FPL archive (github.com/vaastav/Fantasy-Premier-League),
# whose data/<season>/fixtures.csv was committed roughly weekly through each
# season. For every fixture it takes the FDR from the latest commit made
# BEFORE kick-off (what a manager saw), and also keeps the end-of-season
# value, which FPL had revised for 20-50% of fixtures by then.
#
#   git clone --filter=blob:none --no-checkout \
#       https://github.com/vaastav/Fantasy-Premier-League.git /tmp/vaastav
#   python scripts/analysis/build_fdr_pit.py /tmp/vaastav
#
# Writes scripts/analysis/data/fpl_fdr_pit.csv (fixture ids are FPL's,
# which fpl_player_gameweek_history.fixture_id uses; team numbers checked
# against our history for all 1,520 fixtures on 9 Oct 2026).
# ============================================================================

import csv
import io
import os
import subprocess
import sys
from datetime import datetime

SEASONS = {'2022-23': 9, '2023-24': 10, '2024-25': 11, '2025-26': 12}
OUT = os.path.join(os.path.dirname(__file__), 'data', 'fpl_fdr_pit.csv')


def main(repo: str) -> None:
    out = []
    for s, sid in SEASONS.items():
        path = f'data/{s}/fixtures.csv'
        log = subprocess.run(['git', '-C', repo, 'log', '--format=%H %cI', '--', path],
                             capture_output=True, text=True, check=True).stdout.split('\n')
        snaps = []
        for line in filter(None, (l.strip() for l in log)):
            sha, date = line.split()
            txt = subprocess.run(['git', '-C', repo, 'show', f'{sha}:{path}'],
                                 capture_output=True, text=True, check=True).stdout
            rows = {int(r['id']): r for r in csv.DictReader(io.StringIO(txt)) if r.get('team_h_difficulty')}
            snaps.append((datetime.fromisoformat(date), rows))
        snaps.sort(key=lambda x: x[0])
        final = snaps[-1][1]
        changed = 0
        for fid, r in sorted(final.items()):
            ko = datetime.fromisoformat(r['kickoff_time'].replace('Z', '+00:00'))
            pre = [rows[fid] for d, rows in snaps if d < ko and fid in rows]
            rr = pre[-1] if pre else r
            if (rr['team_h'], rr['team_a']) != (r['team_h'], r['team_a']):
                raise SystemExit(f'team mismatch {s} fixture {fid}')
            h, a = int(rr['team_h_difficulty']), int(rr['team_a_difficulty'])
            hf, af = int(r['team_h_difficulty']), int(r['team_a_difficulty'])
            changed += (h, a) != (hf, af)
            out.append([sid, fid, int(r['event'] or 0), r['team_h'], r['team_a'], h, a, hf, af])
        print(f'{s}: {len(snaps)} snapshots, {len(final)} fixtures, {changed} revised by season end')
    with open(OUT, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['season_id', 'fixture_id', 'gw', 'team_h', 'team_a', 'h_fdr', 'a_fdr', 'h_fdr_final', 'a_fdr_final'])
        w.writerows(out)


if __name__ == '__main__':
    main(sys.argv[1])
