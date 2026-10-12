'use client';

import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { SCORE_BAND_STYLE, scoreBand } from '@/components/scoreBand';

/**
 * Score band badge.
 *
 * The band edges come from `config/matching.ts` and the label from the dictionary — this component
 * used to carry both privately: four hard-coded thresholds (90/80/70/60, which disagreed with
 * `SixDimBars`' 85/70) and five hard-coded English labels, so a Chinese UI would have shown
 * "Strong · 88" if anything ever rendered it.
 *
 * Note: nothing references this component today. It is kept (and fixed) rather than deleted so it
 * is not a landmine for whoever imports it next; see the commit for that decision.
 */
export function FitBadge({ score }: { score: number }) {
  const { lang } = useAppState();
  const band = scoreBand(score);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${SCORE_BAND_STYLE[band.key].badge}`}
    >
      {t(band.key, lang)} · {score}
    </span>
  );
}
