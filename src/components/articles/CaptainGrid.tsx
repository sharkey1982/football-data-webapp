// ============================================================================
// src/components/articles/CaptainGrid.tsx
//
// Who wears the armband each gameweek under different sets of captaincy
// options: one row per set, one column per gameweek. Each cell names the
// captain (text, so identity never rests on colour) with a colour bar and
// his projected points. A real table, so it reads without the colours and
// scrolls sideways on a phone rather than squashing.
// ============================================================================

type Row = { label: string; path: [string, number][]; total: number };

type Props = {
  caption: string;
  gws: number[];
  rows: Row[];
  colour: (name: string) => string;
  short?: (name: string) => string;
};

export default function CaptainGrid({ caption, gws, rows, colour, short = (n) => n }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-chalk-300 bg-white">
      <table className="text-xs border-collapse w-full min-w-[640px]">
        <caption className="text-left font-display uppercase tracking-wide text-sm text-ink-900 px-3 pt-3 pb-2">{caption}</caption>
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            <th scope="col" className="text-left font-medium px-2 py-1.5 sticky left-0 bg-chalk-200">Captaincy options</th>
            {gws.map((g) => <th key={g} scope="col" className="font-medium px-1 py-1.5 text-center">GW{g}</th>)}
            <th scope="col" className="font-medium px-2 py-1.5 text-right">Captain pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
              <th scope="row" className={`text-left font-normal px-2 py-1.5 whitespace-nowrap sticky left-0 ${i % 2 ? 'bg-chalk-100' : 'bg-white'}`}>{r.label}</th>
              {r.path.map(([name, pts], j) => (
                <td key={j} className="px-1 py-1.5 text-center align-top" title={`GW${gws[j]}: ${name}, ${pts.toFixed(2)} projected`}>
                  <span className="block h-1.5 rounded-sm mx-auto w-full max-w-[3.25rem]" style={{ background: colour(name) }} aria-hidden="true" />
                  <span className="block mt-0.5 text-ink-900 leading-tight">{short(name)}</span>
                  <span className="block font-mono text-[10px] text-ink-500 tabular-nums">{pts.toFixed(1)}</span>
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-900">{r.total.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
