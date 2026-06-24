import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { MatchTrendPoint } from '../lib/api';

// Recharts renders to canvas/SVG outside the Tailwind cascade, so it can't
// resolve CSS variables -- hardcoded hex values here are pulled directly
// from the theme tokens in index.css, kept in sync manually.
const COLORS = {
  pitch: '#1B4332', // --color-pitch-800, goals for
  loss: '#A63D40', // --color-loss-600, goals against
  ink500: '#6b7075',
  chalk300: '#d8d2bd',
};

export function GoalTrendChart({ data }: { data: MatchTrendPoint[] }) {
  const chartData = data.map((d, i) => ({
    index: i + 1,
    opponent: d.opponent,
    goalsFor: d.goalsFor,
    goalsAgainst: d.goalsAgainst,
    label: `${d.isHome ? 'v' : '@'} ${d.opponent}`,
  }));

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.pitch }} />
          Goals for
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.loss }} />
          Goals against
        </span>
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={COLORS.chalk300} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 11, fill: COLORS.ink500, fontFamily: 'monospace' }}
              axisLine={{ stroke: COLORS.chalk300 }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: COLORS.ink500, fontFamily: 'monospace' }}
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
                    <div className="font-mono">
                      {p.goalsFor} &ndash; {p.goalsAgainst}
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="goalsFor"
              stroke={COLORS.pitch}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS.pitch }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="goalsAgainst"
              stroke={COLORS.loss}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS.loss }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
