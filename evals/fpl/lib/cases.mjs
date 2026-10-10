// The ten FPL eval cases. Each builds its context from the frozen snapshot
// and computes its expected values from the same data, so nothing expected
// is typed in by hand and nothing depends on the live database.
//
// expected (all optional; read by assertions/objective.mjs):
//   answer_type        allowed answer_type values
//   recommendation     regex the recommendation must match
//   not_recommendation regex the recommendation must not match
//   ranking_order      names that must appear in this order in output.ranking
//   must_cite          source ids that must appear in output.facts
//   must_state         [{ value, tol, why }] numbers that must appear (answer text or facts)
//   confidence_not     confidence values that are wrong here
//   missing_data       terms output.missing_data must mention
//   no_facts_about     names no fact may be about
//   answer_regex       [{ re, why }] the answer text must match
//   max_words          word limit for the answer text
import { Context, loadSnapshot, player, TEAM_NAMES } from './snapshot.mjs';

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const SITE = 'https://fixtureshark.com';

function byXpts(ps) { return [...ps].sort((a, b) => b.xpts - a.xpts); }

// ------------------------------------------------------------------ cases
export function buildCases() {
  const { fixtures, articles } = loadSnapshot();
  const cases = [];

  // 1. Captaincy, mid-price shortlist with a near tie.
  {
    const ps = ['Mbeumo', 'Tavernier', 'Gibbs-White', 'Ødegaard'].map((n) => player(n));
    const ranked = byXpts(ps);
    const ctx = new Context().players('GW6 shortlist', ps, ['xpts', 'start', 'xmins', 'xg', 'xa', 'own']);
    cases.push({
      id: 'T01', category: 'captaincy',
      description: 'T01 captaincy: mid-price shortlist with a near tie at the top',
      question: 'I have no premium captain this week. Who should I captain in GW6 from Mbeumo, Tavernier, Gibbs-White and Ødegaard?',
      ctx,
      expected: {
        answer_type: ['answered'],
        recommendation: new RegExp(ranked[0].name, 'i'),
        ranking_order: ranked.slice(0, 2).map((p) => p.name),
        must_cite: ranked.slice(0, 2).map((p) => `P${p.id}.xpts`),
        confidence_not: ['high'],
        _notes: `top ${ranked[0].name} ${ranked[0].xpts} v ${ranked[1].name} ${ranked[1].xpts}: gap ${round(ranked[0].xpts - ranked[1].xpts)}, a coin flip`,
      },
    });
  }

  // 2. Player comparison (the r/FantasyPL forwards thread).
  {
    const ps = ['Barry', 'Gonzalo', 'Kostoulas'].map((n) => player(n));
    const ranked = byXpts(ps);
    const ctx = new Context().players('Players to compare', ps, ['price', 'xpts', 'start', 'xmins', 'xg', 'season_pts', 'season_mins']);
    cases.push({
      id: 'T02', category: 'comparison',
      description: 'T02 comparison: Barry v Gonzalo v Kostoulas for GW6',
      question: 'Barry, Gonzalo or Kostoulas for GW6? I can afford any of them. Compare them and pick one.',
      ctx,
      expected: {
        answer_type: ['answered'],
        recommendation: new RegExp(ranked[0].name, 'i'),
        ranking_order: ranked.map((p) => p.name),
        must_cite: ps.map((p) => `P${p.id}.xpts`),
      },
    });
  }

  // 3. FDR against the market and Dixon-Coles (the site's conviction rule).
  {
    const teams = ['FUL', 'MCI', 'TOT', 'COV', 'ARS', 'EVE'];
    const fx = fixtures.filter((f) => f.gw >= 7 && f.gw <= 10 && (teams.includes(f.home) || teams.includes(f.away)));
    const agg = Object.fromEntries(teams.map((t) => [t, { fdr: [], mkt: [], dc: [] }]));
    for (const f of fx) {
      if (agg[f.home]) { agg[f.home].fdr.push(f.fdr_home); agg[f.home].mkt.push(f.mkt_home); agg[f.home].dc.push(f.dc_home); }
      if (agg[f.away]) { agg[f.away].fdr.push(f.fdr_away); agg[f.away].mkt.push(f.mkt_away); agg[f.away].dc.push(f.dc_away); }
    }
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const rows = teams.map((t) => ({ t, fdr: mean(agg[t].fdr), mkt: mean(agg[t].mkt), dc: mean(agg[t].dc) }));
    const byFdr = [...rows].sort((a, b) => a.fdr - b.fdr);
    const byMkt = [...rows].sort((a, b) => b.mkt - a.mkt);
    const byDc = [...rows].sort((a, b) => b.dc - a.dc);
    if (byMkt[0].t !== byDc[0].t || byMkt[1].t !== byDc[1].t) throw new Error('T03: market and DC no longer agree on the top two');
    if (byFdr[0].fdr === byFdr[1].fdr) throw new Error('T03: FDR tie at the top');
    const ctx = new Context().fixtures('GW7-10 fixtures (FDR: 1 easiest, 5 hardest; goals are model estimates of goals scored)', fx);
    cases.push({
      id: 'T03', category: 'fdr',
      description: 'T03 FDR: easiest FDR run v expected goals for GW7-10',
      question: `For gameweeks 7 to 10, which of ${teams.map((t) => TEAM_NAMES[t]).join(', ')} has the best attacking fixtures? Does FPL's FDR agree? House rule: only make a team-level claim where the market and Dixon-Coles agree.`,
      ctx,
      expected: {
        answer_type: ['answered'],
        recommendation: new RegExp(TEAM_NAMES[byMkt[0].t].replace(' ', '\\s*'), 'i'),
        ranking_order: byMkt.slice(0, 2).map((r) => TEAM_NAMES[r.t]),
        must_state: [
          { value: round(byFdr[0].fdr), tol: 0.011, why: `${TEAM_NAMES[byFdr[0].t]} average FDR GW7-10 (easiest by FDR)` },
          { value: round(byMkt[0].mkt), tol: 0.011, why: `${TEAM_NAMES[byMkt[0].t]} average market goals GW7-10` },
          { value: round(byDc[0].dc), tol: 0.011, why: `${TEAM_NAMES[byDc[0].t]} average Dixon-Coles goals GW7-10` },
        ],
        answer_regex: [{ re: new RegExp(TEAM_NAMES[byFdr[0].t], 'i'), why: `names ${TEAM_NAMES[byFdr[0].t]} as FDR's easiest run` }],
        _notes: `FDR easiest ${byFdr[0].t} ${round(byFdr[0].fdr)}; market top ${byMkt[0].t} ${round(byMkt[0].mkt, 3)}, ${byMkt[1].t}; DC top ${byDc[0].t} ${round(byDc[0].dc, 3)}, ${byDc[1].t}`,
      },
    });
  }

  // 4. Budget optimisation: best pair of available midfielders within £13.0m.
  {
    const { players } = loadSnapshot();
    const mids = players.filter((p) => p.pos === 'MID' && p.status === 'a').sort((a, b) => b.xpts - a.xpts).slice(0, 20);
    const budget = 13.0;
    let best = null; let second = null;
    for (let i = 0; i < mids.length; i++) for (let j = i + 1; j < mids.length; j++) {
      const cost = round(mids[i].price + mids[j].price, 1);
      if (cost > budget) continue;
      const xp = round(mids[i].xpts + mids[j].xpts);
      const pair = { a: mids[i], b: mids[j], cost, xp };
      if (!best || xp > best.xp) { second = best; best = pair; } else if (!second || xp > second.xp) second = pair;
    }
    if (second && second.xp === best.xp) throw new Error('T04: tie for the best pair');
    const ctx = new Context().players('Available midfielders (top 20 by GW6 projection)', mids, ['price', 'xpts']);
    cases.push({
      id: 'T04', category: 'budget',
      description: `T04 budget: best two midfielders within £${budget.toFixed(1)}m`,
      question: `I have £${budget.toFixed(1)}m for two midfielders for GW6. Which pair from this list gives the most projected points within budget? Give the total cost and total projected points.`,
      ctx,
      expected: {
        answer_type: ['answered'],
        recommendation: new RegExp(`(?=.*${best.a.name})(?=.*${best.b.name})`, 'is'),
        must_cite: [`P${best.a.id}.xpts`, `P${best.b.id}.xpts`, `P${best.a.id}.price`, `P${best.b.id}.price`],
        must_state: [
          { value: best.xp, tol: 0.011, why: 'combined projected points of the best pair' },
          { value: best.cost, tol: 0.05, why: 'combined price of the best pair' },
        ],
        _notes: `best ${best.a.name}+${best.b.name} £${best.cost}m ${best.xp}; next ${second.a.name}+${second.b.name} £${second.cost}m ${second.xp}`,
      },
    });
  }

  // 5. Injuries: flagged Arsenal players, one ruled out.
  {
    const ps = ['Havertz', 'Rice', 'Konsa', 'Tzolis'].map((n) => player(n, 'ARS'));
    const ranked = byXpts(ps);
    const out = ps.find((p) => p.status === 'i');
    const ctx = new Context().players('My flagged Arsenal players', ps, ['chance', 'start', 'xmins', 'xpts']);
    cases.push({
      id: 'T05', category: 'injuries',
      description: 'T05 injuries: three doubtful Arsenal players and one ruled out',
      question: 'Havertz, Rice, Konsa and Tzolis are all flagged. Which of them are likely to play in GW6, and how do their projections compare?',
      ctx,
      expected: {
        answer_type: ['answered'],
        ranking_order: ranked.map((p) => p.name),
        must_cite: [`P${out.id}.start`, ...ranked.slice(0, 3).map((p) => `P${p.id}.start`)],
        answer_regex: [
          { re: new RegExp(`${out.name}[^\\n]{0,160}?(\\bout\\b|injur|won't|will not|not (expected|likely) to|unavailable|ruled out|no chance|0%|zero)`, 'i'), why: `says ${out.name} won't play` },
          { re: /24 Oct/i, why: `gives ${out.name}'s expected return date from the news` },
        ],
        _notes: `${out.name} injured (${out.news}); others d at ~75%`,
      },
    });
  }

  // 6. Missing data: one player is not in the data at all.
  {
    const saka = player('Saka');
    const ctx = new Context().players('Players in the data', [saka], ['xpts', 'start']);
    cases.push({
      id: 'T06', category: 'missing_data',
      description: 'T06 missing data: asks about a player who is not in the data',
      question: 'How many points will Ollie Watkins and Saka get in GW6?',
      ctx,
      expected: {
        answer_type: ['partial'],
        must_cite: [`P${saka.id}.xpts`],
        missing_data: ['Watkins'],
        no_facts_about: ['Watkins'],
      },
    });
  }

  // 7. Reddit reply: Isidor while Brobbey is injured.
  {
    const d = articles.decisions; const isi = d.players.Isidor;
    const brobbey = player('Brobbey'); const isidor = player('Isidor');
    const ctx = new Context()
      .items(`Isidor projections by gameweek (FixtureShark model estimate, made ${d.as_of})`,
        d.gws.map((gw, i) => [`I.xp.gw${gw}`, isi.xp[i], `Isidor projected points GW${gw}`])
          .concat(d.gws.map((gw, i) => [`I.start.gw${gw}`, isi.start[i], `Isidor probability of starting GW${gw}`])),
        `Note from the model: ${isi.note}`)
      .players('FPL deadline snapshot, 10 Oct 2026', [isidor, brobbey], ['price', 'xpts', 'own', 'season_mins']);
    const slugs = [isidor.slug, brobbey.slug];
    cases.push({
      id: 'T07', category: 'reddit',
      description: 'T07 Reddit reply: is Isidor worth it while Brobbey is out?',
      question: `Draft a Reddit reply (r/FantasyPL) from the FixtureShark account to: "Is Isidor a decent punt while Brobbey's out or is it a trap?" Keep it under 130 words, use a friendly, plain tone, and end with a link to compare the two on ${SITE}/fpl/compare?players=<slug>,<slug>&from=6&to=10. Put the reply itself in "answer".`,
      ctx,
      expected: {
        answer_type: ['answered'],
        must_cite: ['I.xp.gw6', 'I.xp.gw8'],
        answer_regex: [
          { re: new RegExp(`${SITE.replace(/\./g, '\\.')}/fpl/compare\\?players=(${slugs.join('|')}),(${slugs.join('|')})`), why: 'links Compare Players with both slugs' },
          { re: /(25 Oct|Brobbey (is |'s )?back|returns?)/i, why: 'says when Brobbey is due back' },
        ],
        max_words: 130,
      },
    });
  }

  // 8. Transfer with a hit.
  {
    const d = articles.decisions; const w = d.players.Wissa; const c = d.players['Calvert-Lewin'];
    const gain = (n) => round(c.xp.slice(0, n).reduce((a, b) => a + b, 0) - w.xp.slice(0, n).reduce((a, b) => a + b, 0));
    let cum = 0; let breakEven = null; let clearsHit = null;
    d.gws.forEach((gw, i) => { cum += c.xp[i] - w.xp[i]; if (breakEven == null && cum > 0) breakEven = gw; if (clearsHit == null && cum > d.hit) clearsHit = gw; });
    const ctx = new Context().items(`Projected points by gameweek (FixtureShark model estimate, made ${d.as_of}); a hit costs ${d.hit} points`,
      ['Wissa', 'Calvert-Lewin'].flatMap((n) => d.gws.map((gw, i) => [`${n === 'Wissa' ? 'W' : 'C'}.xp.gw${gw}`, d.players[n].xp[i], `${n} projected points GW${gw}`])));
    cases.push({
      id: 'T08', category: 'transfers',
      description: 'T08 transfer: Wissa to Calvert-Lewin for a -4 hit over five weeks',
      question: 'Is Wissa → Calvert-Lewin worth a -4 hit if I keep Calvert-Lewin for GW6 to GW10? When does the move break even, and when would it pay for the hit?',
      ctx,
      expected: {
        answer_type: ['answered'],
        recommendation: /\b(no|not worth|don'?t|do not|avoid|wait|skip|free transfer)\b/i,
        not_recommendation: /^\s*yes\b/i,
        must_state: [{ value: gain(5), tol: 0.02, why: 'projected gain over GW6-10 before the hit' }],
        answer_regex: [
          { re: new RegExp(`(GW|gameweek)\\s*${breakEven}\\b`, 'i'), why: `break-even gameweek (GW${breakEven})` },
          { re: new RegExp(`(GW|gameweek)\\s*${clearsHit}\\b`, 'i'), why: `gameweek the gain first exceeds the hit (GW${clearsHit})` },
        ],
        _notes: `gain GW6-10 ${gain(5)}, GW6-15 ${gain(10)}; break-even GW${breakEven}; clears hit GW${clearsHit}`,
      },
    });
  }

  // 9. Analysis question: is FDR useless?
  {
    const x = articles.xg_vs_fdr;
    const ctx = new Context().items(`FixtureShark study, ${x.seasons}, ${x.starts} Premier League starts. ${x.metric}`, [
      ['X.between.fdr', x.between_players_all.fdr, 'Between players (same gameweek and position): FDR'],
      ['X.between.xg', x.between_players_all.xg, 'Between players: xG fixture rating'],
      ['X.between.mkt', x.between_players_all.mkt, 'Between players: market team goals'],
      ['X.between.xgi90', x.between_players_all.xgi90, 'Between players: player xGI per 90'],
      ['X.same.fdr', x.same_player_all.fdr, "Same player, timing his weeks: FDR"],
      ['X.same.xg', x.same_player_all.xg, 'Same player: xG fixture rating'],
      ['X.same.mkt', x.same_player_all.mkt, 'Same player: market team goals'],
    ]);
    cases.push({
      id: 'T09', category: 'fdr',
      description: 'T09 analysis: is FDR useless compared with xG?',
      question: 'Someone on Reddit says FDR is useless and you should only use xG. Is that right?',
      ctx,
      expected: {
        answer_type: ['answered'],
        not_recommendation: /^\s*yes\b/i,
        must_cite: ['X.between.fdr', 'X.between.xg', 'X.same.fdr', 'X.same.xg'],
        answer_regex: [{ re: /market/i, why: 'mentions that market team goals did best' }],
      },
    });
  }

  // 10. Captaincy: Haaland away at Liverpool v Saka.
  {
    const h = player('Haaland'); const s = player('Saka'); const a = articles.haaland;
    const pts = a.big_away_points;
    const ctx = new Context()
      .players('GW6 projections', [h, s], ['xpts', 'start', 'xg'])
      .fixtures('GW6 fixtures', fixtures.filter((f) => [h.fixture_id, s.fixture_id].includes(f.id)), { fdr: false })
      .items(`Haaland's FPL history, ${a.seasons} (observed)`, [
        ['H.home.points', a.venue[0].points, 'points per start at home'],
        ['H.away.points', a.venue[1].points, 'points per start away'],
        ...a.by_city_goals.map((b, i) => [`H.band${i}.points`, b.points, `points per start when City's market goals were ${b.band}`]),
        ['H.bigaway.starts', pts.length, 'starts away at Arsenal, Liverpool, Chelsea, Tottenham, Man United, Newcastle'],
        ['H.bigaway.avg', round(pts.reduce((x, y) => x + y, 0) / pts.length), 'average points in those starts'],
        ['H.bigaway.blanks', pts.filter((p) => p <= 2).length, 'blanks (2 points or fewer) in those starts'],
      ]);
    cases.push({
      id: 'T10', category: 'captaincy',
      description: 'T10 captaincy: Haaland away at Liverpool v Saka at home',
      question: 'Do I captain Haaland away at Liverpool this week, or Saka at home to Leeds?',
      ctx,
      expected: {
        answer_type: ['answered'],
        recommendation: new RegExp(byXpts([h, s])[0].name, 'i'),
        must_cite: [`P${h.id}.xpts`, `P${s.id}.xpts`],
        confidence_not: ['high'],
        _notes: `Saka ${s.xpts} v Haaland ${h.xpts}; City market goals at LIV ${fixtures.find((f) => f.id === h.fixture_id).mkt_away}`,
      },
    });
  }

  return cases;
}
