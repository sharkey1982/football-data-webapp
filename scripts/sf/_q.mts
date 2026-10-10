import { generateWorld } from '../../src/sharkfantasy/engine/world';
import { startSeason, playRound } from '../../src/sharkfantasy/engine/season';
import { publicView } from '../../src/sharkfantasy/fantasy/publicview';
import { projectRounds } from '../../src/sharkfantasy/fantasy/projection';
// projected v actual by type over 30 seasons (round-by-round projections)
const agg = new Map<string, { xp: number; act: number; n: number }>(); let sx = 0, sa = 0, se = 0, n = 0;
const bins = new Map<number, { xp: number; act: number; n: number }>();
for (let s = 0; s < 30; s++) {
  const w = generateWorld(`q-${s}`, 'q'); const ss = startSeason(w, 1);
  for (let r = 1; r <= 9; r++) {
    const pr = projectRounds(publicView(ss), [r]); playRound(ss);
    for (const x of pr) { const p = w.players.find(y => y.id === x.playerId)!; const a = ss.points[x.playerId][r - 1];
      const k = `${p.position} ${p.name}`; const g = agg.get(k) ?? { xp: 0, act: 0, n: 0 }; g.xp += x.xPoints; g.act += a; g.n++; agg.set(k, g);
      sx += x.xPoints; sa += a; se += (x.xPoints - a) ** 2; n++;
      const b = Math.min(6, Math.floor(x.xPoints)); const bb = bins.get(b) ?? { xp: 0, act: 0, n: 0 }; bb.xp += x.xPoints; bb.act += a; bb.n++; bins.set(b, bb); }
  }
}
console.log('mean xp', (sx / n).toFixed(2), 'actual', (sa / n).toFixed(2), 'mse', (se / n).toFixed(2));
console.log([...bins.entries()].sort((a, b) => a[0] - b[0]).map(([b, v]) => `${b}+: ${(v.xp / v.n).toFixed(2)}→${(v.act / v.n).toFixed(2)} (${v.n})`).join('  '));
const rows = [...agg.entries()].map(([k, g]) => ({ k, xp: g.xp / g.n, act: g.act / g.n })).sort((a, b) => b.act - a.act);
console.log(rows.slice(0, 12).map(r => `${r.k.padEnd(28)} proj ${r.xp.toFixed(2)} act ${r.act.toFixed(2)}`).join('\n'));
