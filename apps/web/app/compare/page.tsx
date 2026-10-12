'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t, proposalTypeLabel, recTypeLabel } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { RouteLoading } from '@/components/RouteLoading';
import { Recommendation, CategoryCode, Proposal } from '@/lib/types';
import { categoryNames, priceLevelNames } from '@/lib/data/products';
import { hasCommercialData } from '@/lib/dataPresence';
import { SixDimBars } from '@/components/SixDimBars';
import { ScoreRing } from '@/components/ScoreRing';
import { localizeProductField } from '@/lib/utils';
import { ArrowLeft, X, FileText, Check, GitCompare } from 'lucide-react';

// Labels live in the i18n dictionary (`singleProduct` / `productCollection` / `productLineProposal`)
// — this array used to carry its own copy of the Chinese strings, which is how `/compare` and
// `/proposal` drifted into rendering different text for the same enum.
const PROPOSAL_TYPES: Proposal['type'][] = ['Single Product', 'Product Collection', 'Product Line Proposal'];

function EmptyClient() {
  const { lang } = useAppState();
  return (
    <AppShell title={t('compareProducts', lang)}>
      <div className="text-center py-20 text-muted">
        <p>{t('noData', lang)}</p>
        <Link href="/analyze" className="text-shaki-purple hover:underline mt-2 inline-block">
          {t('newClient', lang)}
        </Link>
      </div>
    </AppShell>
  );
}

function CompareContent() {
  const { lang, getClient, getRecommendations, createProposal } = useAppState();
  const searchParams = useSearchParams();
  const router = useRouter();
  const clientId = searchParams.get('id') || '';
  const idsParam = searchParams.get('ids');
  const client = getClient(clientId);
  const all = getRecommendations(clientId);

  const preIds = useMemo(
    () => (idsParam ? idsParam.split(',').filter(Boolean) : []),
    [idsParam]
  );

  const [selected, setSelected] = useState<string[]>(() => {
    if (preIds.length) {
      const valid = preIds.filter((id) => all.some((r) => r.product_id === id));
      if (valid.length) return valid;
    }
    return all.slice(0, 3).map((r) => r.product_id);
  });
  const [type, setType] = useState<Proposal['type']>('Product Collection');

  if (!client) return <EmptyClient />;

  const isSel = (id: string) => selected.includes(id);
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectedRecs = selected
    .map((id) => all.find((r) => r.product_id === id))
    .filter((r): r is Recommendation => Boolean(r));

  const handleCreate = () => {
    if (!selectedRecs.length) return;
    const proposalType: Proposal['type'] =
      selectedRecs.length === 1
        ? 'Single Product'
        : selectedRecs.length >= 4
        ? 'Product Line Proposal'
        : 'Product Collection';
    const proposal = createProposal(clientId, selectedRecs, proposalType);
    router.push(`/proposal?id=${proposal.id}`);
  };

  return (
    <AppShell title={t('compareProducts', lang)}>
      <Link
        href={`/recommendations?id=${client.id}`}
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-shaki-purple mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('recommendedProducts', lang)}
      </Link>

      <section className="bg-white rounded-card border border-shaki-lavender p-5 mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">{client.name}</p>
          <h2 className="text-xl font-semibold text-ink">{t('compareProducts', lang)}</h2>
          <p className="text-xs text-muted mt-1">
            {t('comparedProducts', lang)} · {selectedRecs.length} / {all.length}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-shaki-purple">{selectedRecs[0]?.fitScore || 0}</div>
          <div className="text-xs text-muted">{t('topFit', lang)}</div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,300px)_1fr] gap-6 items-start">
        {/* Left: picker list */}
        <aside className="bg-white rounded-card border border-shaki-lavender p-5 lg:sticky lg:top-4">
          <h3 className="font-semibold text-ink mb-1">{t('comparePick', lang)}</h3>
          <p className="text-xs text-muted mb-4">{t('selectProductsToCompare', lang)}</p>
          {all.length === 0 ? (
            <p className="text-sm text-muted">{t('noData', lang)}</p>
          ) : (
            <ul className="space-y-2">
              {all.map((r) => {
                const sel = isSel(r.product_id);
                return (
                  <li key={r.product_id}>
                    <button
                      onClick={() => toggle(r.product_id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        sel
                          ? 'border-shaki-purple bg-shaki-soft'
                          : 'border-shaki-lavender hover:border-shaki-purple'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border ${
                          sel ? 'bg-shaki-purple border-shaki-purple text-white' : 'border-gray-300 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-ink truncate">
                          {localizeProductField(r.product, lang, 'product_name')}
                        </span>
                        <span className="block text-xs text-muted">
                          {categoryNames[r.product.primary_category as CategoryCode]?.[lang]} · {r.fitScore}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Right: comparison */}
        <div>
          {selectedRecs.length < 2 ? (
            <div className="bg-white rounded-card border border-shaki-lavender p-10 text-center text-muted">
              <GitCompare className="w-10 h-10 mx-auto mb-3 text-shaki-purple/40" />
              {t('emptyCompare', lang)}
            </div>
          ) : (
            <div
              className="grid grid-cols-1 gap-4 sm:[grid-template-columns:repeat(var(--cmp-cols),minmax(0,1fr))]"
              style={{ '--cmp-cols': Math.min(selectedRecs.length, 4) } as React.CSSProperties}
            >
              {selectedRecs.map((rec) => (
                <div key={rec.product_id} className="bg-white rounded-card border border-shaki-lavender shadow-sm p-4 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-shaki-soft flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">📦</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted">
                          {categoryNames[rec.product.primary_category as CategoryCode]?.[lang]}
                        </p>
                        <p className="text-sm font-semibold text-ink truncate">
                          {localizeProductField(rec.product, lang, 'product_name')}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggle(rec.product_id)}
                      className="p-1.5 text-muted hover:text-danger rounded-lg hover:bg-shaki-soft flex-shrink-0"
                      aria-label={t('removeFromCompare', lang)}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Price / commercial facts. `price_level` is a completeness-gate field so it is
                      present on enriched rows too; the quotable terms are not, and PRD TABLE 10 says
                      hide them rather than print a label with a dash beside it. */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <Fact label={t('pricePosition', lang)} value={priceLevelNames[rec.product.price_level]?.[lang] || '-'} />
                    {hasCommercialData(rec.product) ? (
                      <>
                        <Fact label={t('price', lang)} value={`$${rec.product.wholesale_price}`} />
                        <Fact label={t('moq', lang)} value={rec.product.moq} />
                        {rec.product.lead_time && <Fact label={t('leadTime', lang)} value={rec.product.lead_time} />}
                      </>
                    ) : (
                      <div className="col-span-2 flex items-start gap-2 p-3 bg-shaki-soft/50 rounded-lg">
                        <FileText className="w-4 h-4 text-shaki-purple shrink-0 mt-0.5" />
                        <p className="text-xs text-muted leading-relaxed">
                          <span className="font-medium text-shaki-deep">{t('requestQuote', lang)}</span>
                          {' · '}
                          {t('requestQuoteHint', lang)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Fit score ring */}
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-shaki-lavender">
                    <ScoreRing score={rec.fitScore} size={56} stroke={4} label={t('sixDimensionScore', lang)} />
                    <div className="text-xs text-muted leading-relaxed">
                      <p>{t('potentialScore', lang)}: <span className="font-semibold text-ink">{rec.potentialScore}</span></p>
                      <p className="mt-0.5">{recTypeLabel(rec.type, lang)}</p>
                    </div>
                  </div>

                  {/* Six-dimension bars */}
                  <p className="text-xs font-medium text-muted mb-2">{t('sixDimensionScore', lang)}</p>
                  <SixDimBars scores={rec.dimensionScores} compact lang={lang} />

                  {/* Why recommend */}
                  <div className="mt-4 pt-4 border-t border-shaki-lavender">
                    <p className="text-xs font-medium text-shaki-deep mb-1">{t('whyRecommend', lang)}</p>
                    <p className="text-xs text-muted leading-relaxed line-clamp-4">
                      {rec.reason.businessReason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action bar */}
          {selectedRecs.length >= 2 && (
            <div className="mt-6 bg-white rounded-card border border-shaki-lavender p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div>
                <p className="text-sm font-medium text-ink mb-2">{t('proposalBuilder', lang)}</p>
                <div className="flex flex-wrap gap-2">
                  {PROPOSAL_TYPES.map((tp) => (
                    <button
                      key={tp}
                      onClick={() => setType(tp)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        type === tp
                          ? 'bg-shaki-purple text-white border-shaki-purple'
                          : 'border-shaki-lavender text-muted hover:border-shaki-purple'
                      }`}
                    >
                      {proposalTypeLabel(tp, lang)}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreate}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-shaki-purple text-white text-sm font-semibold rounded-btn hover:bg-shaki-purple2 shadow-lg shadow-shaki-purple/20"
              >
                <FileText className="w-4 h-4" />
                {t('sendToProposal', lang)}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-shaki-soft/50 rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="text-xs font-semibold text-ink truncate">{value}</p>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <CompareContent />
    </Suspense>
  );
}
