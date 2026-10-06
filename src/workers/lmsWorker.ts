// Runs the Last Man Standing optimiser off the main thread (the 24-team
// Championship table takes a few seconds). See src/lib/lastManStanding.ts.
import { runEntries, type EntriesInput } from '../lib/lastManStanding';

self.onmessage = (e: MessageEvent<{ id: number; input: EntriesInput }>) => {
  try {
    const out = runEntries(e.data.input);
    (self as unknown as Worker).postMessage({ id: e.data.id, out });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) });
  }
};
