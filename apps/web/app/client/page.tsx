'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { ScoreRing } from '@/components/ScoreRing';
import { FitBadge } from '@/components/FitBadge';
import { categoryNames, priceLevelNames, productStatusNames } from '@/lib/data/products';
import { Recommendation, CategoryCode, PriceLevel } from '@/lib/types';
import { localizeProductField } from '@/lib/utils';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Plus, FileText, Eye, TrendingUp, Users, Palette, DollarSign, Package, Globe, Sparkles } from 'lucide-react';

const tabs = ['Best Match', 'Growth Opportunity', 'Product Line Expansion', 'Strategic Product'] as const;

function ClientPageContent() {
  const { lang, getClient, getRecommendations, createProposal, proposals, toggleProposalProduct } = useAppState();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('id') || '';
  const client = getClient(clientId);
  const allRecommendations = getRecommendations(clientId);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Best Match');
  const [selected, setSelected] = useState<Recommendation[]>([]);

  if (!client) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center text-gray-500">
        <p>{t('noData', lang)}</p>
        <Link href="/analyze" className="text-shaki-purple hover:underline mt-2 inline-block">
          {t('newClient', lang)}
        </Link>
      </div>
    );
  }

  const tabLabels: Record<(typeof tabs)[number], string> = {
    'Best Match': t('bestMatch', lang),
    'Growth Opportunity': t('growthOpportunity', lang),
    'Product Line Expansion': t('productLineExpansion', lang),
    'Strategic Product': t('strategicProducts', lang),
  };

  const filtered = allRecommendations.filter((r) => r.type === activeTab).slice(0, 6);
  const top = allRecommendations.slice(0, 3);

  const clientProposal = proposals.find((p) => p.clientId === clientId);

  const toggleSelect = (rec: Recommendation) => {
    if (clientProposal) {
      toggleProposalProduct(clientProposal.id, rec);
      return;
    }
    const exists = selected.some((s) => s.product_id === rec.product_id);
    setSelected(exists ? selected.filter((s) => s.product_id !== rec.product_id) : [...selected, rec]);
  };

  const isSelected = (rec: Recommendation) => {
    if (clientProposal) return clientProposal.products.some((p) => p.product_id === rec.product_id);
    return selected.some((s) => s.product_id === rec.product_id);
  };

  const handleCreateProposal = () => {
    const products = selected.length ? selected : allRecommendations.slice(0, 3);
    createProposal(clientId, products, 'Product Collection');
  };

  const dimensionMeta = [
    { key: 'categoryFit', label: t('categoryFit', lang), icon: Package },
    { key: 'audienceFit', label: t('audienceFit', lang), icon: Users },
    { key: 'brandFit', label: t('brandFit', lang), icon: Palette },
    { key: 'priceFit', label: t('priceFit', lang), icon: DollarSign },
    { key: 'portfolioFit', label: t('portfolioFit', lang), icon: TrendingUp },
    { key: 'marketFit', label: t('marketFit', lang), icon: Globe },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-shaki-purple mb-6">
        <ArrowLeft className="w-4 h-4" />
        {t('goBack', lang)}
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Client Intelligence */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-shaki-purple" />
              <h2 className="text-lg font-semibold text-shaki-deep">{t('clientIntelligence', lang)}</h2>
            </div>
            <div className="space-y-4">
              <InfoRow label={t('brand', lang)} value={client.name} />
              <InfoRow label={t('market', lang)} value={client.market} />
              <InfoRow label={t('businessType', lang)} value={client.businessType} />
              <InfoRow label={t('mainCategories', lang)} value={client.mainCategories.map((c) => categoryNames[c as CategoryCode]?.[lang] || c).join(', ')} />
              <InfoRow label={t('pricePosition', lang)} value={priceLevelNames[client.pricePosition as PriceLevel]?.[lang] || client.pricePosition} />
              <InfoRow label={t('targetAudience', lang)} value={client.targetAudience} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6">
            <h3 className="text-base font-semibold text-shaki-deep mb-4">{t('brandDna', lang)}</h3>
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">{t('brandPositioning', lang)}</p>
              <p className="text-sm font-medium text-shaki-deep">{client.brandPositioning}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">{t('visualStyle', lang)}</p>
              <div className="flex flex-wrap gap-2">
                {client.visualStyle.map((s) => (
                  <span key={s} className="px-2.5 py-1 bg-shaki-soft text-shaki-purple text-xs rounded-full font-medium">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6">
            <h3 className="text-base font-semibold text-shaki-deep mb-4">{t('clientOpportunities', lang)}</h3>
            <ul className="space-y-3">
              {client.opportunities.slice(0, 4).map((op, idx) => (
                <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-shaki-purple mt-2 flex-shrink-0" />
                  {op}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: Recommendations */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gradient-to-r from-shaki-soft to-white rounded-2xl border border-shaki-lavender p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
              <div>
                <h2 className="text-xl font-semibold text-shaki-deep">{t('recommendedProducts', lang)}</h2>
                <p className="text-sm text-gray-500 mt-1">{t('selectedBasedOn', lang)}</p>
              </div>
              <div className="flex items-center gap-3">
                {clientProposal ? (
                  <Link
                    href={`/share?id=${clientProposal.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-shaki-purple text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9]"
                  >
                    <Eye className="w-4 h-4" />
                    {t('viewProduct', lang)}
                  </Link>
                ) : (
                  <button
                    onClick={handleCreateProposal}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-shaki-purple text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9]"
                  >
                    <FileText className="w-4 h-4" />
                    {t('createProposal', lang)}
                  </button>
                )}
              </div>
            </div>

            {/* Top score summary */}
            <div className="flex items-center gap-6 mt-6">
              <ScoreRing score={top[0]?.fitScore || 0} label={t('sixDimensionScore', lang)} size={80} />
              <div>
                <p className="text-sm text-gray-500">{t('bestMatch', lang)}</p>
                <p className="text-lg font-semibold text-shaki-deep">{top[0] ? localizeProductField(top[0].product, lang, 'product_name') : ''}</p>
                <FitBadge score={top[0]?.fitScore || 0} />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-shaki-lavender pb-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab
                    ? 'text-shaki-purple border-b-2 border-shaki-purple bg-shaki-soft/50'
                    : 'text-gray-500 hover:text-shaki-purple'
                }`}
              >
                {tabLabels[tab]}
              </button>
            ))}
          </div>

          {/* Product cards */}
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.map((rec) => (
              <div
                key={rec.product_id}
                className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">{categoryNames[rec.product.primary_category]?.[lang]}</p>
                    <h3 className="font-semibold text-shaki-deep">
                      {localizeProductField(rec.product, lang, 'product_name')}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">{rec.product.sku}</p>
                  </div>
                  <ScoreRing score={rec.fitScore} size={60} stroke={5} />
                </div>

                <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                  {localizeProductField(rec.product, lang, 'short_description')}
                </p>

                <div className="space-y-2 mb-4">
                  {dimensionMeta.slice(0, 3).map((dim) => {
                    const Icon = dim.icon;
                    return (
                      <div key={dim.key} className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs text-gray-500 flex-1">{dim.label}</span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-shaki-purple rounded-full"
                            style={{ width: `${rec.dimensionScores[dim.key as keyof typeof rec.dimensionScores]}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-shaki-deep w-6 text-right">
                          {rec.dimensionScores[dim.key as keyof typeof rec.dimensionScores]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-shaki-lavender">
                  <Link
                    href={`/product/${rec.product_id}`}
                    className="inline-flex items-center gap-1 text-sm text-shaki-purple hover:underline"
                  >
                    <Eye className="w-4 h-4" />
                    {t('viewProduct', lang)}
                  </Link>
                  <button
                    onClick={() => toggleSelect(rec)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isSelected(rec)
                        ? 'bg-shaki-purple text-white'
                        : 'bg-shaki-soft text-shaki-purple hover:bg-purple-100'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isSelected(rec) ? (lang === 'zh' ? '已加入' : 'Added') : t('addToProposal', lang)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-shaki-deep">{value}</span>
    </div>
  );
}

export default function ClientPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading...</div>}>
      <ClientPageContent />
    </Suspense>
  );
}
