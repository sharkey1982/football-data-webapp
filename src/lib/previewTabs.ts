// The tabs of a match preview, shared by Football's Head to Heads and the NFL
// game page (src/components/PreviewTabs.tsx).

export type PreviewTabId = 'prediction' | 'overview' | 'home' | 'away';

export const PREVIEW_TABS: { id: PreviewTabId; label: string }[] = [
  { id: 'prediction', label: 'Prediction' },
  { id: 'overview', label: 'Head to Head' },
  { id: 'home', label: 'Home Team' },
  { id: 'away', label: 'Away Team' },
];
