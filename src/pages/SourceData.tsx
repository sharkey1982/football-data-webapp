import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLeagues, getRawMatchFiles, getSourceMatchRows, type RawMatchFile, type SourceMatchRow } from '../lib/api';

type LeagueOption = { league_id: number; code: string; name: string };

type SortState = { column: string; direction: 'asc' | 'desc' } | null;

/** Numeric-aware compare so odds/goals columns sort sensibly, falling back to string compare for anything non-numeric (team names, dates-as-text, etc). */
function compareRawValues(a: unknown, b: unknown): number {
  const aStr = a == null ? '' : String(a);
  const bStr = b == null ? '' : String(b);
  const aNum = aStr === '' ? NaN : Number(aStr);
  const bNum = bStr === '' ? NaN : Number(bStr);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
  return aStr.localeCompare(bStr);
}

export default function SourceData() {
  const [files, setFiles] = useState<RawMatchFile[]>([]);
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [seasonFilter, setSeasonFilter] = useState('');
  const [competitionFilter, setCompetitionFilter] = useState('');

  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [rows, setRows] = useState<SourceMatchRow[] | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [rowSearch, setRowSearch] = useState('');
  const [columnFilter, setColumnFilter] = useState('');
  const [sort, setSort] = useState<SortState>(null);

  useEffect(() => {
    setLoadingFiles(true);
    getRawMatchFiles()
      .then(setFiles)
      .catch((err) => setFilesError(err.message ?? 'Failed to load source files'))
      .finally(() => setLoadingFiles(false));
    getLeagues().then((data) => setLeagues((data ?? []) as LeagueOption[]));
  }, []);

  // Built from whatever the files actually contain -- never a fixed list,
  // since the raw layer is expected to grow into other seasons, other
  // competitions, and eventually other providers.
  const seasonOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const f of files) if (f.season_label) seen.add(f.season_label);
    return [...seen].sort((a, b) => b.localeCompare(a));
  }, [files]);

  const competitionOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const f of files) if (f.competition_code) seen.add(f.competition_code);
    return [...seen].sort();
  }, [files]);

  const filteredFiles = useMemo(() => {
    return files.filter(
      (f) =>
        (!seasonFilter || f.season_label === seasonFilter) &&
        (!competitionFilter || f.competition_code === competitionFilter)
    );
  }, [files, seasonFilter, competitionFilter]);

  const selectedFile = files.find((f) => f.raw_file_id === selectedFileId) ?? null;

  // Best-effort friendly name -- purely cosmetic, never assumed to exist.
  function friendlyCompetitionName(code: string | null): string | null {
    if (!code) return null;
    return leagues.find((l) => l.code === code)?.name ?? null;
  }

  function selectFile(fileId: number) {
    setSelectedFileId(fileId);
    setRows(null);
    setRowSearch('');
    setColumnFilter('');
    setSort(null);
    setRowsError(null);
    setLoadingRows(true);
    getSourceMatchRows(fileId)
      .then(setRows)
      .catch((err) => setRowsError(err.message ?? 'Failed to load rows'))
      .finally(() => setLoadingRows(false));
  }

  const visibleColumns = useMemo(() => {
    const all = selectedFile?.column_names ?? [];
    if (!columnFilter.trim()) return all;
    const q = columnFilter.trim().toLowerCase();
    return all.filter((c) => c.toLowerCase().includes(q));
  }, [selectedFile, columnFilter]);

  const visibleRows = useMemo(() => {
    if (!rows) return rows;
    let result = rows;
    const q = rowSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((r) => {
        if (r.source_home_team?.toLowerCase().includes(q)) return true;
        if (r.source_away_team?.toLowerCase().includes(q)) return true;
        return Object.values(r.raw_data).some((v) => v != null && String(v).toLowerCase().includes(q));
      });
    }
    if (sort) {
      result = [...result].sort((a, b) => {
        const cmp = compareRawValues(a.raw_data[sort.column], b.raw_data[sort.column]);
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, rowSearch, sort]);

  function toggleSort(column: string) {
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: 'asc' };
      if (current.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">Source Data</h1>
        <p className="text-ink-500 mt-1">
          Browse the raw files as retrieved from each provider, exactly as ingested.
        </p>
      </div>

      <div className="border border-ink-700 bg-ink-900 text-chalk-200 rounded-lg px-4 py-3 font-mono text-xs leading-relaxed">
        This is unprocessed source data &mdash; nothing here is used by any analytics, fixtures, or
        table on this site. Columns vary by file and provider and are shown exactly as ingested,
        without renaming or type conversion. For the cleaned dataset the app actually runs on, see{' '}
        <Link to="/results-data" className="text-amber-400 underline hover:text-amber-500">
          Results Data
        </Link>
        .
      </div>

      {filesError && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{filesError}</div>
      )}

      {!selectedFile ? (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <div>
              <label htmlFor="source-season" className="block text-sm font-medium text-ink-700 mb-1">
                Season
              </label>
              <select
                id="source-season"
                value={seasonFilter}
                onChange={(e) => setSeasonFilter(e.target.value)}
                className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
              >
                <option value="">All seasons</option>
                {seasonOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="source-competition" className="block text-sm font-medium text-ink-700 mb-1">
                Competition
              </label>
              <select
                id="source-competition"
                value={competitionFilter}
                onChange={(e) => setCompetitionFilter(e.target.value)}
                className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
              >
                <option value="">All competitions</option>
                {competitionOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {friendlyCompetitionName(c) ? ` \u2014 ${friendlyCompetitionName(c)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingFiles && <p className="text-ink-500 font-mono text-sm">Loading source files&hellip;</p>}

          {!loadingFiles && filteredFiles.length === 0 && (
            <p className="text-ink-500">No source files match this filter.</p>
          )}

          {!loadingFiles && filteredFiles.length > 0 && (
            <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-900 text-chalk-100">
                  <tr>
                    <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Season</th>
                    <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Competition</th>
                    <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Source</th>
                    <th className="text-right font-display uppercase text-xs tracking-wide px-3 py-2">Rows</th>
                    <th className="text-right font-display uppercase text-xs tracking-wide px-3 py-2">Columns</th>
                    <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Retrieved</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-chalk-200">
                  {filteredFiles.map((f) => (
                    <tr
                      key={f.raw_file_id}
                      className="hover:bg-chalk-100 transition-colors cursor-pointer"
                      onClick={() => selectFile(f.raw_file_id)}
                    >
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{f.season_label ?? '\u2013'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-xs">{f.competition_code ?? '\u2013'}</span>
                        {friendlyCompetitionName(f.competition_code) && (
                          <span className="text-ink-500 text-xs ml-1">
                            &mdash; {friendlyCompetitionName(f.competition_code)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-500 whitespace-nowrap">{f.source_name}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{f.row_count ?? '\u2013'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{f.column_names?.length ?? '\u2013'}</td>
                      <td className="px-3 py-2 text-xs text-ink-500 whitespace-nowrap">
                        {new Date(f.retrieved_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-xs text-pitch-700 font-medium whitespace-nowrap">View &rarr;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border border-chalk-300 rounded-lg bg-white px-4 py-3">
            <div>
              <button
                onClick={() => setSelectedFileId(null)}
                className="text-xs text-pitch-700 font-medium hover:underline mb-1"
              >
                &larr; Back to files
              </button>
              <p className="font-medium">
                {selectedFile.competition_code ?? selectedFile.source_code}
                {friendlyCompetitionName(selectedFile.competition_code) &&
                  ` \u2014 ${friendlyCompetitionName(selectedFile.competition_code)}`}{' '}
                <span className="text-ink-500 font-normal">
                  &middot; {selectedFile.season_label} &middot; {selectedFile.source_name}
                </span>
              </p>
              <p className="text-xs text-ink-500 font-mono">
                {selectedFile.row_count ?? rows?.length ?? '?'} rows &middot;{' '}
                {selectedFile.column_names?.length ?? 0} columns &middot; retrieved{' '}
                {new Date(selectedFile.retrieved_at).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr] gap-3">
            <div>
              <label htmlFor="source-row-search" className="block text-sm font-medium text-ink-700 mb-1">
                Search rows
              </label>
              <input
                id="source-row-search"
                type="text"
                value={rowSearch}
                onChange={(e) => setRowSearch(e.target.value)}
                placeholder="Team name or any value&hellip;"
                className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700 text-sm"
              />
            </div>
            <div>
              <label htmlFor="source-column-filter" className="block text-sm font-medium text-ink-700 mb-1">
                Filter columns
              </label>
              <input
                id="source-column-filter"
                type="text"
                value={columnFilter}
                onChange={(e) => setColumnFilter(e.target.value)}
                placeholder="e.g. B365, FT&hellip;"
                className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700 text-sm"
              />
            </div>
          </div>

          {rowsError && (
            <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{rowsError}</div>
          )}

          {loadingRows && <p className="text-ink-500 font-mono text-sm">Loading rows&hellip;</p>}

          {!loadingRows && visibleRows && visibleRows.length === 0 && (
            <p className="text-ink-500">No rows match this search.</p>
          )}

          {!loadingRows && visibleRows && visibleRows.length > 0 && (
            <>
              <p className="text-xs text-ink-500">
                Showing {visibleRows.length} of {rows?.length ?? 0} rows, {visibleColumns.length} of{' '}
                {selectedFile.column_names?.length ?? 0} columns. Click a column heading to sort.
              </p>
              <div className="border border-chalk-300 rounded-lg overflow-auto bg-white max-h-[70vh]">
                <table className="text-sm font-mono">
                  <thead className="bg-ink-900 text-chalk-100 sticky top-0">
                    <tr>
                      {visibleColumns.map((col) => (
                        <th
                          key={col}
                          onClick={() => toggleSort(col)}
                          className="text-left uppercase text-[10px] tracking-wide px-3 py-2 whitespace-nowrap cursor-pointer hover:bg-ink-700 select-none"
                          title={`Sort by ${col || '(unnamed column)'}`}
                        >
                          {col || '(unnamed)'}
                          {sort?.column === col && (sort.direction === 'asc' ? ' \u2191' : ' \u2193')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-chalk-200">
                    {visibleRows.map((r) => (
                      <tr key={r.source_match_row_id} className="hover:bg-chalk-100 transition-colors">
                        {visibleColumns.map((col) => (
                          <td key={col} className="px-3 py-1.5 text-xs whitespace-nowrap text-ink-700">
                            {r.raw_data[col] == null || r.raw_data[col] === '' ? (
                              <span className="text-chalk-300">&ndash;</span>
                            ) : (
                              String(r.raw_data[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
