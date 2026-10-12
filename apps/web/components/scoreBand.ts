import { MATCHING_CONFIG } from '@/lib/config/matching';

/**
 * Score band lookup + paint.
 *
 * The thresholds live in `config/matching.ts` (`scoreBands`) because PRD §19 puts them in config.
 * This module holds only the visual side, so the ring, the badge and the six-dimension bars all
 * colour a given score the same way. They used to disagree: `FitBadge` and `ScoreRing` used
 * 90/80/70/60, `SixDimBars` used 85/70, and the ring's palette was raw hex that did not match
 * `tailwind.config.ts` at all.
 */
const BANDS = MATCHING_CONFIG.scoreBands;

export type ScoreBand = (typeof BANDS)[number];
export type ScoreBandKey = ScoreBand['key'];

/**
 * The highest band whose `min` the score reaches.
 *
 * The table is ordered high → low and its last entry is `min: 0`, so every non-negative score
 * resolves. The cast covers the index access only — the lookup itself is total.
 */
export function scoreBand(score: number): ScoreBand {
  const hit = BANDS.find((band) => score >= band.min);
  return (hit ?? BANDS[BANDS.length - 1]) as ScoreBand;
}

/** Brand-palette paint per band: SVG stroke, bar fill, and badge (border + text + bg). */
export const SCORE_BAND_STYLE: Record<ScoreBandKey, { hex: string; bar: string; badge: string }> = {
  bandExcellent: {
    hex: '#4B2E6D',
    bar: 'bg-shaki-purple',
    badge: 'bg-purple-50 text-shaki-purple border-purple-100',
  },
  bandStrong: {
    hex: '#3E7B57',
    bar: 'bg-success',
    badge: 'bg-green-50 text-success border-green-100',
  },
  bandFair: {
    hex: '#A66B00',
    bar: 'bg-warning',
    badge: 'bg-amber-50 text-warning border-amber-100',
  },
  bandWeak: {
    hex: '#A63D40',
    bar: 'bg-danger',
    badge: 'bg-red-50 text-danger border-red-100',
  },
};
