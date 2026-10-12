'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { heydildiViews, type HeydildiProductView } from '@/lib/data/heydildi';
import { LAYER_STATS, ENRICHMENT_QUEUE, PM_REQUIRED_FIELDS, libraryStatsData } from '@/lib/data/library-view';
import { Film, Box, FileText as FileIcon, Layers, X, Search, Database, ListChecks, ChevronDown, Wrench, ArrowUpRight } from 'lucide-react';

function SkuCard({
  v,
  onOpen,
}: {
  v: HeydildiProductView;
  onOpen: (v: HeydildiProductView) => void;
}) {
  const { lang } = useAppState();
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <button
      onClick={() => onOpen(v)}
      className="group text-left rounded-2xl border border-shaki-lavender bg-white overflow-hidden hover:shadow-lg hover:border-shaki-purple transition-all"
    >
      <div className="relative aspect-[4/3] bg-shaki-soft flex items-center justify-center">
        {v.hero && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={v.hero}
            alt={v.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <span className="text-shaki-purple/60 font-semibold text-sm px-3 text-center">
            {v.name}
          </span>
        )}
        {v.isBundle && (
          <span className="absolute top-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-shaki-purple text-white">
            {t('bundle', lang)}
          </span>
        )}
        <div className="absolute bottom-2 right-2 flex gap-1">
          {v.videoCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-black/60 text-white">
              <Film className="w-3 h-3" />
              {v.videoCount}
            </span>
          )}
          {v.cadCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-black/60 text-white">
              <Box className="w-3 h-3" />
              {v.cadCount}
            </span>
          )}
        </div>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-sm font-medium text-ink truncate">{v.name}</div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
          <span>{v.gallery.length} 图</span>
          {v.hasEnglishPage && (
            <span className="flex items-center gap-0.5 text-shaki-purple">
              <FileIcon className="w-3 h-3" />
              EN
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function Lightbox({
  v,
  onClose,
}: {
  v: HeydildiProductView;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col print:hidden"
      onClick={onClose}
    >
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white text-lg font-semibold">{v.name}</h2>
              <p className="text-white/60 text-xs">
                {v.gallery.length} 图 · {v.videoCount} 视频 · {v.cadCount} CAD
                {v.hasEnglishPage ? ' · 英文产品页 ✓' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {v.gallery.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {v.gallery.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`${v.name} ${i + 1}`}
                  loading="lazy"
                  className="w-full rounded-xl bg-white/5 object-cover aspect-[4/3]"
                />
              ))}
            </div>
          )}

          {v.videos.length > 0 && (
            <div className="mt-6">
              <div className="text-white/70 text-sm mb-2 flex items-center gap-1.5">
                <Film className="w-4 h-4" /> 视频演示
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {v.videos.map((src, i) => (
                  <video
                    key={i}
                    src={src}
                    controls
                    preload="none"
                    className="w-full rounded-xl bg-black aspect-video"
                  />
                ))}
              </div>
            </div>
          )}

          {v.cad.length > 0 && (
            <div className="mt-6">
              <div className="text-white/70 text-sm mb-2 flex items-center gap-1.5">
                <Box className="w-4 h-4" /> CAD 源文件
              </div>
              <ul className="space-y-1">
                {v.cad.map((src, i) => (
                  <li key={i}>
                    <a
                      href={src}
                      className="text-shaki-purple hover:underline text-sm"
                      download
                    >
                      {src.split('/').pop()}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Three-layer library breakdown — the honest data-provenance view behind the engine. */
function LayerStrip() {
  const { lang } = useAppState();
  return (
    <div className="bg-white rounded-card border border-shaki-lavender p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-4 h-4 text-shaki-purple" />
        <h3 className="text-sm font-semibold text-ink">{t('libraryLayers', lang)}</h3>
        <span className="text-[11px] text-muted">
          {libraryStatsData.total} SKU · {t('completenessGate', lang)} ≥ {libraryStatsData.gate}%
        </span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {LAYER_STATS.map((l) => (
          <div key={l.key} className="rounded-lg border border-shaki-lavender bg-panel p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{lang === 'zh' ? l.zh : l.en}</span>
              <span className="text-lg font-bold text-shaki-purple tabular-nums">{l.count}</span>
            </div>
            <p className="text-[11px] text-muted mt-1 leading-relaxed">{lang === 'zh' ? l.noteZh : l.noteEn}</p>
            <span
              className={
                'inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium ' +
                (l.eligible > 0 ? 'bg-success/10 text-success' : 'bg-gray-100 text-muted')
              }
            >
              {l.eligible} {t('scoringEligible', lang)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Which crawled SKUs are closest to clearing the gate, and what is still missing. */
function EnrichmentQueue() {
  const { lang } = useAppState();
  const [open, setOpen] = useState(false);
  const rows = open ? ENRICHMENT_QUEUE : ENRICHMENT_QUEUE.slice(0, 6);

  return (
    <section className="mt-8 bg-white rounded-card border border-shaki-lavender p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-start gap-2">
          <ListChecks className="w-4 h-4 text-shaki-purple mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-ink">{t('enrichmentTitle', lang)}</h3>
            <p className="text-[11px] text-muted mt-0.5 leading-relaxed max-w-[640px]">{t('enrichmentHint', lang)}</p>
          </div>
        </div>
        <Link
          href="/enrichment"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-btn bg-shaki-purple text-white text-sm font-medium hover:bg-shaki-purple2 shrink-0"
        >
          <Wrench className="w-3.5 h-3.5" />
          {t('enrichmentWorkbench', lang)}
        </Link>
      </div>

      <p className="text-[11px] text-muted mb-3">
        <span className="text-ink font-medium">{t('pmRequired', lang)}: </span>
        {PM_REQUIRED_FIELDS.join(' · ')}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted border-b border-shaki-lavender">
              <th className="py-2 pr-3 font-medium">SKU</th>
              <th className="py-2 pr-3 font-medium">{t('category', lang)}</th>
              <th className="py-2 pr-3 font-medium">{t('completeness', lang)}</th>
              <th className="py-2 pr-3 font-medium">{t('missingCrawl', lang)}</th>
              <th className="py-2 pr-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.product_id} className="border-b border-shaki-lavender/50">
                <td className="py-2 pr-3 text-ink font-mono text-[11px] truncate max-w-[180px]">{q.sku}</td>
                <td className="py-2 pr-3 text-muted">{q.category}</td>
                <td className="py-2 pr-3 text-muted tabular-nums">{q.completeness}%</td>
                <td className="py-2 pr-3 text-muted">
                  {q.missing_crawl_fields.length ? q.missing_crawl_fields.join(', ') : '—'}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Link
                    href={`/enrichment?id=${encodeURIComponent(q.product_id)}`}
                    className="inline-flex items-center gap-1 text-shaki-purple hover:underline whitespace-nowrap"
                  >
                    {t('enrichmentNav', lang)}
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ENRICHMENT_QUEUE.length > 6 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs text-shaki-purple hover:underline"
        >
          <ChevronDown className={open ? 'w-3.5 h-3.5 rotate-180 transition-transform' : 'w-3.5 h-3.5 transition-transform'} />
          {open ? (lang === 'zh' ? '收起' : 'Show less') : `${lang === 'zh' ? '展开全部' : 'Show all'} ${ENRICHMENT_QUEUE.length}`}
        </button>
      )}
    </section>
  );
}

export default function CatalogPage() {
  const { lang } = useAppState();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<HeydildiProductView | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return heydildiViews;
    return heydildiViews.filter((v) => v.sku.toLowerCase().includes(q));
  }, [query]);

  return (
    <AppShell title={t('productLibrary', lang)}>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-ink">
            {t('productLibrary', lang)}
          </h2>
          <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            {heydildiViews.length} SKU · {lang === 'zh' ? '供应商媒体包（图片 / 视频 / CAD）' : 'Supplier media packs (images / videos / CAD)'}
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === 'zh' ? '搜索 SKU…' : 'Search SKU…'}
            className="pl-9 pr-3 py-2 rounded-full border border-shaki-lavender text-sm text-ink focus:outline-none focus:border-shaki-purple bg-white"
          />
        </div>
      </div>

      <LayerStrip />

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted">无匹配 SKU</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((v) => (
            <SkuCard key={v.sku} v={v} onOpen={setActive} />
          ))}
        </div>
      )}

      {active && <Lightbox v={active} onClose={() => setActive(null)} />}

      <EnrichmentQueue />
    </AppShell>
  );
}
