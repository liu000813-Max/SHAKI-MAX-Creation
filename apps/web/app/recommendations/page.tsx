'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { RouteLoading } from '@/components/RouteLoading';
import { Recommendation, CategoryCode } from '@/lib/types';
import { categoryNames } from '@/lib/data/products';
import { STAGE_LABELS, LAYER_STATS, libraryStatsData } from '@/lib/data/library-view';
import { MATCHING_CONFIG } from '@/lib/config/matching';
import { runEngine } from '@/lib/matching';
import { RecommendationCard } from '@/components/RecommendationCard';
import { buildAnalysisOutput, analysisOutputJson } from '@/lib/output';
import { cn } from '@/lib/utils';
import { localizeProductField } from '@/lib/utils';
import { ArrowLeft, SlidersHorizontal, FileText, Check, GitCompare, ChevronDown, Sparkles, AlertTriangle, Download } from 'lucide-react';

function EmptyClient() {
  const { lang } = useAppState();
  return (
    <AppShell title={t('recommendedProducts', lang)}>
      <div className="text-center py-20 text-muted">
        <p>{t('noData', lang)}</p>
        <Link href="/analyze" className="text-shaki-purple hover:underline mt-2 inline-block">
          {t('newClient', lang)}
        </Link>
      </div>
    </AppShell>
  );
}

/**
 * Deterministic funnel, shown only with `?debug=1`.
 *
 * Hidden from the results screen by the PM's request; kept because "the same input always produces
 * the same five" is a claim that has to be checkable, and a deleted debug view cannot be checked.
 */
function PipelineStrip({
  enrichedCount,
  recall,
  stages,
}: {
  enrichedCount: number;
  recall: { passed: number; recalled: number; cutoff: number };
  /** Every stage the engine ran, in order. See the render below for why this is not optional. */
  stages: { stage: string; input: number; output: number; note?: string }[];
}) {
  const { lang } = useAppState();
  return (
    <section className="bg-white rounded-card border border-shaki-lavender p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-shaki-purple" />
        <h3 className="text-sm font-semibold text-ink">{t('pipelineTitle', lang)}</h3>
        <span className="text-[11px] text-muted">{t('pipelineHint', lang)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {LAYER_STATS.map((l) => (
          <span
            key={l.key}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-shaki-lavender bg-panel text-[11px]"
            title={lang === 'zh' ? l.noteZh : l.noteEn}
          >
            <span className="text-muted">{lang === 'zh' ? l.zh : l.en}</span>
            <span className="text-ink font-semibold tabular-nums">{l.count}</span>
            <span className={cn('tabular-nums', l.eligible > 0 ? 'text-success' : 'text-muted')}>
              · {l.eligible} {t('scoringEligible', lang)}
            </span>
          </span>
        ))}
        {enrichedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-success/30 bg-success/5 text-[11px]">
            <span className="text-success">{lang === 'zh' ? '已补参数' : 'Enriched'}</span>
            <span className="text-ink font-semibold tabular-nums">{enrichedCount}</span>
            <span className="text-success tabular-nums">· {t('scoringEligible', lang)}</span>
          </span>
        )}
        <span className="text-[11px] text-muted ml-1">
          {t('completenessGate', lang)} ≥ {libraryStatsData.gate}%
        </span>
        {/* PRD §18 — the recall boundary, so stage 2's number is auditable rather than hidden.
            Only call it a "cutoff" when something was actually cut: with a pool smaller than the
            recall count every candidate is recalled and the number would imply a filter that never
            ran. */}
        <span className="text-[11px] text-muted tabular-nums">
          ·{' '}
          {recall.recalled < recall.passed
            ? `${t('recallCutoff', lang)} ≥ ${recall.cutoff}`
            : `${t('recallScore', lang)} ${recall.recalled}/${recall.passed} ${
                lang === 'zh' ? '全部通过' : 'all recalled'
              }`}
        </span>
      </div>

      {/* The full funnel, stage by stage.
          `engine.stages` was computed on every run and then thrown away — nothing rendered it, so
          those numbers only ever existed for someone reading the source. `STAGE_LABELS` was imported
          by this file for precisely this purpose and never used, which is how the intent was
          discoverable at all. Each row carries the engine's own `note`, because the interesting part
          is not the count but why a count did not move. */}
      <div className="border-t border-shaki-lavender pt-3">
        <p className="text-[11px] font-medium text-muted mb-2">{t('pipelineTrace', lang)}</p>
        <ul className="space-y-1">
          {stages.map((s) => (
            <li key={s.stage} className="flex items-baseline gap-2 text-[11px]">
              <span className="w-44 shrink-0 truncate text-muted">
                {(STAGE_LABELS[s.stage] ?? { zh: s.stage, en: s.stage })[lang]}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-ink">
                {s.input} → {s.output}
              </span>
              {s.note && <span className="truncate text-muted">{s.note}</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RecommendationsContent() {
  const { lang, getClient, createProposal, enrichedProducts, enrichment } = useAppState();
  const searchParams = useSearchParams();
  const router = useRouter();
  const showPipeline = searchParams.get('debug') === '1';
  const clientId = searchParams.get('id') || '';
  const client = getClient(clientId);

  // Deterministic engine — recomputing here yields exactly what was persisted on analyze.
  // `enrichedProducts()` is the PM-enriched candidate rows; they enter through the same gate.
  const extra = enrichedProducts();
  const extraKey = enrichment.map((e) => e.product_id).join(',');
  const engine = useMemo(
    () => (client ? runEngine(client, lang, extra) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, lang, extraKey]
  );
  const all = engine?.recommendations ?? [];

  const curated = useMemo(() => all.filter((r) => r.curationSlot != null), [all]);
  const others = useMemo(() => all.filter((r) => r.curationSlot == null), [all]);

  const [filterCat, setFilterCat] = useState<string>('all');
  const [showOthers, setShowOthers] = useState(false);
  const [shortlist, setShortlist] = useState<Recommendation[]>([]);
  const [exported, setExported] = useState(false);

  const othersCats = useMemo(
    () => ['all', ...Array.from(new Set(others.map((r) => r.product.primary_category)))],
    [others]
  );
  const filteredOthers = useMemo(
    () => (filterCat === 'all' ? others : others.filter((r) => r.product.primary_category === filterCat)),
    [others, filterCat]
  );

  if (!client || !engine) return <EmptyClient />;

  const isSel = (rec: Recommendation) => shortlist.some((r) => r.product_id === rec.product_id);
  const toggle = (rec: Recommendation) =>
    setShortlist((prev) =>
      prev.some((r) => r.product_id === rec.product_id)
        ? prev.filter((r) => r.product_id !== rec.product_id)
        : [...prev, rec]
    );

  const handleCreate = () => {
    const products = shortlist.length ? shortlist : curated.length ? curated : all.slice(0, 5);
    const proposal = createProposal(clientId, products, 'Product Collection');
    router.push(`/proposal?id=${proposal.id}`);
  };

  /**
   * Download the analysis in PRD §16's shape.
   *
   * A download rather than a clipboard write: the contract exists to be handed to something else
   * (an integration, a ticket, a QA record), and a file survives that trip where a clipboard does
   * not. `analysis_version` in the payload comes from config, so the exported document declares the
   * pipeline version it was produced by.
   */
  const handleExportJson = () => {
    const output = buildAnalysisOutput(client, engine, lang);
    const blob = new Blob([analysisOutputJson(output)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shaki-analysis-${output.client_id}-${output.analysis_version}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
  };

  const topFinal = Math.max(...all.map((r) => r.finalScore ?? r.fitScore), 0);

  return (
    <AppShell title={t('recommendedProducts', lang)}>
      <Link href={`/client-intelligence?id=${client.id}`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-shaki-purple mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t('clientIntelligence', lang)}
      </Link>

      {/* Summary strip */}
      <section className="bg-white rounded-card border border-shaki-lavender p-5 mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">{client.name}</p>
          <h2 className="text-xl font-semibold text-ink">{t('recommendedProducts', lang)}</h2>
          <p className="text-xs text-muted mt-1">
            {all.length} {lang === 'zh' ? '款通过硬性过滤' : 'passed the hard filter'} ·{' '}
            {curated.length} {lang === 'zh' ? '款进入策展 Top 5' : 'curated'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-shaki-purple">{topFinal}</div>
          <div className="text-xs text-muted">{t('finalScore', lang)}</div>
        </div>
      </section>

      {/* PRD §17 fallback. The engine has always computed `limitedMatch`; no component ever read it,
          so the documented safety net did not exist on screen. The threshold is rendered from config
          beside the label rather than baked into the copy, so moving it cannot leave the banner
          quietly stating a stale number. */}
      {engine.noProductsInClientCategories && (
        <section className="mb-5 flex items-start gap-3 p-4 rounded-card border border-warning/40 bg-warning/5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <div>
            <p className="text-sm font-semibold text-ink">{t('noStockBanner', lang)}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{t('noStockBannerHint', lang)}</p>
          </div>
        </section>
      )}

      {engine.limitedMatch && !engine.noProductsInClientCategories && (
        <section className="mb-5 flex items-start gap-3 p-4 rounded-card border border-warning/40 bg-warning/5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <div>
            <p className="text-sm font-semibold text-ink">
              {t('limitedMatchBanner', lang)}
              <span className="ml-1.5 font-normal text-muted tabular-nums">
                {t('fitScore', lang)} {engine.topFit} &lt; {MATCHING_CONFIG.thresholds.fitMinimumFallback}
              </span>
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{t('limitedMatchBannerHint', lang)}</p>
          </div>
        </section>
      )}

      {/*
        The funnel explains how five products were chosen, which is what a curious reviewer wants and
        what a buyer-facing page does not: the PM asked for it gone from the results screen. It stays
        one query flag away (`?debug=1`) so the claim "deterministic, recomputable" can still be checked
        by whoever needs to check it, instead of being deleted.
      */}
      {showPipeline && (
        <PipelineStrip
          enrichedCount={enrichment.length}
          stages={engine.stages}
          recall={{
            passed: engine.stages.find((s) => s.stage === '1_hard_filter')?.output ?? 0,
            recalled: engine.stages.find((s) => s.stage === '2_semantic_recall')?.output ?? 0,
            cutoff: engine.recallCutoff,
          }}
        />
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Left: curated + candidates */}
        <div className="space-y-6">
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-ink">{t('curatedTop5', lang)}</h3>
              <p className="text-[11px] text-muted mt-0.5">{t('curatedTop5Hint', lang)}</p>
            </div>
            {curated.length === 0 ? (
              <div className="bg-white rounded-card border border-shaki-lavender p-10 text-center text-muted">
                {t('noStrongMatches', lang)}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {curated.map((r) => (
                  <RecommendationCard key={r.product_id} rec={r} selected={isSel(r)} onToggle={() => toggle(r)} />
                ))}
              </div>
            )}
          </div>

          {others.length > 0 && (
            <div>
              <button
                onClick={() => setShowOthers((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white rounded-card border border-shaki-lavender hover:border-shaki-purple/40 transition-colors"
              >
                <div className="text-left">
                  <div className="text-sm font-semibold text-ink">
                    {t('moreCandidates', lang)} ({others.length})
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">{t('moreCandidatesHint', lang)}</div>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-muted transition-transform shrink-0', showOthers && 'rotate-180')} />
              </button>

              {showOthers && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <SlidersHorizontal className="w-4 h-4 text-muted" />
                    {othersCats.map((c) => (
                      <button
                        key={c}
                        onClick={() => setFilterCat(c)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-sm border transition-colors',
                          filterCat === c
                            ? 'bg-shaki-purple text-white border-shaki-purple'
                            : 'border-shaki-lavender text-muted hover:text-shaki-purple'
                        )}
                      >
                        {c === 'all' ? t('allCategories', lang) : categoryNames[c as CategoryCode]?.[lang] || c}
                      </button>
                    ))}
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {filteredOthers.map((r) => (
                      <RecommendationCard key={r.product_id} rec={r} selected={isSel(r)} onToggle={() => toggle(r)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: shortlist (320px) */}
        <aside className="bg-white rounded-card border border-shaki-lavender p-5 lg:sticky lg:top-4">
          <h3 className="font-semibold text-ink mb-1">{t('shortlist', lang)}</h3>
          <p className="text-xs text-muted mb-4">{shortlist.length} / 5</p>
          {shortlist.length === 0 ? (
            <p className="text-sm text-muted">
              {lang === 'zh' ? '勾选左侧产品加入候选' : 'Select products on the left to build a shortlist'}
            </p>
          ) : (
            <ul className="space-y-2 mb-4">
              {shortlist.map((r) => (
                <li key={r.product_id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-ink">{localizeProductField(r.product, lang, 'product_name')}</span>
                  <button onClick={() => toggle(r)} className="text-muted hover:text-danger" aria-label={t('removeFromShortlist', lang)}>
                    <Check className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            {shortlist.length >= 2 && (
              <Link
                href={`/compare?clientId=${client.id}&ids=${shortlist.map((r) => r.product_id).join(',')}`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-shaki-purple text-shaki-purple text-sm font-medium rounded-btn hover:bg-shaki-soft"
              >
                <GitCompare className="w-4 h-4" />
                {t('compareFromShortlist', lang)}
              </Link>
            )}
            <button
              onClick={handleCreate}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-shaki-purple text-white text-sm font-medium rounded-btn hover:bg-shaki-purple2"
            >
              <FileText className="w-4 h-4" />
              {t('createProposal', lang)}
            </button>
            {/* PRD §16 output contract. Exports the whole analysis, not the shortlist, because the
                contract describes the pipeline's result rather than one rep's selection. */}
            <button
              onClick={handleExportJson}
              title={t('exportAnalysisHint', lang)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-shaki-lavender text-muted text-sm font-medium rounded-btn hover:bg-panel"
            >
              {exported ? <Check className="w-4 h-4 text-success" /> : <Download className="w-4 h-4" />}
              {exported ? t('exportedJson', lang) : t('exportAnalysisJson', lang)}
            </button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <RecommendationsContent />
    </Suspense>
  );
}
