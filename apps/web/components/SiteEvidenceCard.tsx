'use client';

/**
 * Website evidence card — what the tool actually read.
 *
 * The PM asked for a screenshot of the client's site, and the honest answer is that rendering one
 * needs a browser this service cannot run (0.5 GB, text-only by design) or a third party that would
 * see the client's URL. So this shows the fetched facts instead: the real title, the real department
 * list read out of the nav, the real heading text and the real response metadata.
 *
 * It is deliberately NOT dressed as a screenshot. A card that looks like a picture of a page while
 * being assembled from text is the kind of thing that loses a deal when a buyer notices, and this
 * project has one rule about that: never present assembled data as captured media. The label says so.
 */
import { Globe, Link2, Clock, FileText } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { SiteFacts, SiteSnapshot } from '@/lib/types';

export function SiteEvidenceCard({
  facts,
  snapshot,
  website,
  lang,
}: {
  /** Live facts, when the card is rendered on the analysis screen. */
  facts?: SiteFacts | null;
  /** The trimmed copy persisted on the profile, used on every screen after that. */
  snapshot?: SiteSnapshot | null;
  website: string;
  lang: 'zh' | 'en';
}) {
  const data = facts
    ? {
        finalUrl: facts.finalUrl,
        httpStatus: facts.httpStatus,
        fetchedAt: facts.fetchedAt,
        title: facts.title,
        navItems: facts.navItems || [],
        headings: facts.headings || [],
        excerpt: String(facts.text || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      }
    : snapshot;
  if (!data) return null;

  const nav = (data.navItems || []).filter((n) => n.length >= 3).slice(0, 18);
  const headings = (data.headings || []).filter(Boolean).slice(0, 6);
  const excerpt = data.excerpt;
  const fetched = data.fetchedAt ? new Date(data.fetchedAt) : null;

  return (
    <section className="mt-6 rounded-card border border-shaki-lavender overflow-hidden bg-white">
      {/* URL bar: real, and it shows where the fetch actually landed after redirects. */}
      <div className="flex items-center gap-2 px-3 py-2 bg-panel border-b border-shaki-lavender">
        <Globe className="w-3.5 h-3.5 text-muted shrink-0" />
        <span className="text-[11px] font-mono text-muted truncate">{data.finalUrl || website}</span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {fetched ? (
            <span className="text-[10px] text-muted tabular-nums flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {fetched.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : null}
          <span className="text-[10px] text-success tabular-nums">
            {t('httpStatusLine', lang).replace('{code}', String(data.httpStatus ?? 200))}
          </span>
        </span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm font-semibold text-ink leading-snug">{data.title || website}</p>

        {nav.length > 0 ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
              {lang === 'zh' ? '导航目录（站点自述的经营品类）' : 'Navigation (the range the site states)'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {nav.map((n) => (
                <span key={n} className="text-[11px] px-2 py-0.5 rounded bg-shaki-soft text-shaki-deep">
                  {n}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {headings.length > 0 ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
              {lang === 'zh' ? '页面标题' : 'Page headings'}
            </p>
            <ul className="space-y-0.5">
              {headings.map((h) => (
                <li key={h} className="text-[11px] text-muted flex items-start gap-1.5">
                  <Link2 className="w-3 h-3 mt-0.5 shrink-0 opacity-40" />
                  <span className="truncate">{h}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {excerpt ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {lang === 'zh' ? '正文摘录' : 'Text excerpt'}
            </p>
            <p className="text-[11px] text-muted leading-relaxed">{excerpt}…</p>
          </div>
        ) : null}

        <p className="text-[10px] text-muted border-t border-shaki-lavender pt-2 leading-relaxed">
          {lang === 'zh'
            ? '以上为本次真实抓取到的页面内容与站点结构，供核对分析依据；不是网页截图。'
            : 'Real content and structure fetched from this page, shown so the analysis can be checked. This is not a screenshot of the site.'}
        </p>
      </div>
    </section>
  );
}