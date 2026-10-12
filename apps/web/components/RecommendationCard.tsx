'use client';

import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t, evidenceLabel, recTypeLabel } from '@/lib/i18n';
import { Recommendation, CategoryCode } from '@/lib/types';
import { categoryNames } from '@/lib/data/products';
import { localizeProductField } from '@/lib/utils';
import { SixDimBars } from '@/components/SixDimBars';
import { cn } from '@/lib/utils';
import { Eye, Plus, Check, Database, ShieldCheck, AlertTriangle } from 'lucide-react';

const CONFIDENCE_CLASS: Record<string, string> = {
  High: 'bg-success/10 text-success border-success/20',
  Medium: 'bg-warning/10 text-warning border-warning/20',
  Low: 'bg-gray-100 text-muted border-gray-200',
};

const CONFIDENCE_KEY: Record<string, string> = {
  High: 'highConfidence',
  Medium: 'mediumConfidence',
  Low: 'lowConfidence',
};

export function RecommendationCard({
  rec,
  selected,
  onToggle,
}: {
  rec: Recommendation;
  selected: boolean;
  onToggle: () => void;
}) {
  const { lang } = useAppState();
  const p = rec.product;

  const slot = rec.curationSlot ?? null;
  const isCurated = slot !== null;
  const confidence = rec.confidence ?? 'Medium';
  const completeness = p.completeness ?? 0;
  const evidence = rec.evidence ?? [];
  const related = rec.relatedProducts;

  return (
    <div
      className={cn(
        'bg-white rounded-card border shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col',
        isCurated ? 'border-shaki-purple/40' : 'border-shaki-lavender'
      )}
    >
      {/* Photo first: a rep choosing between five products needs to recognise the product, and a
          name plus a SKU does not tell them whether it is the right one. */}
      {p.image_url ? (
        <a
          href={p.image_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-3 rounded-lg overflow-hidden bg-panel border border-shaki-lavender"
          title={lang === 'zh' ? '查看产品实拍图' : 'View product photo'}
        >
          <img
            src={p.image_url}
            alt={localizeProductField(p, lang, 'product_name')}
            loading="lazy"
            className="w-full h-40 object-cover"
            // A dead CDN path must not leave a torn image icon in a card a customer will read.
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement | null)?.remove();
            }}
          />
        </a>
      ) : null}

      {/* Header: slot + role + scores */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-md text-[11px] font-semibold tabular-nums',
                isCurated ? 'bg-shaki-purple text-white' : 'bg-gray-100 text-gray-500'
              )}
              title={isCurated ? `${t('slotLabel', lang)} 0${slot}` : t('notCurated', lang)}
            >
              {isCurated ? `0${slot}` : '—'}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[11px] font-medium truncate',
                isCurated ? 'bg-shaki-soft text-shaki-purple' : 'bg-gray-50 text-muted'
              )}
            >
              {recTypeLabel(rec.type, lang)}
            </span>
          </div>
          <p className="text-xs text-muted mb-1">{categoryNames[p.primary_category as CategoryCode]?.[lang]}</p>
          <h3 className="font-semibold text-ink truncate">{localizeProductField(p, lang, 'product_name')}</h3>
          <p className="text-xs text-gray-400 mt-1">{p.sku}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-3xl font-bold text-shaki-purple leading-none">{rec.finalScore ?? rec.fitScore}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted mt-1">{t('finalScore', lang)}</div>
          <div className="text-xs text-muted mt-1 tabular-nums">
            {t('fitScore', lang)} {rec.fitScore} · {t('potentialShort', lang)} {rec.potentialScore}
          </div>
        </div>
      </div>

      {/* Provenance + confidence */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-panel text-muted text-[11px] rounded-full border border-shaki-lavender">
          <Database className="w-3 h-3" />
          {t(p.layer === 'asset' ? 'layerAsset' : p.layer === 'candidate' ? 'layerCandidate' : 'layerBrand', lang)}
          <span className="text-ink font-medium">{completeness}%</span>
        </span>
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border', CONFIDENCE_CLASS[confidence])}>
          <ShieldCheck className="w-3 h-3" />
          {t(CONFIDENCE_KEY[confidence], lang)}
        </span>
        {rec.curationFallback && (
          <span
            title={t('curationFallbackHint', lang)}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning/10 text-warning text-[11px] rounded-full border border-warning/20"
          >
            <AlertTriangle className="w-3 h-3" />
            {t('curationFallback', lang)}
          </span>
        )}
      </div>

      {/* Tags (max 4 visible, +N overflow) */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {p.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="px-2 py-0.5 bg-shaki-soft text-shaki-purple text-[11px] rounded-full font-medium truncate max-w-[130px]">
            {tag}
          </span>
        ))}
        {p.tags.length > 4 && (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] rounded-full">+{p.tags.length - 4}</span>
        )}
      </div>

      {/* Why We Recommend — 3-part structure (spec TABLE 47) */}
      <div className="bg-panel rounded-lg p-3 mb-3 text-xs text-muted space-y-1.5">
        <p>
          <span className="text-ink font-medium">{t('factClient', lang)} · </span>
          {rec.reason.clientFact}
        </p>
        <p>
          <span className="text-ink font-medium">{t('factProduct', lang)} · </span>
          {rec.reason.productFact}
        </p>
        <p>
          <span className="text-ink font-medium">{t('factBusiness', lang)} · </span>
          {rec.reason.businessReason}
        </p>
      </div>

      {/* Six-dimension viz */}
      <SixDimBars scores={rec.dimensionScores} compact />

      {/* Evidence trail (PRD Layer 13) */}
      {evidence.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-muted hover:text-shaki-purple select-none">
            {t('evidenceTitle', lang)} ({evidence.length})
          </summary>
          {/* Score trace — PRD §18 wants the candidate traceable back to Layer 2, not just Layer 3. */}
          <p className="mt-2 text-[11px] text-muted tabular-nums">
            <span className="text-ink font-medium">{t('pipelineTrace', lang)} · </span>
            {t('recallScore', lang)} {rec.recallScore ?? '—'} › {t('fitScore', lang)} {rec.fitScore} ›{' '}
            {t('potentialShort', lang)} {rec.potentialScore} › {t('finalScore', lang)} {rec.finalScore ?? '—'}
          </p>
          <ul className="mt-2 space-y-1">
            {evidence.map((e, i) => (
              <li key={i} className="text-[11px] text-muted flex gap-1.5">
                <span className="text-shaki-purple/80 shrink-0" title={evidenceLabel(e.type, lang)}>
                  {evidenceLabel(e.type, lang)}
                </span>
                <span>{e.claim}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* PRD §16 `related_products`. Only rendered when at least one bucket has a SKU — an empty
          block would just add noise, and an empty bucket is already the honest answer. */}
      {related && (related.cross_sell.length > 0 || related.upsell.length > 0 || related.alternative.length > 0) && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-muted hover:text-shaki-purple select-none">
            {t('relatedProducts', lang)}
          </summary>
          <p className="mt-2 text-[11px] text-muted">{t('relatedProductsNote', lang)}</p>
          <div className="mt-2 space-y-1.5">
            {(
              [
                ['crossSell', related.cross_sell],
                ['upsell', related.upsell],
                ['alternative', related.alternative],
              ] as const
            ).map(([key, skus]) =>
              skus.length === 0 ? null : (
                <div key={key} className="flex gap-1.5 text-[11px]">
                  <span className="text-ink font-medium shrink-0">{t(key, lang)}</span>
                  <span className="text-muted tabular-nums break-all">{skus.join(' · ')}</span>
                </div>
              )
            )}
          </div>
        </details>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-shaki-lavender">
        {p.layer === 'brand' ? (
          <Link href={`/product/${p.product_id}`} className="inline-flex items-center gap-1 text-sm text-shaki-purple hover:underline">
            <Eye className="w-4 h-4" /> {t('viewProduct', lang)}
          </Link>
        ) : (
          // Promoted crawled rows have no statically-exported detail page (only the curated
          // brand SKUs are prerendered), so send the rep to the enrichment record instead.
          <Link
            href={`/enrichment?id=${encodeURIComponent(p.product_id)}`}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-shaki-purple"
            title={lang === 'zh' ? '该 SKU 来自抓取货盘，参数由 PM 补录' : 'Crawled SKU, parameters entered by a PM'}
          >
            <Database className="w-4 h-4" /> {t('enrichmentNav', lang)}
          </Link>
        )}
        <button
          onClick={onToggle}
          className={cn(
            'inline-flex items-center gap-1 px-3 py-1.5 rounded-btn text-sm font-medium transition-colors',
            selected ? 'bg-shaki-purple text-white' : 'bg-shaki-soft text-shaki-purple hover:bg-shaki-lavender'
          )}
        >
          {selected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {selected ? (lang === 'zh' ? '已加入' : 'Added') : t('addToProposal', lang)}
        </button>
      </div>
    </div>
  );
}
