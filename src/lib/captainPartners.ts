// ============================================================================
// src/lib/captainPartners.ts
//
// Captain planner arithmetic (the "one captain or two?" article, 9 Oct 2026).
// Given up to three players' projected points per gameweek, the armband goes
// each week to whoever is projected highest. Captain points are the
// armband's extra copy of that player's points. The rotation gain is what
// the set adds over the best single option captained every week:
//     gain = SUM_t max_i P_i,t - max_i SUM_t P_i,t
// Weeks with no projection for a player count as 0 for him (blank gameweek).
// ============================================================================

export type PartnerInput = { id: number; name: string; price: number | null; xp: Map<number, number>; start: Map<number, number> };

export type CaptainWeek = { gw: number; captainId: number | null; points: number; margin: number | null };

export type CaptainPlan = {
  weeks: CaptainWeek[];
  captainPoints: number;
  best: { id: number; total: number } | null;
  gain: number;
  armbands: Map<number, number>;
  cost: number | null;
  avgStart: Map<number, number | null>;
};

export function captainPlan(players: PartnerInput[], gws: number[]): CaptainPlan {
  const armbands = new Map<number, number>(players.map((p) => [p.id, 0]));
  const weeks: CaptainWeek[] = gws.map((gw) => {
    const ranked = players
      .map((p) => ({ id: p.id, v: p.xp.get(gw) ?? 0 }))
      .sort((a, b) => b.v - a.v);
    if (ranked.length === 0 || ranked[0].v <= 0) return { gw, captainId: null, points: 0, margin: null };
    armbands.set(ranked[0].id, (armbands.get(ranked[0].id) ?? 0) + 1);
    return { gw, captainId: ranked[0].id, points: ranked[0].v, margin: ranked.length > 1 ? ranked[0].v - ranked[1].v : null };
  });
  const captainPoints = weeks.reduce((t, w) => t + w.points, 0);
  const totals = players.map((p) => ({ id: p.id, total: gws.reduce((t, gw) => t + (p.xp.get(gw) ?? 0), 0) }));
  const best = totals.length ? totals.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  const prices = players.map((p) => p.price);
  const cost = prices.every((x) => x != null) && prices.length ? prices.reduce((t, x) => t + (x as number), 0) : null;
  const avgStart = new Map(
    players.map((p) => {
      const vals = gws.map((gw) => p.start.get(gw)).filter((v): v is number => v != null);
      return [p.id, vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : null];
    })
  );
  return { weeks, captainPoints, best, gain: best ? captainPoints - best.total : 0, armbands, cost, avgStart };
}
