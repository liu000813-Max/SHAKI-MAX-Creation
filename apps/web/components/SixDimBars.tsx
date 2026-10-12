'use client';

import { DimensionScores, Lang } from '@/lib/types';
import { t } from '@/lib/i18n';
import { useAppState } from '@/components/ClientProvider';
import { cn } from '@/lib/utils';
import { SCORE_BAND_STYLE, scoreBand } from '@/components/scoreBand';

const dims = [
  { key: 'categoryFit', labelKey: 'categoryFit' },
  { key: 'audienceFit', labelKey: 'audienceFit' },
  { key: 'brandFit', labelKey: 'brandFit' },
  { key: 'priceFit', labelKey: 'priceFit' },
  { key: 'portfolioFit', labelKey: 'portfolioFit' },
  { key: 'marketFit', labelKey: 'marketFit' },
] as const;

// Six horizontal score bars (spec P54: bars over radar charts in V1).
export function SixDimBars({ scores, compact, lang: langProp }: { scores: DimensionScores; compact?: boolean; lang?: Lang }) {
  const { lang: ctxLang } = useAppState();
  const lang = langProp ?? ctxLang;
  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      {dims.map((d) => {
        const v = scores[d.key];
        const barColor = SCORE_BAND_STYLE[scoreBand(v).key].bar;
        return (
          <div key={d.key} className="flex items-center gap-3">
            <span className="text-xs text-muted w-20 flex-shrink-0">{t(d.labelKey, lang)}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${v}%` }} />
            </div>
            <span className="text-xs font-semibold text-ink w-7 text-right">{v}</span>
          </div>
        );
      })}
    </div>
  );
}
