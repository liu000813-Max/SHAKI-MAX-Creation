'use client';

import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { ArrowRight, Users, Search, FileText, Share2, Package } from 'lucide-react';

export default function Dashboard() {
  const { lang, clients, proposals } = useAppState();

  const stats = [
    { label: t('clients', lang), value: clients.length, icon: Users },
    { label: t('analyzed', lang), value: clients.length, icon: Search },
    { label: t('proposals', lang), value: proposals.length, icon: FileText },
    { label: t('shared', lang), value: proposals.filter((p) => p.status !== 'Draft').length, icon: Share2 },
    { label: t('samples', lang), value: proposals.filter((p) => p.status === 'Sample Requested').length, icon: Package },
    { label: t('orders', lang), value: proposals.filter((p) => p.status === 'Won').length, icon: Package },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#3B0F7A] to-[#6D28D9] text-white px-8 py-16 mb-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative max-w-2xl">
          <p className="text-white/70 text-sm font-medium tracking-wider uppercase mb-3">SHAKI AI Product Match</p>
          <h1 className="text-4xl md:text-5xl font-semibold leading-tight mb-4">{t('findRightProducts', lang)}</h1>
          <p className="text-lg text-white/80 mb-8 max-w-xl">{t('heroDescription', lang)}</p>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-shaki-purple font-semibold rounded-xl hover:bg-shaki-soft transition-colors"
          >
            {t('startAnalyzing', lang)}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-5 border border-shaki-lavender shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className="w-5 h-5 text-shaki-purple" />
              <span className="text-2xl font-bold text-shaki-deep">{stat.value}</span>
            </div>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </section>

      {/* Recent Clients */}
      <section className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-shaki-deep">{t('clients', lang)}</h2>
          <Link href="/analyze" className="text-sm text-shaki-purple hover:underline">
            {t('newClient', lang)}
          </Link>
        </div>
        {clients.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-shaki-soft/50 rounded-xl">
            <p>{t('noData', lang)}</p>
            <p className="text-sm mt-1">{t('heroDescription', lang)}</p>
          </div>
        ) : (
          <div className="divide-y divide-shaki-lavender">
            {clients.slice(0, 5).map((client) => (
              <Link
                key={client.id}
                href={`/client?id=${client.id}`}
                className="flex items-center justify-between py-4 hover:bg-shaki-soft/50 px-2 rounded-lg transition-colors"
              >
                <div>
                  <p className="font-medium text-shaki-deep">{client.name}</p>
                  <p className="text-sm text-gray-500">{client.market} · {client.businessType}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
