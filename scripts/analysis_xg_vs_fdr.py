#!/usr/bin/env python3
# ============================================================================
# scripts/analysis_xg_vs_fdr.py
#
# One-off analysis for the article "xG or FDR?" (9 Oct 2026). Changes
# nothing on the site and no model: it reads history and writes one
# analysis_results row ('xg_vs_fdr').
#
# Question: before a gameweek, which number better predicts a player's FPL
# points -- FPL's fixture difficulty rating (FDR, 1-5), an expected-goals
# fixture rating, or (for scale) the betting market's team goals and the
# player's own expected goal involvement?
#
# Sample: every Premier League start, 2022/23-2025/26 (seasons 9-12; FPL
# has no xG before 2022/23). Points are FPL's own total_points. A start is
# FPL's 'starts' flag (2022/23 rows before FPL added it: 45+ minutes, as in
# captaincy_base.sql). Minutes are not what's being predicted: neither FDR
# nor xG says who plays, so the test is "given he starts".
#
# Every input is point in time (only matches in EARLIER gameweeks):
#   fdr      FDR the player's team faced, from the last archive snapshot
#            before kick-off (build_fdr_pit.py). Lower = easier.
#   fdr_end  the end-of-season FDR for the same fixture (hindsight; FPL
#            revised 20-50% of fixtures during each season).
#   xg_att   expected-goals fixture rating, attack: own team's xG for per
#            match x opponent's xG against per match / league average, x
#            home factor (last 10 gameweeks, this season and last only;
#            5+ matches needed). Team xG = sum of FPL player xG.
#   xg_def   the same for goals against (opponent attack x own defence).
#   mkt_att  market-implied team goals (closing 1X2 + over/under 2.5,
#            Poisson fit in captaincy_base.sql); mkt_def = opponent's.
#   xgi90    player's xG + xA per 90 over his last 10 gameweeks played
#            (this season and last; 270+ minutes needed).
#   pts90    player's FPL points per 90, same window.
#   price    FPL price that gameweek.
# Rows missing any input are dropped, so every predictor is scored on the
# same rows (2022/23's first gameweeks and newly promoted sides early on
# fall out).
#
# The fixture signal is position-specific, fixed before running: attack
# (xg_att, mkt_att) for midfielders and forwards, defence (xg_def, mkt_def,
# lower = better) for goalkeepers and defenders. FDR is one number per team.
#
# Measures (pairs with equal points are skipped):
#   between players  within each gameweek and position, for every pair of
#                    starters, how often the predictor puts the higher
#                    scorer first (ties in the predictor count as half).
#   same player      within each player-season, for every pair of his
#                    starts, how often the predictor picks the better week.
#   head to head     pairs where FDR and the xG rating disagree on which is
#                    easier: which one was right.
#   95% intervals    bootstrap (1,000 draws) over player-seasons (same
#                    player) or gameweeks (between players).
#
#   python scripts/analysis_xg_vs_fdr.py      (SUPABASE_DB_URL, _URL, _SERVICE_KEY)
# ============================================================================

from __future__ import annotations

import json
import os
import numpy as np
import pandas as pd

HERE = os.path.dirname(__file__)
POS = {1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD'}
WINDOW = 10
RNG = np.random.default_rng(20261009)
NBOOT = 1000

ROWS_SQL = """
select h.season_id, h.gameweek gw, h.fixture_id, h.fpl_code, h.was_home, h.minutes, h.total_points pts,
  coalesce(h.expected_goals, 0)::float8 xg, coalesce(h.expected_assists, 0)::float8 xa, h.value,
  h.goals_scored, h.assists, h.clean_sheets,
  case when g.ok then h.starts = 1 else h.minutes >= 45 end started,
  f.home_id, f.away_id, f.lh, f.la, st.element_type, st.web_name
from fpl_player_gameweek_history h
join fxm f using (season_id, fixture_id)
join gw_has_starts g on g.season_id = h.season_id and g.gameweek = h.gameweek
left join fpl_player_season_totals st on st.season_id = h.season_id and st.fpl_code = h.fpl_code
where h.season_id between 9 and 12 and h.minutes > 0
"""

HOME_SQL = """
select avg(full_time_home_goals)::float8 hg, avg(full_time_away_goals)::float8 ag, count(*) n
from matches where league_id = 1 and season_id < 9 and full_time_home_goals is not null
"""


def load() -> tuple[pd.DataFrame, float]:
    import psycopg
    base = open(os.path.join(HERE, 'analysis', 'captaincy_base.sql')).read()
    with psycopg.connect(os.environ['SUPABASE_DB_URL']) as con, con.cursor() as cur:
        cur.execute(base)
        cur.execute(ROWS_SQL)
        cols = [d.name for d in cur.description]
        df = pd.DataFrame(cur.fetchall(), columns=cols)
        cur.execute(HOME_SQL)
        hg, ag, n = cur.fetchone()
    print(f'rows {len(df)}; home factor from {n} earlier PL matches: {hg:.3f} v {ag:.3f}')
    return df, float(np.sqrt(hg / ag))


def prior_window(keys: pd.DataFrame, key: str, cols: list[str]) -> pd.DataFrame:
    """For each (key, seq) row, sums of `cols` over the previous WINDOW rows
    of the same key (earlier gameweeks only), this season and last only."""
    out = []
    for _, g in keys.sort_values([key, 'seq']).groupby(key, sort=False):
        seqs = g['seq'].to_numpy(); seas = g['season_id'].to_numpy()
        vals = g[cols].to_numpy(dtype=float)
        kval = g[key].iloc[0]
        for i in range(len(g)):
            lo = max(0, i - WINDOW)
            idx = [j for j in range(lo, i) if seas[j] >= seas[i] - 1]
            s = vals[idx].sum(axis=0) if idx else np.zeros(len(cols))
            out.append((kval, seqs[i], *s))
    return pd.DataFrame(out, columns=[key, 'seq', *[f'p_{c}' for c in cols]])


def build(df: pd.DataFrame, home: float) -> pd.DataFrame:
    df = df.copy()
    df['seq'] = df['season_id'] * 100 + df['gw']
    df['team_id'] = np.where(df['was_home'], df['home_id'], df['away_id'])
    df['opp_id'] = np.where(df['was_home'], df['away_id'], df['home_id'])
    df['xgi'] = df['xg'] + df['xa']

    # FDR (point in time and end of season)
    fdr = pd.read_csv(os.path.join(HERE, 'analysis', 'data', 'fpl_fdr_pit.csv'))
    df = df.merge(fdr[['season_id', 'fixture_id', 'h_fdr', 'a_fdr', 'h_fdr_final', 'a_fdr_final']],
                  on=['season_id', 'fixture_id'], how='left', validate='many_to_one')
    df['fdr'] = np.where(df['was_home'], df['h_fdr'], df['a_fdr'])
    df['fdr_end'] = np.where(df['was_home'], df['h_fdr_final'], df['a_fdr_final'])

    # market
    df['mkt_att'] = np.where(df['was_home'], df['lh'], df['la'])
    df['mkt_def'] = np.where(df['was_home'], df['la'], df['lh'])

    # team xG per match side, then rolling team form
    side = df.groupby(['season_id', 'gw', 'seq', 'fixture_id', 'team_id', 'opp_id'], as_index=False)['xg'].sum()
    side = side.merge(side[['fixture_id', 'season_id', 'team_id', 'xg']].rename(columns={'team_id': 'opp_id', 'xg': 'xga'}),
                      on=['season_id', 'fixture_id', 'opp_id'])
    tg = side.groupby(['team_id', 'season_id', 'seq'], as_index=False).agg(xgf=('xg', 'sum'), xga=('xga', 'sum'), n=('xg', 'size'))
    tp = prior_window(tg, 'team_id', ['xgf', 'xga', 'n'])
    tp['att'] = tp['p_xgf'] / tp['p_n'].replace(0, np.nan)
    tp['dfn'] = tp['p_xga'] / tp['p_n'].replace(0, np.nan)
    tp.loc[tp['p_n'] < 5, ['att', 'dfn']] = np.nan
    league = float(side['xg'].mean())
    df = df.merge(tp[['team_id', 'seq', 'att', 'dfn']], on=['team_id', 'seq'], how='left')
    df = df.merge(tp[['team_id', 'seq', 'att', 'dfn']].rename(columns={'team_id': 'opp_id', 'att': 'opp_att', 'dfn': 'opp_dfn'}),
                  on=['opp_id', 'seq'], how='left')
    hf = np.where(df['was_home'], home, 1 / home)
    df['xg_att'] = df['att'] * df['opp_dfn'] / league * hf
    df['xg_def'] = df['opp_att'] * df['dfn'] / league / hf

    # player form
    pg = df.groupby(['fpl_code', 'season_id', 'seq'], as_index=False).agg(minutes=('minutes', 'sum'), xgi=('xgi', 'sum'), pts=('pts', 'sum'))
    pp = prior_window(pg, 'fpl_code', ['minutes', 'xgi', 'pts'])
    ok = pp['p_minutes'] >= 270
    pp['xgi90'] = np.where(ok, pp['p_xgi'] / pp['p_minutes'] * 90, np.nan)
    pp['pts90'] = np.where(ok, pp['p_pts'] / pp['p_minutes'] * 90, np.nan)
    df = df.merge(pp[['fpl_code', 'seq', 'xgi90', 'pts90']], on=['fpl_code', 'seq'], how='left')
    df['price'] = df['value'] / 10
    df['pos'] = df['element_type'].map(POS)
    return df


def predictors(pos: str) -> dict[str, str]:
    """name -> column, oriented so that higher = more points expected."""
    att = pos in ('MID', 'FWD')
    return {
        'fdr': 'n_fdr', 'fdr_end': 'n_fdr_end',
        'xg_fix': 'xg_att' if att else 'n_xg_def',
        'mkt_fix': 'mkt_att' if att else 'n_mkt_def',
        'xgi90': 'xgi90', 'pts90': 'pts90', 'price': 'price',
    }


def counts(x: np.ndarray, y: np.ndarray) -> tuple[int, int, int]:
    iu = np.triu_indices(len(x), 1)
    dx = np.sign(x[:, None] - x[None, :])[iu]; dy = np.sign(y[:, None] - y[None, :])[iu]
    m = dy != 0
    p = (dx * dy)[m]
    return int((p > 0).sum()), int((p < 0).sum()), int((dx[m] == 0).sum())


def h2h(a: np.ndarray, b: np.ndarray, y: np.ndarray) -> tuple[int, int]:
    """Pairs where a and b order strictly and oppositely: (a right, b right)."""
    iu = np.triu_indices(len(y), 1)
    da = np.sign(a[:, None] - a[None, :])[iu]; db = np.sign(b[:, None] - b[None, :])[iu]
    dy = np.sign(y[:, None] - y[None, :])[iu]
    m = (dy != 0) & (da * db < 0)
    return int((da[m] * dy[m] > 0).sum()), int((db[m] * dy[m] > 0).sum())


def evaluate(df: pd.DataFrame, group_cols: list[str], names: list[str], cols: dict[str, str]) -> dict:
    """Per-group pair counts for every predictor, plus bootstrap over groups."""
    groups = list(df.groupby(group_cols, sort=False))
    C = np.zeros((len(groups), len(names), 3))
    H = np.zeros((len(groups), 2, 2))  # [xg_fix v fdr, mkt_fix v fdr] x (fix right, fdr right)
    npairs = 0
    for gi, (_, g) in enumerate(groups):
        if len(g) < 2:
            continue
        y = g['pts'].to_numpy(float)
        for k, nm in enumerate(names):
            C[gi, k] = counts(g[cols[nm]].to_numpy(float), y)
        f = g[cols['fdr']].to_numpy(float)
        H[gi, 0] = h2h(g[cols['xg_fix']].to_numpy(float), f, y)
        H[gi, 1] = h2h(g[cols['mkt_fix']].to_numpy(float), f, y)
    tot = C.sum(axis=0)
    res = {'groups': len(groups), 'pairs': int(tot[0].sum())}

    def conc_of(t):  # t: (..., names, 3)
        return (t[..., 0] + 0.5 * t[..., 2]) / t.sum(axis=-1)

    def strict_of(t):
        return t[..., 0] / (t[..., 0] + t[..., 1])

    boots = RNG.integers(0, len(groups), size=(NBOOT, len(groups)))
    BT = np.stack([C[b].sum(axis=0) for b in boots])  # NBOOT x names x 3
    BH = np.stack([H[b].sum(axis=0) for b in boots])
    cc, bc = conc_of(tot), conc_of(BT)
    fdr_i = names.index('fdr')
    for k, nm in enumerate(names):
        r = {'concordance': round(float(cc[k]), 4),
             'ci': [round(float(np.percentile(bc[:, k], 2.5)), 4), round(float(np.percentile(bc[:, k], 97.5)), 4)],
             'strict': round(float(strict_of(tot)[k]), 4),
             'tied_share': round(float(tot[k, 2] / tot[k].sum()), 4)}
        if nm != 'fdr':
            d = bc[:, k] - bc[:, fdr_i]
            r['minus_fdr'] = round(float(cc[k] - cc[fdr_i]), 4)
            r['minus_fdr_ci'] = [round(float(np.percentile(d, 2.5)), 4), round(float(np.percentile(d, 97.5)), 4)]
        res[nm] = r
    Ht = H.sum(axis=0)
    for i, nm in enumerate(['xg_fix', 'mkt_fix']):
        n = Ht[i].sum()
        share = BH[:, i, 0] / BH[:, i].sum(axis=1)
        res[f'h2h_{nm}_v_fdr'] = {'disagree_pairs': int(n), 'fix_right': round(float(Ht[i, 0] / n), 4) if n else None,
                                  'ci': [round(float(np.percentile(share, 2.5)), 4), round(float(np.percentile(share, 97.5)), 4)]}
    return res


def means_by(df: pd.DataFrame, col: str, bins=None) -> list[dict]:
    if bins is None:
        key = df[col]
    else:
        key = pd.qcut(df[col], bins, labels=False, duplicates='drop') + 1
    g = df.groupby(key)['pts'].agg(['mean', 'size'])
    hauls = df.groupby(key)['pts'].apply(lambda s: float((s >= 10).mean()))
    rng = df.groupby(key)[col].agg(['min', 'max']) if bins else None
    out = []
    for k, r in g.iterrows():
        d = {'band': int(k), 'mean_pts': round(float(r['mean']), 3), 'n': int(r['size']), 'haul_rate': round(hauls[k], 4)}
        if rng is not None:
            d['range'] = [round(float(rng.loc[k, 'min']), 3), round(float(rng.loc[k, 'max']), 3)]
        out.append(d)
    return out


def main() -> None:
    raw, home = load()
    df = build(raw, home)
    for c in ('fdr', 'fdr_end', 'xg_def', 'mkt_def'):
        df[f'n_{c}'] = -df[c]
    need = ['pos', 'fdr', 'fdr_end', 'xg_att', 'xg_def', 'mkt_att', 'mkt_def', 'xgi90', 'pts90', 'price']
    starts = df[df['started']]
    sample = starts.dropna(subset=need)
    summary: dict = {
        'home_factor': round(home, 4),
        'rows_minutes': int(len(df)), 'starts': int(len(starts)), 'sample': int(len(sample)),
        'dropped': {c: int(starts[c].isna().sum()) for c in need},
        'by_season': {int(k): int(v) for k, v in sample.groupby('season_id').size().items()},
        'fdr_revised_share': round(float((sample['fdr'] != sample['fdr_end']).mean()), 4),
        'positions': {},
    }
    names = ['fdr', 'fdr_end', 'xg_fix', 'mkt_fix', 'xgi90', 'pts90', 'price']
    from scipy.stats import spearmanr
    for pos in ['GK', 'DEF', 'MID', 'FWD', 'ALL']:
        sub = sample if pos == 'ALL' else sample[sample['pos'] == pos]
        if pos == 'ALL':
            # position-appropriate fixture signal per row, standardised within position
            sub = sub.copy()
            for nm in ('xg_fix', 'mkt_fix'):
                vals = pd.Series(np.nan, index=sub.index)
                for p in POS.values():
                    m = sub['pos'] == p
                    v = sub.loc[m, predictors(p)[nm]]
                    vals[m] = (v - v.mean()) / v.std()
                sub[f'all_{nm}'] = vals
            cols = {**predictors('MID'), 'xg_fix': 'all_xg_fix', 'mkt_fix': 'all_mkt_fix'}
        else:
            cols = predictors(pos)
        r: dict = {'n': int(len(sub)), 'mean_pts': round(float(sub['pts'].mean()), 3),
                   'haul_rate': round(float((sub['pts'] >= 10).mean()), 4)}
        r['spearman'] = {nm: round(float(spearmanr(sub[cols[nm]], sub['pts']).statistic), 4) for nm in names}
        gb = ['season_id', 'gw'] if pos != 'ALL' else ['season_id', 'gw', 'pos']
        r['between_players'] = evaluate(sub, gb, names, cols)
        fix_names = ['fdr', 'fdr_end', 'xg_fix', 'mkt_fix']
        r['same_player'] = evaluate(sub, ['fpl_code', 'season_id'], fix_names, cols)
        r['same_player_by_season'] = {int(s): {k: v for k, v in evaluate(g, ['fpl_code', 'season_id'], fix_names, cols).items()
                                               if k in ('fdr', 'xg_fix', 'mkt_fix')}
                                      for s, g in sub.groupby('season_id')}
        if pos != 'ALL':
            r['by_fdr'] = means_by(sub, 'fdr')
            r['by_xg_fix'] = means_by(sub, cols['xg_fix'].replace('n_', ''), 5)
            r['by_mkt_fix'] = means_by(sub, cols['mkt_fix'].replace('n_', ''), 5)
            r['by_xgi90'] = means_by(sub, 'xgi90', 5)
            # how much of the FDR spread does each FDR band carry in xG terms
            r['xg_fix_by_fdr'] = {int(k): round(float(v), 3) for k, v in sub.groupby('fdr')[cols['xg_fix'].replace('n_', '')].mean().items()}
        summary['positions'][pos] = r
        bp, sp = r['between_players'], r['same_player']
        print(f"{pos:3s} n={r['n']:6d} pts={r['mean_pts']:.2f} | between: fdr {bp['fdr']['concordance']:.3f} xg {bp['xg_fix']['concordance']:.3f} "
              f"mkt {bp['mkt_fix']['concordance']:.3f} xgi90 {bp['xgi90']['concordance']:.3f} pts90 {bp['pts90']['concordance']:.3f} price {bp['price']['concordance']:.3f} "
              f"| same: fdr {sp['fdr']['concordance']:.3f} end {sp['fdr_end']['concordance']:.3f} xg {sp['xg_fix']['concordance']:.3f} mkt {sp['mkt_fix']['concordance']:.3f} "
              f"| h2h xg {sp['h2h_xg_fix_v_fdr']['fix_right']} ({sp['h2h_xg_fix_v_fdr']['disagree_pairs']}) mkt {sp['h2h_mkt_fix_v_fdr']['fix_right']}")
    print(json.dumps({k: summary[k] for k in ('sample', 'starts', 'dropped', 'by_season', 'fdr_revised_share')}))

    if os.environ.get('SUPABASE_SERVICE_KEY'):
        from supabase import create_client
        sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
        sb.table('analysis_results').insert({'analysis_id': 'xg_vs_fdr', 'code_ref': os.environ.get('GITHUB_SHA', 'local'),
                                             'result': summary}).execute()
        print('Saved analysis_results xg_vs_fdr')


if __name__ == '__main__':
    main()
