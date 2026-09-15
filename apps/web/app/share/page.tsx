'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppState } from '@/components/ClientProvider';
import { categoryNames, priceLevelNames } from '@/lib/data/products';
import { localizeProductField } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { Package, Mail, ArrowRight } from 'lucide-react';

function SharePageContent() {
  const { lang, proposals } = useAppState();
  const searchParams = useSearchParams();
  const proposalId = searchParams.get('id') || '';
  const proposal = proposals.find((p) => p.id === proposalId);

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <p>Proposal not found</p>
      </div>
    );
  }

  const displayLang = proposal.language;
  const brand = proposal.companyName?.trim() || 'SHAKI';

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <p className="text-sm tracking-widest text-gray-400 uppercase mb-4">{brand}</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-shaki-deep mb-4">
            {displayLang === 'zh'
              ? `为 ${proposal.clientName} 精选的产品方案`
              : `A Curated Product Selection for ${proposal.clientName}`}
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            {displayLang === 'zh'
              ? '基于您当前的产品结构、品牌定位和市场方向，精心挑选。'
              : 'Carefully selected based on your current product portfolio, brand positioning and market direction.'}
          </p>
        </div>

        <div className="space-y-8 mb-12">
          {proposal.products.map((rec, idx) => (
            <div
              key={rec.product_id}
              className="bg-white rounded-3xl border border-shaki-lavender shadow-sm overflow-hidden"
            >
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
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                    {categoryNames[rec.product.primary_category]?.[displayLang]} · {priceLevelNames[rec.product.price_level]?.[displayLang]}
                  </p>
                  <h2 className="text-2xl font-semibold text-shaki-deep mb-3">
                    {localizeProductField(rec.product, displayLang, 'product_name')}
                  </h2>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    {localizeProductField(rec.product, displayLang, 'short_description')}
                  </p>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-shaki-deep">
                      {displayLang === 'zh' ? '核心卖点' : 'Key Features'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {localizeProductField(rec.product, displayLang, 'key_selling_point')
                        .split('｜')
                        .map((item) => (
                          <span
                            key={item}
                            className="px-3 py-1.5 bg-shaki-soft text-shaki-purple text-sm rounded-full"
                          >
                            {item.trim()}
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
          <h3 className="text-xl font-semibold mb-3">
            {displayLang === 'zh' ? '下一步' : 'Next Step'}
          </h3>
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
          {proposal.companyName?.trim() && (
            <span className="block mt-1 text-xs text-gray-300">{t('poweredBy', displayLang)}</span>
          )}
        </p>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading...</div>}>
      <SharePageContent />
    </Suspense>
  );
}
