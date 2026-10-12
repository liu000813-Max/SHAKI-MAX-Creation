'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t, proposalTypeLabel } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { RouteLoading } from '@/components/RouteLoading';
import { categoryNames, priceLevelNames } from '@/lib/data/products';
import { localizeProductField } from '@/lib/utils';
import { generateProposalCopy } from '@/lib/proposal';
import { ScoreRing } from '@/components/ScoreRing';
import { ArrowLeft, Share2, Eye, Sparkles, Plus, X, Check } from 'lucide-react';
import { Proposal } from '@/lib/types';

// Kept as bare enum values: the labels already exist in the i18n dictionary and this page used to
// hold a second copy of them, as did `/compare`.
const PROPOSAL_TYPES: Proposal['type'][] = ['Single Product', 'Product Collection', 'Product Line Proposal'];

function ProposalPageContent() {
  const {
    lang,
    proposals,
    getClient,
    getRecommendations,
    createProposal,
    clients,
    updateProposal,
    shareProposal,
    toggleProposalProduct,
  } = useAppState();
  const searchParams = useSearchParams();
  const router = useRouter();
  const proposalId = searchParams.get('id');
  const clientIdParam = searchParams.get('clientId');

  const [selectedClientId, setSelectedClientId] = useState(clientIdParam || '');
  const [selectedType, setSelectedType] = useState<Proposal['type']>('Product Collection');
  const [companyName, setCompanyName] = useState('');

  if (proposalId) {
    const proposal = proposals.find((p) => p.id === proposalId);
    if (proposal) return <ProposalEditor proposal={proposal} />;
  }

  const client = selectedClientId ? getClient(selectedClientId) : undefined;
  const recs = client ? getRecommendations(client.id) : [];

  const handleCreate = () => {
    if (!client) return;
    const products = recs.slice(0, selectedType === 'Single Product' ? 1 : selectedType === 'Product Line Proposal' ? 6 : 3);
    const proposal = createProposal(client.id, products, selectedType, companyName);
    router.push(`/proposal?id=${proposal.id}`);
  };

  return (
    <AppShell title={t('proposalBuilder', lang)}>
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-shaki-purple mb-6">
        <ArrowLeft className="w-4 h-4" />
        {t('goBack', lang)}
      </Link>

      <h1 className="text-2xl font-semibold text-shaki-deep mb-2">{t('proposalBuilder', lang)}</h1>
      <p className="text-muted mb-8">
        {lang === 'zh' ? '选择客户并生成产品推荐方案。' : 'Select a client and generate a product recommendation proposal.'}
      </p>

      <div className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 mb-6">
        <h2 className="text-base font-semibold text-shaki-deep mb-4">{lang === 'zh' ? '1. 选择客户' : '1. Select Client'}</h2>
        {clients.length === 0 ? (
          <div className="text-muted text-sm mb-4">
            {lang === 'zh' ? '暂无客户，' : 'No clients yet, '}
            <Link href="/analyze" className="text-shaki-purple hover:underline">{t('newClient', lang)}</Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedClientId(c.id)}
                className={`px-4 py-2 rounded-btn text-sm border transition-colors ${
                  selectedClientId === c.id ? 'bg-shaki-purple text-white border-shaki-purple' : 'bg-white border-shaki-lavender text-muted hover:border-shaki-purple'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 mb-6">
        <h2 className="text-base font-semibold text-shaki-deep mb-4">{lang === 'zh' ? '2. 方案类型' : '2. Proposal Type'}</h2>
        <div className="flex flex-wrap gap-2">
          {PROPOSAL_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-4 py-2 rounded-btn text-sm border transition-colors ${
                selectedType === type ? 'bg-shaki-purple text-white border-shaki-purple' : 'bg-white border-shaki-lavender text-muted hover:border-shaki-purple'
              }`}
            >
              {proposalTypeLabel(type, lang)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 mb-6">
        <h2 className="text-base font-semibold text-shaki-deep mb-4">{lang === 'zh' ? '3. 白标设置' : '3. White-label Settings'}</h2>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder={t('whiteLabelBrandPlaceholder', lang)}
          className="w-full px-4 py-2.5 bg-panel border border-shaki-lavender rounded-btn text-sm text-shaki-deep focus:outline-none focus:border-shaki-purple"
        />
      </div>

      {client && (
        <div className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-shaki-deep mb-4">{lang === 'zh' ? '4. 推荐产品预览' : '4. Recommended Products Preview'}</h2>
          <div className="space-y-3">
            {recs
              .slice(0, selectedType === 'Single Product' ? 1 : selectedType === 'Product Line Proposal' ? 6 : 3)
              .map((rec) => (
                <div key={rec.product_id} className="flex items-center gap-4 p-3 bg-shaki-soft/50 rounded-xl">
                  <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center"><span className="text-lg">📦</span></div>
                  <div className="flex-1">
                    <p className="font-medium text-shaki-deep">{localizeProductField(rec.product, lang, 'product_name')}</p>
                    <p className="text-xs text-muted">
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
          className="w-full py-3.5 bg-shaki-purple text-white font-semibold rounded-btn hover:bg-shaki-purple2 transition-colors shadow-lg shadow-shaki-purple/20"
        >
          {t('createProposal', lang)}
        </button>
      )}

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-shaki-deep mb-4">{t('proposals', lang)}</h2>
        {proposals.length === 0 ? (
          <p className="text-muted text-sm">{t('noData', lang)}</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => (
              <Link
                key={p.id}
                href={`/proposal?id=${p.id}`}
                className="flex items-center justify-between p-4 bg-white rounded-card border border-shaki-lavender shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  <p className="font-medium text-shaki-deep">
                    {p.title?.trim() || `${p.clientName} · ${p.products.length} ${t('productCount', lang)}`}
                  </p>
                  <p className="text-xs text-muted">{proposalTypeLabel(p.type, lang)} · {new Date(p.createdAt).toLocaleDateString()}</p>
                </div>
                <ArrowLeft className="w-4 h-4 text-muted rotate-180" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ProposalEditor({ proposal }: { proposal: Proposal }) {
  const { lang, getClient, getRecommendations, updateProposal, shareProposal, toggleProposalProduct } = useAppState();
  const router = useRouter();
  const client = getClient(proposal.clientId);
  const recs = client ? getRecommendations(client.id) : [];
  const [generating, setGenerating] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);

  const inProposal = (id: string) => proposal.products.some((p) => p.product_id === id);
  const available = recs.filter((r) => !inProposal(r.product_id));

  const handleGenerate = () => {
    setGenerating(true);
    // Deterministic offline generator — small delay for UX feedback only.
    setTimeout(() => {
      const result = generateProposalCopy(client, proposal.products, lang, proposal.title);
      updateProposal(proposal.id, { title: result.title, copy: result.copy });
      setGenerating(false);
      setJustGenerated(true);
      setTimeout(() => setJustGenerated(false), 2500);
    }, 400);
  };

  const handleShare = () => {
    const url = shareProposal(proposal.id);
    if (url) {
      navigator.clipboard?.writeText(url);
      router.push(`/share?id=${proposal.id}`);
    }
  };

  return (
    <AppShell title={t('editProposal', lang)}>
      <Link href="/proposal" className="inline-flex items-center gap-2 text-sm text-muted hover:text-shaki-purple mb-6">
        <ArrowLeft className="w-4 h-4" />
        {t('proposalBuilder', lang)}
      </Link>

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-shaki-deep">{t('editProposal', lang)}</h1>
          <p className="text-sm text-muted mt-1">
            {proposal.clientName} · {proposal.products.length} {t('productCount', lang)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/proposal-preview?id=${proposal.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-shaki-lavender text-shaki-deep text-sm font-medium rounded-btn hover:bg-shaki-soft"
          >
            <Eye className="w-4 h-4" />
            {t('preview', lang)}
          </Link>
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-4 py-2 bg-shaki-purple text-white text-sm font-medium rounded-btn hover:bg-shaki-purple2"
          >
            <Share2 className="w-4 h-4" />
            {t('shareProposal', lang)}
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 mb-6">
        <label className="block text-sm font-medium text-shaki-deep mb-2">{t('proposalTitle', lang)}</label>
        <input
          value={proposal.title ?? ''}
          onChange={(e) => updateProposal(proposal.id, { title: e.target.value })}
          placeholder={t('proposalTitlePlaceholder', lang)}
          className="w-full px-4 py-2.5 bg-panel border border-shaki-lavender rounded-btn text-sm text-shaki-deep focus:outline-none focus:border-shaki-purple"
        />
      </div>

      {/* Products */}
      <div className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-shaki-deep">{t('proposalProducts', lang)}</h2>
          <span className="text-xs text-muted">{proposal.products.length} {t('productCount', lang)}</span>
        </div>
        <div className="space-y-3">
          {proposal.products.map((rec) => (
            <div key={rec.product_id} className="flex items-center gap-4 p-3 bg-shaki-soft/50 rounded-xl">
              <div className="w-11 h-11 rounded-lg bg-white flex items-center justify-center flex-shrink-0"><span className="text-lg">📦</span></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-shaki-deep truncate">{localizeProductField(rec.product, lang, 'product_name')}</p>
                <p className="text-xs text-muted">
                  {categoryNames[rec.product.primary_category]?.[lang]} · {priceLevelNames[rec.product.price_level]?.[lang]} · {rec.fitScore}
                </p>
              </div>
              <ScoreRing score={rec.fitScore} size={48} stroke={4} />
              <button
                onClick={() => toggleProposalProduct(proposal.id, rec)}
                className="p-2 text-muted hover:text-danger rounded-lg hover:bg-shaki-soft"
                aria-label={t('removeFromProposal', lang)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {available.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted mb-2">{t('addFromRecommendations', lang)}</p>
            <div className="flex flex-wrap gap-2">
              {available.map((rec) => (
                <button
                  key={rec.product_id}
                  onClick={() => toggleProposalProduct(proposal.id, rec)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-shaki-lavender text-muted hover:border-shaki-purple hover:text-shaki-purple"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {localizeProductField(rec.product, lang, 'product_name')}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI copy */}
      <div className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-shaki-deep">{t('proposalNarrative', lang)}</h2>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-shaki-purple text-white text-sm font-medium rounded-btn hover:bg-shaki-purple2 disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? t('generatingCopy', lang) : t('aiGenerateCopy', lang)}
          </button>
        </div>
        {justGenerated && <p className="text-xs text-success mb-2">{t('copyGenerated', lang)}</p>}
        <textarea
          value={proposal.copy ?? ''}
          onChange={(e) => updateProposal(proposal.id, { copy: e.target.value })}
          placeholder={t('proposalNarrativePlaceholder', lang)}
          rows={12}
          className="w-full px-4 py-3 bg-panel border border-shaki-lavender rounded-btn text-sm text-shaki-deep leading-relaxed focus:outline-none focus:border-shaki-purple resize-y"
        />
      </div>
    </AppShell>
  );
}

export default function ProposalPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <ProposalPageContent />
    </Suspense>
  );
}
