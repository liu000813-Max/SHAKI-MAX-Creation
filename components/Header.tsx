'use client';

import Link from 'next/link';
import { useAppState } from './ClientProvider';
import { t } from '@/lib/i18n';
import { LayoutDashboard, Library, Plus, FileText, Globe } from 'lucide-react';

export default function Header() {
  const { lang, setLang } = useAppState();

  const nav = [
    { href: '/', label: t('dashboard', lang), icon: LayoutDashboard },
    { href: '/analyze', label: t('newClient', lang), icon: Plus },
    { href: '/library', label: t('productLibrary', lang), icon: Library },
    { href: '/proposal', label: t('proposalBuilder', lang), icon: FileText },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-shaki-lavender">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-shaki-purple to-[#4C1D95] flex items-center justify-center text-white font-bold text-sm">
            S
          </div>
          <span className="font-semibold text-shaki-deep text-lg tracking-tight">SHAKI AI</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-shaki-purple hover:bg-shaki-soft transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-shaki-lavender text-sm font-medium text-shaki-purple hover:bg-shaki-soft transition-colors"
        >
          <Globe className="w-4 h-4" />
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      </div>
    </header>
  );
}
