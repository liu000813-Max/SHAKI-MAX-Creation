'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Plus, Users, Package, FileText, Share2, Sparkles, LogOut, Globe, ChevronRight, Wrench, Menu, X } from 'lucide-react';
import { useAppState } from '@/components/ClientProvider';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const primaryNav = [
  { href: '/', labelKey: 'dashboardNav', icon: LayoutDashboard },
  { href: '/analyze', labelKey: 'newClientNav', icon: Plus },
] as const;

const secondaryNav = [
  { href: '/catalog', labelKey: 'libraryNav', icon: Package },
  { href: '/enrichment', labelKey: 'enrichmentNav', icon: Wrench },
  { href: '/proposal', labelKey: 'proposalsNav', icon: FileText },
  { href: '/share', labelKey: 'sharePage', icon: Share2 },
] as const;

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const { lang, setLang, clients } = useAppState();
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Below `lg` this sidebar is an off-canvas drawer. The link this app is handed out as gets opened
  // in WeChat's in-app browser, i.e. on a phone, where a permanently-resident 240px column left the
  // page body 54px wide. The drawer is the same navigation, just not standing on the content.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Following a link should show the destination, not leave the drawer covering it.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted">…</div>;
  }
  if (!user) return null;

  const latest = clients[0];
  const ciHref = latest ? `/client-intelligence?id=${latest.id}` : '/analyze';
  const recHref = latest ? `/recommendations?id=${latest.id}` : '/analyze';

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <div className="min-h-screen flex bg-surface">
      {/* Backdrop: only exists below `lg`, and only while the drawer is open. Tapping it closes. */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden print:hidden"
        />
      )}

      {/* Sidebar: 240px and in-flow at `lg`+, off-canvas drawer below it */}
      <aside
        data-shell-nav
        className={cn(
          'w-60 border-r border-shaki-lavender bg-white flex flex-col print:hidden',
          'fixed inset-y-0 left-0 z-40 transition-transform duration-200',
          'lg:static lg:z-auto lg:translate-x-0 lg:transition-none lg:flex-shrink-0',
          navOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-16 flex items-center justify-between gap-2 px-5 border-b border-shaki-lavender">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-shaki-purple text-white font-bold flex items-center justify-center text-sm">
              S
            </div>
            <span className="font-semibold text-ink">SHAKI AI</span>
          </div>
          {/* Open, the drawer covers the header's toggle, so it carries its own way out. */}
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label={t('closeNav', lang)}
            className="lg:hidden -mr-1 p-2 rounded-lg text-muted hover:bg-shaki-soft hover:text-shaki-purple"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {primaryNav.map((n) => (
            <ShellLink key={n.href} href={n.href} label={t(n.labelKey, lang)} icon={n.icon} active={isActive(n.href)} />
          ))}

          <div className="pt-3 pb-1 px-2 text-[11px] uppercase tracking-wider text-muted">
            {t('clientIntelligence', lang)}
          </div>
          <ShellLink href={ciHref} label={t('clientIntelligence', lang)} icon={Users} active={pathname.startsWith('/client-intelligence')} />
          <ShellLink href={recHref} label={t('recommendedProducts', lang)} icon={Sparkles} active={pathname.startsWith('/recommendations')} />

          {clients.length > 0 && (
            <div className="pt-1 space-y-0.5">
              {clients.slice(0, 4).map((c) => (
                <Link
                  key={c.id}
                  href={`/client-intelligence?id=${c.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted hover:text-shaki-purple rounded-lg hover:bg-shaki-soft truncate"
                >
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{c.name}</span>
                </Link>
              ))}
            </div>
          )}

          <div className="pt-3 pb-1 px-2 text-[11px] uppercase tracking-wider text-muted">
            {t('more', lang)}
          </div>
          {secondaryNav.map((n) => (
            <ShellLink key={n.href} href={n.href} label={t(n.labelKey, lang)} icon={n.icon} active={isActive(n.href)} />
          ))}
        </nav>

        <div className="p-3 border-t border-shaki-lavender">
          <button
            onClick={signOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted hover:text-danger rounded-lg hover:bg-shaki-soft"
          >
            <LogOut className="w-4 h-4" /> {t('signOut', lang)}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar 64px */}
        <header className="h-16 flex-shrink-0 border-b border-shaki-lavender bg-white/80 backdrop-blur flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-12">
          <div className="flex items-center gap-2 min-w-0">
            <button
              data-shell-nav-toggle
              type="button"
              onClick={() => setNavOpen((o) => !o)}
              aria-label={t('navMenu', lang)}
              aria-expanded={navOpen}
              className="lg:hidden flex-shrink-0 -ml-1 p-2 rounded-lg text-ink hover:bg-shaki-soft hover:text-shaki-purple"
            >
              {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h1 className="text-base font-semibold text-ink truncate">{title || t('appTitle', lang)}</h1>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-muted hidden sm:inline">{user.email}</span>
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-shaki-lavender text-sm font-medium text-shaki-purple hover:bg-shaki-soft"
            >
              <Globe className="w-4 h-4" />
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
          </div>
        </header>

        {/* Content: max 1200px. Gutters step 16 -> 24 -> 48px so a phone keeps its width for text. */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-12 print:max-w-full print:px-0 print:py-0">{children}</div>
        </main>
      </div>
    </div>
  );
}

function ShellLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
        active ? 'bg-shaki-soft text-shaki-purple' : 'text-ink hover:bg-shaki-soft hover:text-shaki-purple'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}
