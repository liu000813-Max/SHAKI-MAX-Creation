'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { ScoreRing } from '@/components/ScoreRing';
import { categoryNames, priceLevelNames } from '@/lib/data/products';
import { ArrowLeft, FileText, Share2, Download, Plus, CheckCircle2, Globe, Mail, MessageCircle } from 'lucide-react';
import { Proposal } from '@/lib/types';
import { localizeProductField } from '@/lib/utils';
import { useState } from 'react';

const proposalTypes = [
  { key: 'Single Product', zh: '单品推荐', en: 'Single Product' },
  { key: 'Product Collection', zh: '产品组合', en: 'Product Collection' },
  { key: 'Product Line Proposal', zh: '产品线方案', en: 'Product Line Proposal' },
];

function ProposalPageContent() {
  const { lang, proposals, getClient, getRecommendations, createProposal, clients } = useAppState();
  const searchParams = useSearchParams();
  const proposalId = searchParams.get('id');
  const clientIdParam = searchParams.get('clientId');

  const [selectedClientId, setSelectedClientId] = useState(clientIdParam || '');
  const [selectedType, setSelectedType] = useState<Proposal['type']>('Product Collection');
  const [companyName, setCompanyName] = useState('');

  if (proposalId) {
    const proposal = proposals.find((p) => p.id === proposalId);
    if (proposal) return <ProposalView proposal={proposal} />;
  }

  const client = selectedClientId ? getClient(selectedClientId) : undefined;
  const recs = client ? getRecommendations(client.id) : [];

  const handleCreate = () => {
    if (!client) return;
    const products = recs.slice(0, selectedType === 'Single Product' ? 1 : selectedType === 'Product Line Proposal' ? 6 : 3);
    const proposal = createProposal(client.id, products, selectedType, companyName);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-shaki-purple mb-6">
        <ArrowLeft className="w-4 h-4" />
        {t('goBack', lang)}
      </Link>

      <h1 className="text-2xl font-semibold text-shaki-deep mb-2">{t('proposalBuilder', lang)}</h1>
      <p className="text-gray-500 mb-8">{lang === 'zh' ? '选择客户并生成产品推荐方案。' : 'Select a client and generate a product recommendation proposal.'}</p>

      <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6 mb-6">
        <h2 className="text-base font-semibold text-shaki-deep mb-4">
          {lang === 'zh' ? '1. 选择客户' : '1. Select Client'}
        </h2>
        {clients.length === 0 ? (
          <div className="text-gray-500 text-sm mb-4">
            {lang === 'zh' ? '暂无客户，' : 'No clients yet, '}
            <Link href="/analyze" className="text-shaki-purple hover:underline">
              {t('newClient', lang)}
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedClientId(c.id)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  selectedClientId === c.id
                    ? 'bg-shaki-purple text-white border-shaki-purple'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-shaki-purple'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6 mb-6">
        <h2 className="text-base font-semibold text-shaki-deep mb-4">
          {lang === 'zh' ? '2. 方案类型' : '2. Proposal Type'}
        </h2>
        <div className="flex flex-wrap gap-2">
          {proposalTypes.map((type) => (
            <button
              key={type.key}
              onClick={() => setSelectedType(type.key as any)}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                selectedType === type.key
                  ? 'bg-shaki-purple text-white border-shaki-purple'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-shaki-purple'
              }`}
            >
              {type[lang]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6 mb-6">
        <h2 className="text-base font-semibold text-shaki-deep mb-4">
          {lang === 'zh' ? '3. 白标设置' : '3. White-label Settings'}
        </h2>
        <label className="block text-sm text-gray-500 mb-2">
          {t('whiteLabelBrand', lang)}
        </label>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder={t('whiteLabelBrandPlaceholder', lang)}
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-shaki-deep focus:outline-none focus:border-shaki-purple"
        />
        <p className="text-xs text-gray-400 mt-2">
          {lang === 'zh'
            ? '客户分享页将以该品牌名呈现，SHAKI 仅以小字标注「技术支持」。'
            : 'The share page shows this brand name to the client; SHAKI appears only as a small "Powered by" note.'}
        </p>
      </div>

      {client && (
        <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-shaki-deep mb-4">
            {lang === 'zh' ? '4. 推荐产品预览' : '4. Recommended Products Preview'}
          </h2>
          <div className="space-y-3">
            {recs.slice(0, selectedType === 'Single Product' ? 1 : selectedType === 'Product Line Proposal' ? 6 : 3).map((rec) => (
              <div key={rec.product_id} className="flex items-center gap-4 p-3 bg-shaki-soft/50 rounded-xl">
                <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center">
                  <span className="text-lg">📦</span>
                </div>
                <div className="flex-1">
                    <p className="font-medium text-shaki-deep">
                      {localizeProductField(rec.product, lang, 'product_name')}
                    </p>
                  <p className="text-xs text-gray-500">
                    {categoryNames[rec.product.primary_category]?.[lang]} · {rec.fitScore} {t('sixDimensionScore', lang)}
                  </p>
                </div>
                <ScoreRing score={rec.fitScore} size={56} stroke={4} />
              </div>
            ))}
          </div>
        </div>
      )}

      {client && (
        <button
          onClick={handleCreate}
          className="w-full py-3.5 bg-shaki-purple text-white font-semibold rounded-xl hover:bg-[#6D28D9] transition-colors shadow-lg shadow-shaki-purple/20"
        >
          {t('createProposal', lang)}
        </button>
      )}

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-shaki-deep mb-4">{t('proposals', lang)}</h2>
        {proposals.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('noData', lang)}</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => (
              <Link
                key={p.id}
                href={`/proposal?id=${p.id}`}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-shaki-lavender shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  <p className="font-medium text-shaki-deep">
                    {p.clientName} · {p.products.length} {lang === 'zh' ? '款产品' : 'products'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {p.type} · {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalView({ proposal }: { proposal: ReturnType<typeof useAppState>['proposals'][number] }) {
  const { lang } = useAppState();
  const brand = proposal.companyName?.trim() || 'SHAKI';

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/share?id=${proposal.id}` : `/share?id=${proposal.id}`;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link href="/proposal" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-shaki-purple mb-6">
        <ArrowLeft className="w-4 h-4" />
        {t('goBack', lang)}
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-shaki-deep">{t('proposalPreview', lang)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {proposal.clientName} · {proposal.products.length} {lang === 'zh' ? '款产品' : 'products'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/share?id=${proposal.id}`}
            target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2 bg-shaki-purple text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9]"
          >
            <Share2 className="w-4 h-4" />
            {t('shareProposal', lang)}
          </Link>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-shaki-lavender text-gray-700 text-sm font-medium rounded-lg hover:bg-shaki-soft">
            <Download className="w-4 h-4" />
            {t('downloadPdf', lang)}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-10 mb-6 text-center">
        <p className="text-sm tracking-widest text-gray-400 uppercase mb-4">{brand}</p>
        <h2 className="text-3xl font-semibold text-shaki-deep mb-2">{t('proposalCover', lang)}</h2>
        <div className="w-16 h-0.5 bg-shaki-purple mx-auto my-6" />
        <p className="text-gray-500 mb-2">{t('preparedFor', lang)}</p>
        <p className="text-xl font-medium text-shaki-deep mb-6">{proposal.clientName}</p>
        <p className="text-sm text-gray-400">{proposal.companyName?.trim() ? t('poweredBy', lang) : t('curatedBy', lang)}</p>
      </div>

      <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6 mb-6">
        <h3 className="text-lg font-semibold text-shaki-deep mb-4">{t('aboutYourBrand', lang)}</h3>
        <p className="text-gray-600 leading-relaxed">
          {lang === 'zh'
            ? `根据我们对 ${proposal.clientName} 品牌定位、产品结构及市场方向的研究，以下产品最契合贵司当前业务需求与增长机会。`
            : `Based on our research into ${proposal.clientName}'s brand positioning, product portfolio and market direction, the following products best match your current business needs and growth opportunities.`}
        </p>
      </div>

      <div className="space-y-6">
        {proposal.products.map((rec, idx) => (
          <div key={rec.product_id} className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-shaki-soft flex items-center justify-center text-shaki-purple font-bold">
                {String(idx + 1).padStart(2, '0')}
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">{categoryNames[rec.product.primary_category]?.[lang]}</p>
                  <h3 className="text-xl font-semibold text-shaki-deep">
                    {localizeProductField(rec.product, lang, 'product_name')}
                  </h3>
              </div>
              <ScoreRing score={rec.fitScore} size={64} stroke={5} />
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {localizeProductField(rec.product, lang, 'short_description')}
            </p>
            <div className="bg-shaki-soft/50 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-shaki-deep mb-2">{t('whyWeSelectedIt', lang)}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{rec.reason.businessReason}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">{t('moq', lang)}</p>
                <p className="text-sm font-medium text-shaki-deep">{rec.product.moq}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">{t('leadTime', lang)}</p>
                <p className="text-sm font-medium text-shaki-deep">{rec.product.lead_time}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">{t('price', lang)}</p>
                <p className="text-sm font-medium text-shaki-deep">${rec.product.wholesale_price}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-shaki-deep to-shaki-purple text-white rounded-2xl p-8 mt-6 text-center">
        <h3 className="text-xl font-semibold mb-3">{t('nextStep', lang)}</h3>
        <p className="text-white/80 mb-6 max-w-2xl mx-auto">{t('nextStepText', lang)}</p>
        <div className="flex items-center justify-center gap-4">
          <button className="px-5 py-2.5 bg-white text-shaki-purple rounded-lg font-medium hover:bg-shaki-soft transition-colors">
            {t('requestSample', lang)}
          </button>
          <button className="px-5 py-2.5 border border-white/30 text-white rounded-lg font-medium hover:bg-white/10 transition-colors">
            {t('discussOem', lang)}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6 mt-6">
        <p className="text-sm text-gray-500 mb-2">{t('shareLink', lang)}</p>
        <div className="flex items-center gap-3">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600"
          />
          <button
            onClick={() => navigator.clipboard?.writeText(shareUrl)}
            className="px-4 py-2.5 bg-shaki-purple text-white rounded-lg text-sm font-medium hover:bg-[#6D28D9]"
          >
            {lang === 'zh' ? '复制' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProposalPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading...</div>}>
      <ProposalPageContent />
    </Suspense>
  );
}
