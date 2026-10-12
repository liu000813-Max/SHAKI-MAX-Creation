'use client';

import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t, localizeOpportunity, opportunityLabel, marketLabel, businessTypeLabel } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { ArrowRight, Users, Search, FileText, Share2, Package, Plus, Sparkles } from 'lucide-react';

export default function DashboardPage() {
  const { lang, clients, proposals } = useAppState();

  const stats = [
    { label: t('clients', lang), value: clients.length, icon: Users },
    { label: t('analyzed', lang), value: clients.length, icon: Search },
    { label: t('proposals', lang), value: proposals.length, icon: FileText },
    { label: t('shared', lang), value: proposals.filter((p) => p.status !== 'Draft').length, icon: Share2 },
    { label: t('samples', lang), value: proposals.filter((p) => p.status === 'Sample Requested').length, icon: Package },
    { label: t('orders', lang), value: proposals.filter((p) => p.status === 'Won').length, icon: Package },
  ];

  const opportunities = clients.flatMap((c) => c.opportunities.slice(0, 2)).slice(0, 5);

  return (
    <AppShell title={t('dashboard', lang)}>
      {/* Hero */}
      <section className="rounded-2xl bg-gradient-to-br from-[#3B0F7A] to-[#6D28D9] text-white px-8 py-10 mb-6">
        <p className="text-white/70 text-xs font-medium tracking-wider uppercase mb-2">SHAKI AI Product Match</p>
        <h1 className="text-2xl md:text-3xl font-semibold mb-2">{t('findRightProducts', lang)}</h1>
        <p className="text-white/80 text-sm max-w-2xl mb-5">{t('heroDescription', lang)}</p>
        <Link
          href="/analyze"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-shaki-purple font-semibold rounded-btn hover:bg-shaki-soft"
        >
          <Plus className="w-4 h-4" /> {t('newClient', lang)}
        </Link>
      </section>

      {/* KPI row */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-card p-4 border border-shaki-lavender">
            <s.icon className="w-5 h-5 text-shaki-purple mb-2" />
            <div className="text-2xl font-bold text-ink">{s.value}</div>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent clients */}
        <section className="lg:col-span-2 bg-white rounded-card border border-shaki-lavender p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ink">{t('clients', lang)}</h2>
            <Link href="/analyze" className="text-sm text-shaki-purple hover:underline">
              {t('newClient', lang)}
            </Link>
          </div>
          {clients.length === 0 ? (
            <div className="text-center py-12 text-muted bg-shaki-soft/50 rounded-xl">
              <p>{t('noData', lang)}</p>
              <Link href="/analyze" className="text-shaki-purple hover:underline mt-1 inline-block text-sm">
                {t('newClient', lang)}
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-shaki-lavender">
              {clients.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  href={`/client-intelligence?id=${c.id}`}
                  className="flex items-center justify-between py-3 hover:bg-shaki-soft/50 px-2 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-sm text-muted">
                      {marketLabel(c.market, lang)} · {businessTypeLabel(c.businessType, lang)}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Opportunity feed */}
        <section className="bg-white rounded-card border border-shaki-lavender p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-shaki-purple" />
            <h2 className="text-lg font-semibold text-ink">{t('clientOpportunities', lang)}</h2>
          </div>
          {opportunities.length === 0 ? (
            <p className="text-sm text-muted">
              {lang === 'zh' ? '分析客户后将在此显示机会' : 'Opportunities appear after analyzing clients'}
            </p>
          ) : (
            <ul className="space-y-3">
              {opportunities.map((op, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="inline-flex items-center px-2 py-0.5 bg-shaki-soft text-shaki-purple text-[11px] font-medium rounded-full shrink-0 mt-0.5">
                    {typeof op === 'string' ? t('aiInferred', lang) : opportunityLabel(op.kind, lang)}
                  </span>
                  <span className="text-sm text-muted leading-snug">{localizeOpportunity(op, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
