'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t, localize, localizeOpportunity, marketLabel, styleLabel, opportunityLabel, businessTypeLabel } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { RouteLoading } from '@/components/RouteLoading';
import { categoryNames, priceLevelNames } from '@/lib/data/products';
import { CategoryCode, PriceLevel } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SiteEvidenceCard } from '@/components/SiteEvidenceCard';
import { localizeProductField } from '@/lib/utils';
import {
  ArrowLeft, Sparkles, TrendingUp, Palette, Users, DollarSign, Globe,
  Building2, MapPin, ShieldCheck, AlertTriangle, Eye, Info,
} from 'lucide-react';

function EmptyClient() {
  const { lang } = useAppState();
  return (
    <AppShell title={t('clientIntelligence', lang)}>
      <div className="text-center py-20 text-muted">
        <p>{t('noData', lang)}</p>
        <Link href="/analyze" className="text-shaki-purple hover:underline mt-2 inline-block">
          {t('newClient', lang)}
        </Link>
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col py-1.5 border-b border-shaki-lavender last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

function Tag({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-shaki-soft text-shaki-purple text-xs rounded-full font-medium">
      <Icon className="w-3.5 h-3.5" />
      {text}
    </span>
  );
}

function ClientIntelContent() {
  const { lang, getClient, getRecommendations } = useAppState();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('id') || '';
  const client = getClient(clientId);
  const recs = getRecommendations(clientId);
  const best = recs[0];

  if (!client) return <EmptyClient />;

  const confMeta = {
    High: { color: 'bg-success/10 text-success', label: t('highConfidence', lang), icon: ShieldCheck },
    Medium: { color: 'bg-warning/10 text-warning', label: t('mediumConfidence', lang), icon: AlertTriangle },
    Low: { color: 'bg-danger/10 text-danger', label: t('lowConfidence', lang), icon: AlertTriangle },
  }[client.confidence];

  return (
    <AppShell title={t('clientIntelligence', lang)}>
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-shaki-purple mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t('backToDashboard', lang)}
      </Link>

      {/* Top summary strip */}
      <section className="bg-white rounded-card border border-shaki-lavender p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-semibold text-ink">{client.name}</h2>
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', confMeta.color)}>
              <confMeta.icon className="w-3.5 h-3.5" />
              {confMeta.label}
            </span>
          </div>
          <p className="text-sm text-muted">{client.website || '—'}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Tag icon={MapPin} text={`${t('market', lang)}: ${client.market}`} />
            <Tag icon={Building2} text={`${t('businessType', lang)}: ${businessTypeLabel(client.businessType, lang)}`} />
            <Tag
              icon={DollarSign}
              text={`${t('pricePosition', lang)}: ${priceLevelNames[client.pricePosition as PriceLevel]?.[lang] || client.pricePosition}`}
            />
          </div>
        </div>
        <Link
          href={`/recommendations?id=${client.id}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-shaki-purple text-white text-sm font-medium rounded-btn hover:bg-shaki-purple2"
        >
          <Sparkles className="w-4 h-4" />
          {t('viewRecommendations', lang)}
        </Link>
      </section>

      {/* 3-column intelligence cards */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-card border border-shaki-lavender p-6">
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <Palette className="w-4 h-4 text-shaki-purple" />
            {t('brandDna', lang)}
          </h3>
          <p className="text-xs text-muted mb-1">{t('brandPositioning', lang)}</p>
          <p className="text-sm font-medium text-ink mb-4">{localize(client.brandPositioning, lang)}</p>
          <p className="text-xs text-muted mb-2">{t('visualStyle', lang)}</p>
          <div className="flex flex-wrap gap-2">
            {client.visualStyle.map((s) => (
              <span key={s} className="px-2.5 py-1 bg-shaki-soft text-shaki-purple text-xs rounded-full">
                {styleLabel(s, lang)}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-card border border-shaki-lavender p-6">
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-shaki-purple" />
            {t('targetAudience', lang)}
          </h3>
          <InfoRow label={t('targetAudience', lang)} value={client.targetAudience} />
          <InfoRow label={t('pricePosition', lang)} value={priceLevelNames[client.pricePosition as PriceLevel]?.[lang] || client.pricePosition} />
          <InfoRow
            label={t('mainCategories', lang)}
            value={client.mainCategories.map((c) => categoryNames[c as CategoryCode]?.[lang] || c).join(', ')}
          />
        </div>

        <div className="bg-white rounded-card border border-shaki-lavender p-6">
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-shaki-purple" />
            {t('portfolioMap', lang)}
          </h3>
          <div className="space-y-3">
            {client.portfolio.map((p) => (
              <div key={p.category}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted">{categoryNames[p.category as CategoryCode]?.[lang] || p.category}</span>
                  <span className="text-ink font-medium">{p.share}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-shaki-purple rounded-full" style={{ width: `${p.share}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/*
        The evidence the conclusions below rest on. A rep who cannot see what was read cannot defend
        the analysis, and a client who is told "your site says X" without proof is right to ask how we
        know. See SiteEvidenceCard for why this is a data card and not a picture of the page.
      */}
      <div className="mb-6">
        <SiteEvidenceCard snapshot={client.siteSnapshot ?? null} website={client.website} lang={lang} />
      </div>

      {/* Opportunities panel — PRD §14 Opportunity Agent output.
          PRD §16 requires inferences to be visibly separated from observed facts, so the kind
          travels as a localised chip and the panel carries an explicit disclosure. */}
      <section className="bg-white rounded-card border border-shaki-lavender p-6 mb-6">
        <h3 className="font-semibold text-ink mb-1 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-shaki-purple" />
          {t('clientOpportunities', lang)}
        </h3>
        <p className="text-[11px] text-muted flex items-start gap-1.5 mb-4">
          <Info className="w-3.5 h-3.5 mt-px shrink-0 text-warning" />
          {t('inferenceDisclosure', lang)}
        </p>
        <ul className="space-y-3">
          {client.opportunities.map((op, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="inline-flex items-center px-2 py-0.5 bg-shaki-soft text-shaki-purple text-[11px] font-medium rounded-full shrink-0 mt-0.5">
                {typeof op === 'string' ? t('aiInferred', lang) : opportunityLabel(op.kind, lang)}
              </span>
              <span className="text-sm text-muted">{localizeOpportunity(op, lang)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Best match teaser — leads with the PRD Layer 5 Final Score, same metric as the cards. */}
      {best && (
        <section className="bg-gradient-to-r from-shaki-soft to-white rounded-card border border-shaki-lavender p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">{t('topMatch', lang)}</p>
            <p className="text-lg font-semibold text-ink">{localizeProductField(best.product, lang, 'product_name')}</p>
            <p className="text-sm text-muted">
              {t('finalScore', lang)} {best.finalScore ?? best.fitScore} · {t('fitScore', lang)} {best.fitScore} ·{' '}
              {t('potentialShort', lang)} {best.potentialScore}
            </p>
          </div>
          <Link
            href={`/recommendations?id=${client.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-shaki-purple text-white text-sm font-medium rounded-btn hover:bg-shaki-purple2"
          >
            <Eye className="w-4 h-4" />
            {t('viewRecommendations', lang)}
          </Link>
        </section>
      )}
    </AppShell>
  );
}

export default function ClientIntelligencePage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <ClientIntelContent />
    </Suspense>
  );
}
