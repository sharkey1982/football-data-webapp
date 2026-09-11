import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getLeagues, getCountries, getSeasons, getLeagueTable, type LeagueTableRow } from '../lib/api';

type LeagueOption = {
  league_id: number;
  code: string;
  name: string;
  country_id: number | null;
  competition_type: string | null;
};
type CountryOption = { country_id: number; name: string; code: string | null };
type SeasonOption = { season_id: number; label: string; start_year: number; end_year: number };

const selectClass =
  'w-full border border-chalk-300 rounded px-2.5 py-2 text-sm bg-white focus:border-pitch-700';
const labelClass = 'block text-xs sm:text-sm font-medium text-ink-700 mb-1';

export default function LeagueTable() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlLeagueId = searchParams.get('league') ? Number(searchParams.get('league')) : null;
  const urlSeasonId = searchParams.get('season') ? Number(searchParams.get('season')) : null;
  const urlCountryId = searchParams.get('country') ? Number(searchParams.get('country')) : null;

  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);

  const [countryId, setCountryId] = useState<number | null>(urlCountryId);
  const [leagueId, setLeagueId] = useState<number | null>(urlLeagueId);
  const [seasonId, setSeasonId] = useState<number | null>(urlSeasonId);

  const [rows, setRows] = useState<LeagueTableRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cup competitions don't have a standings table in this app's model --
  // only ever offer proper leagues here (the Fixtures/Raw Data pages are
  // where cup fixtures/results live).
  const leagueDivisions = useMemo(
    () => leagues.filter((l) => l.competition_type === 'league'),
    [leagues]
  );
  const filteredLeagues = useMemo(
    () => leagueDivisions.filter((l) => !countryId || l.country_id === countryId),
    [leagueDivisions, countryId]
  );

  useEffect(() => {
    getLeagues().then((data) => {
      const loaded = (data ?? []) as LeagueOption[];
      setLeagues(loaded);
      setLeagueId(
        (current) => current ?? loaded.find((l) => l.code === 'E0' && l.competition_type === 'league')?.league_id ?? null
      );
    });
    getCountries().then((data) => setCountries(data ?? []));
    getSeasons().then((data) => {
      const loaded = data ?? [];
      setSeasons(loaded);
      setSeasonId((current) => current ?? loaded[0]?.season_id ?? null);
    });
  }, []);

  // Keep the current Division valid against the Country filter, same
  // pattern as the Fixtures/Raw Data pages.
  useEffect(() => {
    if (filteredLeagues.length === 0) return;
    if (leagueId && filteredLeagues.some((l) => l.league_id === leagueId)) return;
    setLeagueId(filteredLeagues[0].league_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeagues]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (countryId) params.country = String(countryId);
    if (leagueId) params.league = String(leagueId);
    if (seasonId) params.season = String(seasonId);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, leagueId, seasonId]);

  useEffect(() => {
    if (!leagueId || !seasonId) {
      setRows(null);
      return;
    }
    setLoading(true);
    setError(null);
    getLeagueTable(leagueId, seasonId)
      .then(setRows)
      .catch((err) => setError(err.message ?? 'Failed to build the table'))
      .finally(() => setLoading(false));
  }, [leagueId, seasonId]);

  const anyDeductions = rows?.some((r) => r.pointsAdjustment !== 0) ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">League Table</h1>
        <p className="text-ink-500 mt-1">
          Standings computed from results so far, including any manual point adjustments.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
        <div>
          <label className={labelClass}>Country</label>
          <select
            value={countryId ?? ''}
            onChange={(e) => setCountryId(e.target.value ? Number(e.target.value) : null)}
            className={selectClass}
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.country_id} value={c.country_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Division</label>
          <select
            value={leagueId ?? ''}
            onChange={(e) => setLeagueId(e.target.value ? Number(e.target.value) : null)}
            className={selectClass}
          >
            <option value="">Select&hellip;</option>
            {filteredLeagues.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.code} &mdash; {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Season</label>
          <select
            value={seasonId ?? ''}
            onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)}
            className={selectClass}
          >
            <option value="">Select&hellip;</option>
            {seasons.map((s) => (
              <option key={s.season_id} value={s.season_id}>
                {s.start_year}/{String(s.end_year).slice(2)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}

      {loading && <p className="text-ink-500 font-mono text-sm">Building table&hellip;</p>}

      {!loading && rows && rows.length === 0 && (
        <p className="text-ink-500">No results yet for this division/season.</p>
      )}

      {!loading && rows && rows.length > 0 && (
        <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pitch-900 text-chalk-100">
              <tr>
                <th className="text-right font-display uppercase text-xs tracking-wide px-3 py-2 w-10">#</th>
                <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Team</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-2 py-2">P</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-2 py-2">W</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-2 py-2">D</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-2 py-2">L</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-2 py-2">GF</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-2 py-2">GA</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-2 py-2">GD</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-3 py-2">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-chalk-200">
              {rows.map((r, i) => (
                <tr key={r.team_id} className="hover:bg-chalk-100 transition-colors">
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{r.team_name}</td>
                  <td className="px-2 py-2 text-center font-mono text-xs">{r.played}</td>
                  <td className="px-2 py-2 text-center font-mono text-xs">{r.won}</td>
                  <td className="px-2 py-2 text-center font-mono text-xs">{r.drawn}</td>
                  <td className="px-2 py-2 text-center font-mono text-xs">{r.lost}</td>
                  <td className="px-2 py-2 text-center font-mono text-xs text-ink-500">{r.goalsFor}</td>
                  <td className="px-2 py-2 text-center font-mono text-xs text-ink-500">{r.goalsAgainst}</td>
                  <td className="px-2 py-2 text-center font-mono text-xs text-ink-500">
                    {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                  </td>
                  <td className="px-3 py-2 text-center font-mono font-bold">
                    {r.points}
                    {r.pointsAdjustment !== 0 && (
                      <span
                        className="ml-1 text-[10px] font-medium text-loss-700 align-top"
                        title={r.deductions.map((d) => d.reason).filter(Boolean).join('; ') || undefined}
                      >
                        ({r.pointsAdjustment > 0 ? '+' : ''}
                        {r.pointsAdjustment})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {anyDeductions && (
            <div className="px-4 py-3 border-t border-chalk-300 bg-chalk-100 text-xs text-ink-500 space-y-1">
              {rows
                .filter((r) => r.pointsAdjustment !== 0)
                .flatMap((r) => r.deductions.map((d) => ({ team: r.team_name, ...d })))
                .map((d) => (
                  <p key={d.deduction_id}>
                    <span className="font-medium text-ink-700">{d.team}</span>:{' '}
                    {d.points > 0 ? '+' : ''}
                    {d.points} pts{d.reason ? ` \u2014 ${d.reason}` : ''}
                  </p>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
