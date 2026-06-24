import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { MatchTrendPoint } from '../lib/api';

const RESULT_COLORS: Record<string, string> = {
  W: '#265c43', // --color-pitch-700
  D: '#d8d2bd', // --color-chalk-300
  L: '#A63D40', // --color-loss-600
};

/**
 * Bar height = goal difference for that match (positive = win margin,
 * negative = loss margin, near-zero = draw), colored by result. This shows
 * both "did they win" and "by how much" in one glance, which a plain
 * W/D/L letter sequence can't.
 */
export function FormSequenceChart({ data }: { data: MatchTrendPoint[] }) {
  const chartData = data.map((d, i) => ({
    index: i + 1,
    goalDiff: d.goalsFor - d.goalsAgainst,
    result: d.result,
    label: `${d.isHome ? 'v' : '@'} ${d.opponent}`,
    score: `${d.goalsFor}-${d.goalsAgainst}`,
  }));

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs font-mono">
        {(['W', 'D', 'L'] as const).map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: RESULT_COLORS[r] }} />
            {r === 'W' ? 'Win' : r === 'D' ? 'Draw' : 'Loss'}
          </span>
        ))}
      </div>
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="#d8d2bd" strokeDasharray="3 3" vertical={false} />
            <ReferenceLine y={0} stroke="#6b7075" strokeWidth={1} />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 11, fill: '#6b7075', fontFamily: 'monospace' }}
              axisLine={{ stroke: '#d8d2bd' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#6b7075', fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="bg-white border border-chalk-300 rounded px-3 py-2 text-xs shadow-lg">
                    <div className="font-medium mb-1">{p.label}</div>
                    <div className="font-mono">{p.score}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="goalDiff" radius={[2, 2, 2, 2]} isAnimationActive={false}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={RESULT_COLORS[entry.result]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
