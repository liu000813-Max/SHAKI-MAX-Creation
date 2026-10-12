'use client';

import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';

/**
 * Shared Suspense fallback for the routes that read `useSearchParams()`.
 *
 * These were seven independent copies of a hard-coded English `Loading…`, which the Chinese UI
 * showed no matter what the language toggle said (PRD §18). The fallback renders before the page
 * component mounts, so it cannot read a `lang` prop — it reads the context directly instead.
 */
export function RouteLoading() {
  const { lang } = useAppState();
  return <div className="p-10 text-center text-muted">{t('loading', lang)}</div>;
}
