'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { BusinessType, ClientInput } from '@/lib/types';
import { Globe, Link2, Hash, Building2, Target, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

const markets = [
  'United States',
  'United Kingdom',
  'Europe',
  'Australia',
  'Southeast Asia',
  'Middle East',
  'Japan',
  'Korea',
  'Other',
];

const businessTypes: BusinessType[] = [
  'Brand',
  'Distributor',
  'Retailer',
  'Wholesaler',
  'E-commerce',
  'Amazon Seller',
  'Chain Store',
  'Boutique',
  'OEM/ODM Buyer',
];

const goals = ['New Product', 'Bestseller', 'Premium', 'High Margin', 'Product Line Expansion', 'OEM/ODM'];

const analysisSteps = [
  { zh: '正在分析客户网站', en: 'Analyzing client website', key: 'website' },
  { zh: '正在识别品牌定位', en: 'Identifying brand positioning', key: 'brand' },
  { zh: '正在分析产品结构', en: 'Analyzing product portfolio', key: 'portfolio' },
  { zh: '正在研究市场定位', en: 'Researching market positioning', key: 'market' },
  { zh: '正在分析社交媒体', en: 'Analyzing social presence', key: 'social' },
  { zh: '正在匹配 SHAKI 产品', en: 'Matching SHAKI products', key: 'matching' },
];

export default function AnalyzePage() {
  const { lang, addClient } = useAppState();
  const router = useRouter();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<ClientInput>({
    categories: '',
    website: '',
    socialLinks: [''],
    market: '',
    businessType: '',
    goal: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    for (let i = 0; i < analysisSteps.length; i++) {
      setCurrentStep(i);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    const client = addClient(form);
    router.push(`/client?id=${client.id}`);
  };

  const updateSocial = (index: number, value: string) => {
    const next = [...form.socialLinks];
    next[index] = value;
    setForm({ ...form, socialLinks: next });
  };

  const addSocial = () => setForm({ ...form, socialLinks: [...form.socialLinks, ''] });

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-10">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-shaki-soft flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-shaki-purple animate-spin" />
          </div>
          <h2 className="text-2xl font-semibold text-shaki-deep mb-2">{t('researchingClient', lang)}</h2>
          <p className="text-gray-500 mb-8">{lang === 'zh' ? 'AI 正在分析客户信息并匹配 SHAKI 产品' : 'AI is analyzing client information and matching SHAKI products'}</p>
          <div className="space-y-3 text-left max-w-md mx-auto">
            {analysisSteps.map((step, idx) => (
              <div
                key={step.key}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  idx <= currentStep ? 'bg-shaki-soft text-shaki-deep' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    idx < currentStep
                      ? 'bg-shaki-purple text-white'
                      : idx === currentStep
                      ? 'border-2 border-shaki-purple text-shaki-purple'
                      : 'border border-gray-300'
                  }`}
                >
                  {idx < currentStep ? '✓' : ''}
                </div>
                <span className="text-sm font-medium">{lang === 'zh' ? step.zh : step.en}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-shaki-deep mb-2">{t('newClient', lang)}</h1>
        <p className="text-gray-500">{t('heroDescription', lang)}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-shaki-deep mb-2">
            <span className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-shaki-purple" />
              {t('mainCategories', lang)}
            </span>
          </label>
          <input
            required
            type="text"
            value={form.categories}
            onChange={(e) => setForm({ ...form, categories: e.target.value })}
            placeholder={t('mainCategoriesPlaceholder', lang)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-shaki-deep mb-2">
            <span className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-shaki-purple" />
              {t('clientWebsite', lang)}
            </span>
          </label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder={t('clientWebsitePlaceholder', lang)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-shaki-deep mb-2">
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-shaki-purple" />
              {t('socialMedia', lang)}
            </span>
          </label>
          {form.socialLinks.map((link, idx) => (
            <input
              key={idx}
              type="url"
              value={link}
              onChange={(e) => updateSocial(idx, e.target.value)}
              placeholder={t('socialMediaPlaceholder', lang)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none transition-all mb-2"
            />
          ))}
          <button type="button" onClick={addSocial} className="text-sm text-shaki-purple hover:underline">
            + {lang === 'zh' ? '添加更多' : 'Add more'}
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-shaki-purple hover:underline"
          >
            {t('advancedOptions', lang)}
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showAdvanced && (
          <div className="space-y-5 pt-2 border-t border-shaki-lavender">
            <div>
              <label className="block text-sm font-medium text-shaki-deep mb-2">
                <span className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-shaki-purple" />
                  {t('targetMarket', lang)}
                </span>
              </label>
              <select
                value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none bg-white"
              >
                <option value="">{lang === 'zh' ? '请选择' : 'Select'}</option>
                {markets.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-shaki-deep mb-2">
                <span className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-shaki-purple" />
                  {t('customerType', lang)}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {businessTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm({ ...form, businessType: type })}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      form.businessType === type
                        ? 'bg-shaki-purple text-white border-shaki-purple'
                        : 'border-gray-200 text-gray-600 hover:border-shaki-purple'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-shaki-deep mb-2">
                <span className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-shaki-purple" />
                  {t('recommendationGoal', lang)}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {goals.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => setForm({ ...form, goal })}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      form.goal === goal
                        ? 'bg-shaki-purple text-white border-shaki-purple'
                        : 'border-gray-200 text-gray-600 hover:border-shaki-purple'
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="w-full py-3.5 bg-shaki-purple text-white font-semibold rounded-xl hover:bg-[#6D28D9] transition-colors shadow-lg shadow-shaki-purple/20"
        >
          {t('startAnalyzing', lang)}
        </button>
      </form>
    </div>
  );
}
