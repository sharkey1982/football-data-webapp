import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MatchPage from '../pages/football/MatchPage';
import { mostLikelyScore } from '../lib/matchPageApi';
import { calculateDixonColes } from '../lib/dixonColes';
import * as matchApi from '../lib/matchPageApi';
import * as broadcastsApi from '../lib/broadcastsApi';
import * as commercialLinks from '../lib/commercialLinks';
import * as analytics from '../lib/analytics';

vi.mock('../lib/matchPageApi', async () => {
  const actual = await vi.importActual<typeof matchApi>('../lib/matchPageApi');
  return { ...actual, getMatchBySlug: vi.fn() };
});
vi.mock('../lib/broadcastsApi', async () => {
  const actual = await vi.importActual<typeof broadcastsApi>('../lib/broadcastsApi');
  return { ...actual, getFixtureBroadcast: vi.fn().mockResolvedValue([]) };
});
vi.mock('../lib/commercialLinks', async () => {
  const actual = await vi.importActual<typeof commercialLinks>('../lib/commercialLinks');
  return { ...actual, getActivePartners: vi.fn().mockResolvedValue([]) };
});
vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }));

const mocked = matchApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedBroadcasts = vi.mocked(broadcastsApi);
const mockedCommercialLinks = vi.mocked(commercialLinks);
const mockedTrackEvent = vi.mocked(analytics.trackEvent);

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/football/matches/${slug}`]}>
      <Routes>
        <Route path="/football/matches/:slug" element={<MatchPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('match prediction maths', () => {
  it('reproduces the fixture\u2019s own frozen expected goals exactly when fed log-lambdas', () => {
    // This is the load-bearing assumption in matchPageApi.getMatchBySlug:
    // calculateDixonColes derives lambdas from ratings, so feeding it
    // ln(lambda) with zeroed home advantage and defence must return the
    // original lambdas untouched. If this ever stopped holding, every
    // match page would silently show probabilities computed from
    // different expected goals than the ones it displays.
    const lambdaHome = 2.01139517231193;
    const lambdaAway = 0.42421633218266;
    const result = calculateDixonColes({
      homeAttack: Math.log(lambdaHome),
      homeDefence: 0,
      awayAttack: Math.log(lambdaAway),
      awayDefence: 0,
      rho: -0.126296876967287,
      homeAdvantage: 0,
    });
    expect(result.expectedHomeGoals).toBeCloseTo(lambdaHome, 10);
    expect(result.expectedAwayGoals).toBeCloseTo(lambdaAway, 10);
    // And the outcome probabilities should be a sane, normalised set.
    const total = result.homeWinPct + result.drawPct + result.awayWinPct;
    expect(total).toBeCloseTo(100, 6);
    expect(result.homeWinPct).toBeGreaterThan(result.awayWinPct); // heavy home favourite
  });

  it('finds the single highest-probability scoreline in the grid', () => {
    const model = calculateDixonColes({
      homeAttack: Math.log(1.6),
      homeDefence: 0,
      awayAttack: Math.log(1.1),
      awayDefence: 0,
      rho: -0.12,
      homeAdvantage: 0,
    });
    const best = mostLikelyScore(model);
    let maxSeen = -1;
    for (const row of model.scoreGrid) for (const cell of row) maxSeen = Math.max(maxSeen, cell);
    expect(best.probability).toBeCloseTo(maxSeen, 12);
  });
});

describe('MatchPage', () => {
  const base = {
    fixture_id: 501,
    slug: 'arsenal-v-coventry-2026-08-21',
    home_team_name: 'Arsenal',
    away_team_name: 'Coventry',
    home_team_slug: 'arsenal',
    away_team_slug: 'coventry',
    kickoff_date: '2026-08-21',
    matchweek: 1,
    league_name: 'Premier League',
    predicted_home_goals: 2.01,
    predicted_away_goals: 0.42,
    predicted_at: '2026-09-11T08:23:25Z',
    fit_run_id: 2,
    model: calculateDixonColes({
      homeAttack: Math.log(2.01),
      homeDefence: 0,
      awayAttack: Math.log(0.42),
      awayDefence: 0,
      rho: -0.126,
      homeAdvantage: 0,
    }),
  };

  it('states outcome probabilities in prose and in a real table', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'scheduled', actual_home_goals: null, actual_away_goals: null });
    renderAt(base.slug);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Arsenal v Coventry' })).toBeInTheDocument());
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Arsenal win' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Draw' })).toBeInTheDocument();
    // Prose version of the same numbers, so the page answers the question
    // without needing the table parsed.
    expect(screen.getByText(/chance of\s+winning/)).toBeInTheDocument();
    expect(screen.getByText(/most likely scoreline/)).toBeInTheDocument();
  });

  it('shows the real result alongside the pre-kickoff prediction for a played match', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'played', actual_home_goals: 3, actual_away_goals: 0 });
    renderAt(base.slug);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument());
    expect(screen.getByText(/Arsenal 3\u20130 Coventry/)).toBeInTheDocument();
    // Framed in the past tense -- it's explicitly what was predicted
    // beforehand, not a recomputed hindsight number.
    expect(screen.getByRole('heading', { name: 'What the model predicted beforehand' })).toBeInTheDocument();
  });

  it('shows Where to watch with channel, streaming and free-to-air, and puts it in the page metadata', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'scheduled', actual_home_goals: null, actual_away_goals: null });
    mockedBroadcasts.getFixtureBroadcast.mockResolvedValue([
      { broadcastId: 1, fixtureId: 501, market: 'GB', status: 'confirmed_broadcast', broadcaster: 'Sky Sports',
        channel: 'Sky Sports Main Event', streamingService: 'Sky Go', isFreeToAir: false, isSubscription: true,
        isPpv: false, watchUrl: null, source: 'test', sourceUrl: null, verifiedAt: '2026-08-01T00:00:00Z' },
    ]);
    renderAt(base.slug);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Where to watch (UK)' })).toBeInTheDocument());
    expect(screen.getByText('Sky Sports Main Event')).toBeInTheDocument();
    expect(screen.getByText(/Sky Go/)).toBeInTheDocument();
    expect(screen.queryByText(/Free-to-air/)).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('Sky Sports'));
  });

  it('a canonical watchUrl with no matching partner links out plainly -- nofollow, no Ad tag, no tracking', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'scheduled', actual_home_goals: null, actual_away_goals: null });
    mockedBroadcasts.getFixtureBroadcast.mockResolvedValue([
      { broadcastId: 3, fixtureId: 501, market: 'GB', status: 'confirmed_broadcast', broadcaster: 'BBC',
        channel: 'BBC One', streamingService: null, isFreeToAir: true, isSubscription: false, isPpv: false,
        watchUrl: 'https://www.bbc.co.uk/iplayer', source: 'test', sourceUrl: null, verifiedAt: '2026-08-01T00:00:00Z' },
    ]);
    mockedCommercialLinks.getActivePartners.mockResolvedValue([]);
    renderAt(base.slug);
    const link = await screen.findByRole('link', { name: 'Watch' });
    expect(link).toHaveAttribute('href', 'https://www.bbc.co.uk/iplayer');
    expect(link).toHaveAttribute('rel', 'nofollow noopener noreferrer');
    expect(screen.queryByText('Ad')).not.toBeInTheDocument();
  });

  it('a watchUrl matching an active partner resolves to the affiliate link, discloses it, and tracks the click', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'scheduled', actual_home_goals: null, actual_away_goals: null });
    mockedBroadcasts.getFixtureBroadcast.mockResolvedValue([
      { broadcastId: 4, fixtureId: 501, market: 'GB', status: 'confirmed_broadcast', broadcaster: 'NOW',
        channel: 'NOW Sky Sports', streamingService: 'NOW', isFreeToAir: false, isSubscription: true, isPpv: false,
        watchUrl: 'https://www.nowtv.com/watch/some-match', source: 'test', sourceUrl: null, verifiedAt: '2026-08-01T00:00:00Z' },
    ]);
    mockedCommercialLinks.getActivePartners.mockResolvedValue([
      { partnerId: 1, name: 'NOW', category: 'streaming', network: 'Awin', canonicalDomain: 'nowtv.com',
        affiliateUrlTemplate: 'https://www.awin1.com/cread.php?p={url}', market: 'GB' },
    ]);
    const user = userEvent.setup();
    renderAt(base.slug);
    const link = await screen.findByRole('link', { name: 'Watch' });
    expect(link).toHaveAttribute('href', `https://www.awin1.com/cread.php?p=${encodeURIComponent('https://www.nowtv.com/watch/some-match')}`);
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer');
    const adTag = screen.getByRole('link', { name: 'Ad' });
    expect(adTag).toHaveAttribute('href', '/affiliate-disclosure');

    await user.click(link);
    expect(mockedTrackEvent).toHaveBeenCalledWith('affiliate_click', expect.objectContaining({ partner: 'NOW', category: 'streaming' }));
  });

  it('states plainly when a fixture is confirmed not televised, distinct from saying nothing', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'scheduled', actual_home_goals: null, actual_away_goals: null });
    mockedBroadcasts.getFixtureBroadcast.mockResolvedValue([
      { broadcastId: 2, fixtureId: 501, market: 'GB', status: 'confirmed_not_televised', broadcaster: null,
        channel: null, streamingService: null, isFreeToAir: false, isSubscription: false, isPpv: false,
        watchUrl: null, source: 'test', sourceUrl: null, verifiedAt: '2026-08-01T00:00:00Z' },
    ]);
    renderAt(base.slug);
    await waitFor(() => expect(screen.getByText('Confirmed not televised in the UK.')).toBeInTheDocument());
  });

  it('shows no Where to watch section at all when nothing is known yet -- not a placeholder', async () => {
    mocked.getMatchBySlug.mockResolvedValue({ ...base, status: 'scheduled', actual_home_goals: null, actual_away_goals: null });
    mockedBroadcasts.getFixtureBroadcast.mockResolvedValue([]);
    renderAt(base.slug);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Where to watch (UK)' })).not.toBeInTheDocument();
  });

  it('shows a not-found state for an unknown slug', async () => {
    mocked.getMatchBySlug.mockResolvedValue(null);
    renderAt('no-such-match');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Match not found' })).toBeInTheDocument());
  });
});
