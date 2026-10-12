'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { categoryNames, priceLevelNames } from '@/lib/data/products';
import { localizeProductField } from '@/lib/utils';
import { t, proposalTypeLabel } from '@/lib/i18n';
import { generateRecommendations } from '@/lib/matching';
import { payloadFromHash, type SharedProposalPayload } from '@/lib/shareLink';
import { RouteLoading } from '@/components/RouteLoading';
import { Package, Mail, ArrowRight, Copy, Check } from 'lucide-react';
import type { ClientProfile, Proposal, Recommendation } from '@/lib/types';

function SharePageContent() {
  const { lang, proposals } = useAppState();
  const searchParams = useSearchParams();
  const proposalId = searchParams.get('id') || '';
  const [copied, setCopied] = useState(false);

  // The payload rides in the fragment, which is client-only by definition, so it can only be read
  // after mount. Until then the page renders as though the link carried none.
  const [shared, setShared] = useState<SharedProposalPayload | null>(null);
  useEffect(() => {
    setShared(payloadFromHash(window.location.hash));
  }, []);

  const proposal = proposalId ? proposals.find((p) => p.id === proposalId) : undefined;

  // Rebuild rather than transmit. The engine is deterministic, so re-running it on the client
  // profile that travelled in the link reproduces the recommendations the sender was looking at —
  // same scores, same evidence, same §16 disclosure — instead of trusting a rendered snapshot.
  const rebuilt = useMemo(() => {
    if (!shared) return null;
    const profile = { ...shared.cl, opportunities: [] } as ClientProfile;
    const recs = generateRecommendations(profile, shared.l, []);
    const byId = new Map(recs.map((r) => [r.product_id, r]));
    const products = shared.ids.map((id) => byId.get(id)).filter(Boolean) as Recommendation[];
    return { products, missing: shared.ids.length - products.length };
  }, [shared]);

  // A recipient has no local proposal; everything below renders from what the link carried.
  const external = !proposal && !!shared;
  const view: Proposal | undefined =
    proposal ??
    (shared
      ? {
          id: shared.id,
          clientId: shared.cl.id,
          clientName: shared.cl.name,
          companyName: shared.co,
          language: shared.l,
          products: rebuilt?.products ?? [],
          type: shared.ty,
          status: 'Sent',
          createdAt: shared.at || new Date().toISOString(),
          updatedAt: shared.at || new Date().toISOString(),
        }
      : undefined);

  // No id and no fragment → list of proposals so the nav link is usable.
  if (!proposalId && !shared) {
    return (
      <div className="min-h-screen bg-[#FAFAF9]">
        <div className="max-w-2xl mx-auto px-6 py-16">
          <h1 className="text-2xl font-semibold text-shaki-deep mb-2">{t('sharePage', lang)}</h1>
          <p className="text-muted mb-8">{t('selectProposalToShare', lang)}</p>
          {proposals.length === 0 ? (
            <p className="text-muted text-sm">{t('noData', lang)}</p>
          ) : (
            <div className="space-y-3">
              {proposals.map((p) => (
                <Link
                  key={p.id}
                  href={`/share?id=${p.id}`}
                  className="flex items-center justify-between p-4 bg-white rounded-card border border-shaki-lavender shadow-sm hover:shadow-md transition-shadow"
                >
                  <div>
                    <p className="font-medium text-shaki-deep">
                      {p.title?.trim() || `${p.clientName} · ${p.products.length} ${t('productCount', lang)}`}
                    </p>
                    <p className="text-xs text-muted">{proposalTypeLabel(p.type, lang)} · {new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        <p>{t('proposalNotFound', lang)}</p>
      </div>
    );
  }

  const displayLang = view.language;
  const brand = view.companyName?.trim() || 'SHAKI';
  const shareUrl =
    proposal?.shareUrl || (typeof window !== 'undefined' ? `${window.location.origin}/share?id=${view.id}` : '');

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Seller-only top bar (hidden in print / for the client). A recipient opened this by link and
          has no proposal of their own to copy, so they never see it. */}
      {!external && (
        <div className="print:hidden sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-shaki-lavender">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-muted">{t('shareProposalHint', displayLang)}</span>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-shaki-lavender text-shaki-deep text-sm font-medium rounded-btn hover:bg-shaki-soft"
            >
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? t('linkCopied', displayLang) : t('copyLink', displayLang)}
            </button>
          </div>
        </div>
      )}

      {external && (
        <div className="print:hidden sticky top-0 z-10 bg-shaki-soft border-b border-shaki-lavender">
          <div className="max-w-4xl mx-auto px-6 py-3 text-center text-sm text-muted">
            {t('sharedProposalView', displayLang)}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <p className="text-sm tracking-widest text-gray-400 uppercase mb-4">{brand}</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-shaki-deep mb-4">
            {displayLang === 'zh' ? `为 ${view.clientName} 精选的产品方案` : `A Curated Product Selection for ${view.clientName}`}
          </h1>
          <p className="text-muted max-w-xl mx-auto">
            {displayLang === 'zh'
              ? '基于您当前的产品结构、品牌定位和市场方向，精心挑选。'
              : 'Carefully selected based on your current product portfolio, brand positioning and market direction.'}
          </p>
        </div>

        {external && rebuilt && rebuilt.missing > 0 && (
          <p className="text-center text-sm text-warning mb-8">{t('sharedProposalPartial', displayLang)}</p>
        )}

        <div className="space-y-8 mb-12">
          {view.products.map((rec, idx) => (
            <div key={rec.product_id} className="bg-white rounded-3xl border border-shaki-lavender shadow-sm overflow-hidden">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="bg-shaki-soft/50 flex items-center justify-center p-10 min-h-[280px]">
                  <div className="text-center">
                    <div className="w-32 h-32 mx-auto rounded-2xl bg-white border border-shaki-lavender flex items-center justify-center mb-4">
                      <Package className="w-14 h-14 text-shaki-purple/40" />
                    </div>
                    <p className="text-sm text-gray-400">{rec.product.sku}</p>
                  </div>
                </div>
                <div className="p-8 md:p-10 flex flex-col justify-center">
                  <p className="text-xs text-muted mb-2 uppercase tracking-wider">
                    {categoryNames[rec.product.primary_category]?.[displayLang]} · {priceLevelNames[rec.product.price_level]?.[displayLang]}
                  </p>
                  <h2 className="text-2xl font-semibold text-shaki-deep mb-3">
                    {localizeProductField(rec.product, displayLang, 'product_name')}
                  </h2>
                  <p className="text-muted mb-6 leading-relaxed">
                    {localizeProductField(rec.product, displayLang, 'short_description')}
                  </p>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-shaki-deep">
                      {displayLang === 'zh' ? '核心卖点' : 'Key Features'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {localizeProductField(rec.product, displayLang, 'key_selling_point')
                        .split('｜')
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .map((item) => (
                          <span key={item} className="px-3 py-1.5 bg-shaki-soft text-shaki-purple text-sm rounded-full">
                            {item}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-br from-shaki-deep to-shaki-purple text-white rounded-3xl p-10 text-center">
          <h3 className="text-xl font-semibold mb-3">{displayLang === 'zh' ? '下一步' : 'Next Step'}</h3>
          <p className="text-white/80 mb-8 max-w-2xl mx-auto">
            {displayLang === 'zh'
              ? '如果您对以上产品感兴趣，我们可以进一步提供样品、报价及 OEM/ODM 方案。'
              : 'If any of the recommended products are of interest, we would be happy to provide samples, pricing and OEM/ODM options for further discussion.'}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="inline-flex items-center gap-2 px-6 py-3 bg-white text-shaki-purple rounded-xl font-semibold hover:bg-shaki-soft transition-colors">
              <Mail className="w-4 h-4" />
              {displayLang === 'zh' ? `联系 ${brand}` : `Contact ${brand}`}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 mt-10">
          © {new Date().getFullYear()} {brand}.
          {view.companyName?.trim() && <span className="block mt-1 text-xs text-gray-300">{t('poweredBy', displayLang)}</span>}
        </p>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <SharePageContent />
    </Suspense>
  );
}
