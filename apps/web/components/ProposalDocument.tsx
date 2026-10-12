'use client';

import { Proposal } from '@/lib/types';
import { t } from '@/lib/i18n';
import { categoryNames, priceLevelNames } from '@/lib/data/products';
import { hasCommercialData } from '@/lib/dataPresence';
import { localizeProductField } from '@/lib/utils';
import { SixDimBars } from '@/components/SixDimBars';
import { ScoreRing } from '@/components/ScoreRing';

/**
 * Print-friendly, brand-neutral proposal document.
 * Reused by the Preview page (P10) and the share link (P11).
 * Renders in the proposal's own language so the client document stays consistent.
 */
export function ProposalDocument({ proposal }: { proposal: Proposal }) {
  const lang = proposal.language;
  const brand = proposal.companyName?.trim() || 'SHAKI';
  const showBrand = Boolean(proposal.companyName?.trim());
  // Every shortlisted row scores 50 on brand fit because the catalogue carries no design_style or
  // visual_style, so the caveat is identical for all of them. Stated once, above the list, instead of
  // closing each of the five sentences with the same words.
  const sharedCaveat = proposal.products.map((r) => r.reason?.sharedCaveat).find(Boolean) ?? '';

  return (
    <article className="bg-white rounded-card border border-shaki-lavender shadow-sm overflow-hidden print:shadow-none print:border-none">
      {/* Cover */}
      <div className="bg-gradient-to-br from-shaki-deep to-shaki-purple text-white px-6 py-10 sm:px-10 sm:py-12 text-center">
        <p className="text-sm tracking-[0.3em] text-white/60 uppercase mb-6">{brand}</p>
        <h1 className="text-3xl font-semibold mb-3">
          {proposal.title?.trim() || t('proposalCover', lang)}
        </h1>
        <div className="w-16 h-0.5 bg-white/40 mx-auto my-6" />
        <p className="text-white/70 mb-1">{t('preparedFor', lang)}</p>
        <p className="text-xl font-medium">{proposal.clientName}</p>
      </div>

      {/* About */}
      <section className="px-6 py-8 sm:px-10 border-b border-shaki-lavender">
        <h2 className="text-lg font-semibold text-shaki-deep mb-3">{t('aboutYourBrand', lang)}</h2>
        <p className="text-muted leading-relaxed">
          {lang === 'zh'
            ? `根据我们对 ${proposal.clientName} 品牌定位、产品结构及市场方向的研究，以下产品最契合贵司当前业务需求与增长机会。`
            : `Based on our research into ${proposal.clientName}'s brand positioning, product portfolio and market direction, the following products best match your current business needs and growth opportunities.`}
        </p>
        {proposal.copy?.trim() && (
          <div className="mt-5 bg-shaki-soft/60 rounded-xl p-5">
            <p className="text-sm font-medium text-shaki-deep mb-2">{t('proposalNarrative', lang)}</p>
            <p className="text-muted leading-relaxed whitespace-pre-line text-sm">{proposal.copy}</p>
          </div>
        )}
      </section>

      {/* Products */}
      <section className="px-6 py-8 sm:px-10 space-y-8">
        {sharedCaveat ? (
          <p className="text-xs text-muted border-l-2 border-warning/50 pl-3 leading-relaxed">{sharedCaveat}</p>
        ) : null}
        {proposal.products.map((rec, idx) => {
          const p = rec.product;
          const name = localizeProductField(p, lang, 'product_name');
          const short = localizeProductField(p, lang, 'short_description');
          const selling = localizeProductField(p, lang, 'key_selling_point')
            .split('｜')
            .map((s) => s.trim())
            .filter(Boolean);
          return (
            <div key={rec.product_id} className="border border-shaki-lavender rounded-xl overflow-hidden">
              <div className="flex items-start gap-4 p-5 bg-shaki-soft/40">
                <div className="w-11 h-11 rounded-xl bg-shaki-purple text-white font-bold flex items-center justify-center flex-shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted mb-1">
                    {categoryNames[p.primary_category]?.[lang]} · {priceLevelNames[p.price_level]?.[lang]}
                  </p>
                  <h3 className="text-xl font-semibold text-shaki-deep truncate">{name}</h3>
                </div>
                <ScoreRing score={rec.fitScore} size={60} stroke={5} />
              </div>

              <div className="p-5 grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted mb-3">{short}</p>
                  <p className="text-sm font-medium text-shaki-deep mb-2">{t('whyWeSelectedIt', lang)}</p>
                  <p className="text-sm text-muted leading-relaxed mb-4">{rec.reason?.businessReason}</p>
                  {selling.length > 0 && (
                    <>
                      <p className="text-sm font-medium text-shaki-deep mb-2">{t('keyFeatures', lang)}</p>
                      <div className="flex flex-wrap gap-2">
                        {selling.map((s) => (
                          <span key={s} className="px-3 py-1 bg-shaki-soft text-shaki-purple text-xs rounded-full">
                            {s}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-shaki-deep mb-3">{t('sixDimensionScore', lang)}</p>
                  <SixDimBars scores={rec.dimensionScores} lang={lang} />
                  {/* Commercial terms only when there are terms to quote (PRD TABLE 10). This is a
                      client-facing document, so "MOQ: —" is worse here than anywhere else: the client
                      reads a placeholder as a term of the offer. */}
                  {hasCommercialData(p) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5">
                      <div className="p-3 bg-panel rounded-lg">
                        <p className="text-[11px] text-muted">{t('moq', lang)}</p>
                        <p className="text-sm font-medium text-shaki-deep truncate">{p.moq}</p>
                      </div>
                      {p.lead_time && (
                        <div className="p-3 bg-panel rounded-lg">
                          <p className="text-[11px] text-muted">{t('leadTime', lang)}</p>
                          <p className="text-sm font-medium text-shaki-deep truncate">{p.lead_time}</p>
                        </div>
                      )}
                      <div className="p-3 bg-panel rounded-lg">
                        <p className="text-[11px] text-muted">{t('price', lang)}</p>
                        <p className="text-sm font-medium text-shaki-deep truncate">${p.wholesale_price}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 p-3 bg-panel rounded-lg">
                      <p className="text-[11px] font-medium text-shaki-deep">{t('requestQuote', lang)}</p>
                      <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{t('requestQuoteHint', lang)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Next step */}
      <section className="mx-10 mb-10 bg-shaki-soft rounded-2xl p-8 text-center">
        <h3 className="text-lg font-semibold text-shaki-deep mb-2">{t('nextStep', lang)}</h3>
        <p className="text-muted max-w-2xl mx-auto text-sm">{t('nextStepText', lang)}</p>
      </section>

      {/* Footer / white-label */}
      <footer className="px-6 py-6 sm:px-10 border-t border-shaki-lavender text-center">
        <p className="text-xs text-muted">
          {showBrand ? `${brand} · ${t('poweredBy', lang)}` : t('curatedBy', lang)}
        </p>
      </footer>
    </article>
  );
}
