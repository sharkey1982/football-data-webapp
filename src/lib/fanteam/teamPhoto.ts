// ============================================================================
// src/lib/fanteam/teamPhoto.ts
//
// Reads a screenshot of a FanTeam team (OCR in the browser, tesseract.js) and
// matches the text against the selected contest's player list. Only names in
// that list can be found, so OCR noise rarely produces a wrong player; the
// result is always shown for confirmation before it replaces the team.
// ============================================================================

import { editDistance, norm } from './paste';
import type { PlayerView } from './model';

export type PhotoMatch = {
  /** Players found once, unambiguously. */
  picks: PlayerView[];
  /** A name found that fits several players (e.g. "Fernandes"); choose one. */
  ambiguous: { word: string; options: PlayerView[] }[];
};

/** Surname as FanTeam writes it (export), else the last word of the name. */
function surnameOf(v: PlayerView): string {
  const s = v.surname?.trim() || v.name.trim().split(/\s+/).slice(-1)[0];
  return norm(s);
}

/** Prices written in the text (e.g. "11.2", "£9.5m"). */
function pricesIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/(\d{1,2}[.,]\d)/g)) out.add(Math.round(parseFloat(m[1].replace(',', '.')) * 10) / 10);
  return out;
}

/** Letter pairs OCR commonly reads as one letter ("rn" as "m"). */
const ocrFold = (s: string) => s.replace(/rn/g, 'm').replace(/vv/g, 'w');

export function matchTeamText(text: string, views: PlayerView[]): PhotoMatch {
  const t = ` ${norm(text)} `;
  const tf = ocrFold(t);
  const words = new Set(tf.trim().split(' ').filter((w) => w.length >= 3));
  const prices = pricesIn(text);
  const found = new Map<string, PlayerView[]>(); // surname -> players with it
  for (const v of views) {
    const sur = surnameOf(v);
    if (sur.length < 3) continue;
    const sf = ocrFold(sur);
    let hit = t.includes(` ${sur} `) || tf.includes(` ${sf} `);
    // One misread letter allowed in longer single-word surnames.
    if (!hit && sf.length >= 5 && !sf.includes(' ')) {
      for (const w of words) if (Math.abs(w.length - sf.length) <= 1 && editDistance(w, sf) === 1) { hit = true; break; }
    }
    if (hit) {
      if (!found.has(sur)) found.set(sur, []);
      found.get(sur)!.push(v);
    }
  }
  const picks: PlayerView[] = [];
  const ambiguous: PhotoMatch['ambiguous'] = [];
  for (const [sur, list] of found) {
    if (list.length === 1) { picks.push(list[0]); continue; }
    // Several share the surname: a first name or initial, then a matching price, decide.
    const byFirst = list.filter((v) => {
      const first = norm(v.name).split(' ')[0];
      return first !== sur && (t.includes(` ${first} ${sur} `) || t.includes(` ${first[0]} ${sur} `));
    });
    const byPrice = (byFirst.length ? byFirst : list).filter((v) => prices.has(Math.round(v.price * 10) / 10));
    const narrowed = byPrice.length ? byPrice : byFirst;
    if (narrowed.length === 1) picks.push(narrowed[0]);
    else ambiguous.push({ word: sur, options: (narrowed.length ? narrowed : list).sort((a, b) => b.value - a.value) });
  }
  return { picks, ambiguous };
}

/**
 * Team screens put names on coloured pitches and labels, which plain OCR
 * reads badly. Two clean versions are made: coloured pixels turned white
 * (dark text on light labels survives) and coloured pixels turned black, then
 * inverted (light text on coloured labels survives). Small screenshots are
 * enlarged first.
 */
async function cleanVersions(file: Blob): Promise<HTMLCanvasElement[]> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(3, Math.max(1, 1400 / bmp.width));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const ctx = src.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const px = ctx.getImageData(0, 0, w, h);
  const outs = [new ImageData(w, h), new ImageData(w, h)];
  const d = px.data, a = outs[0].data, b = outs[1].data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], bl = d[i + 2];
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
    const coloured = mx > 0 && (mx - mn) / mx > 0.35;
    const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
    const va = coloured ? 255 : lum, vb = coloured ? 255 : 255 - lum;
    a[i] = a[i + 1] = a[i + 2] = va; a[i + 3] = 255;
    b[i] = b[i + 1] = b[i + 2] = vb; b[i + 3] = 255;
  }
  return outs.map((img) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.putImageData(img, 0, 0);
    return c;
  });
}

/**
 * OCR a team screenshot in the browser; returns all text read (several
 * passes joined, duplicates are harmless). The engine (~4 MB) is fetched on
 * first use and cached by the browser.
 */
export async function readImageText(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker, PSM } = await import('tesseract.js');
  const [light, dark] = await cleanVersions(file);
  const passes: [HTMLCanvasElement, string][] = [[light, PSM.SPARSE_TEXT], [light, PSM.AUTO], [dark, PSM.SPARSE_TEXT]];
  let done = 0;
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.((done + m.progress) / passes.length);
    },
  });
  try {
    const texts: string[] = [];
    for (const [img, psm] of passes) {
      await worker.setParameters({ tessedit_pageseg_mode: psm as never });
      const { data } = await worker.recognize(img);
      texts.push(data.text);
      done++;
    }
    return texts.join('\n');
  } finally {
    await worker.terminate();
  }
}
