'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t, enrichFieldLabel } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { RouteLoading } from '@/components/RouteLoading';
import { candidateLayer } from '@/lib/data/library';
import { libraryStatsData } from '@/lib/data/library-view';
import {
  ENRICH_FIELDS,
  ENRICH_ENUMS,
  applyBulkRow,
  completenessGate,
  completenessOf,
  emptyFields,
  parseBulkImport,
  seedFromCandidate,
  toProduct,
  type EnrichFieldKey,
  type EnrichFieldSpec,
} from '@/lib/data/enrichment';
import type { EnrichmentFields, LibraryCandidate } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Wrench,
  Search,
  Database,
  Upload,
  CheckCircle2,
  PauseCircle,
  ChevronDown,
  AlertTriangle,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';

const GATE = completenessGate();

function Meter({ value, label }: { value: number; label?: string }) {
  const ok = value >= GATE;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-shaki-lavender overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', ok ? 'bg-success' : 'bg-warning')}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className={cn('text-[11px] tabular-nums font-medium', ok ? 'text-success' : 'text-warning')}>{value}%</span>
      {label && <span className="text-[11px] text-muted">{label}</span>}
    </div>
  );
}

/** One form control per field kind. */
function FieldControl({
  spec,
  fields,
  setFields,
  lang,
  filledFromCrawl,
}: {
  spec: EnrichFieldSpec;
  fields: EnrichmentFields;
  setFields: (f: EnrichmentFields) => void;
  lang: 'zh' | 'en';
  filledFromCrawl: boolean;
}) {
  const value = fields[spec.key];
  const set = (v: unknown) => setFields({ ...fields, [spec.key]: v } as EnrichmentFields);
  const base =
    'w-full px-3 py-2 rounded-btn border border-shaki-lavender bg-white text-sm text-ink focus:outline-none focus:border-shaki-purple';

  if (spec.kind === 'enum') {
    return (
      <select value={String(value)} onChange={(e) => set(e.target.value)} className={base}>
        <option value="">—</option>
        {spec.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (spec.kind === 'multi') {
    const arr = (value as string[]) || [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {spec.options?.map((o) => {
          const on = arr.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => set(on ? arr.filter((x) => x !== o) : [...arr, o])}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] border transition-colors',
                on ? 'bg-shaki-purple text-white border-shaki-purple' : 'border-shaki-lavender text-muted hover:text-shaki-purple'
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  if (spec.kind === 'bool') {
    return (
      <button
        type="button"
        onClick={() => set(!value)}
        className={cn(
          'px-3 py-2 rounded-btn text-sm border transition-colors',
          value ? 'bg-shaki-purple text-white border-shaki-purple' : 'border-shaki-lavender text-muted hover:text-shaki-purple'
        )}
      >
        {value ? (lang === 'zh' ? '可' : 'Yes') : lang === 'zh' ? '否' : 'No'}
      </button>
    );
  }

  return (
    <input
      value={String(value ?? '')}
      onChange={(e) => set(e.target.value)}
      placeholder={spec.placeholder?.[lang]}
      className={cn(base, filledFromCrawl && 'border-success/40 bg-success/5')}
    />
  );
}

function EnrichmentContent() {
  const { lang, enrichment, saveEnrichment, removeEnrichment } = useAppState();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [fields, setFields] = useState<EnrichmentFields>(emptyFields());
  const [savedFlash, setSavedFlash] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, LibraryCandidate>();
    for (const c of candidateLayer) {
      m.set(c.product_id, c);
      m.set(c.sku, c);
    }
    return m;
  }, []);

  // Ranked by how close they already are to the gate — the cheapest rows to promote first.
  const ranked = useMemo(
    () => [...candidateLayer].sort((a, b) => b.completeness - a.completeness || a.product_id.localeCompare(b.product_id)),
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? ranked.filter(
          (c) =>
            c.sku.toLowerCase().includes(q) ||
            (c.name_en || '').toLowerCase().includes(q) ||
            (c.name_cn || '').toLowerCase().includes(q) ||
            c.product_id.toLowerCase().includes(q)
        )
      : ranked;
    return list.slice(0, 120);
  }, [ranked, query]);

  const selected = selectedId ? byId.get(selectedId) : undefined;

  const loadInto = (c: LibraryCandidate) => {
    setSelectedId(c.product_id);
    const existing = enrichment.find((e) => e.product_id === c.product_id);
    setFields(existing ? existing.fields : seedFromCandidate(c));
  };

  // Deep-link support: /enrichment?id=SHAKI-XXX (also accepts a crawled AUTO-… id from the queue).
  const deepLink = searchParams.get('id') || '';
  useEffect(() => {
    if (!deepLink) return;
    const c = byId.get(deepLink);
    if (c) loadInto(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink, byId]);

  const liveCompleteness = selected ? completenessOf(selected, fields) : 0;
  // The only thing that still keeps a hand-filled row out of the pool is a missing category: without
  // one it cannot be matched to any buyer's categories, so recommending it would be noise.
  const hasCategory = Boolean((fields.primary_category || selected?.inferred_category || '').trim());
  const missingRequired = ENRICH_FIELDS.filter((f) => {
    if (!f.required) return false;
    const v = fields[f.key];
    return Array.isArray(v) ? v.length === 0 : !v;
  });

  const handleSave = () => {
    if (!selected || missingRequired.length) return;
    saveEnrichment({
      product_id: selected.product_id,
      fields,
      product: toProduct(selected, fields),
      updatedAt: new Date().toISOString(),
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const poolSize = libraryStatsData.eligibleTotal + enrichment.length;

  return (
    <AppShell title={t('enrichmentWorkbench', lang)}>
      {/* Pool strip */}
      <section className="bg-white rounded-card border border-shaki-lavender p-5 mb-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
              <Wrench className="w-5 h-5 text-shaki-purple" />
              {t('enrichmentWorkbench', lang)}
            </h2>
            <p className="text-xs text-muted mt-1 max-w-[620px] leading-relaxed">{t('enrichmentIntro', lang)}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-shaki-purple tabular-nums">{poolSize}</div>
            <div className="text-xs text-muted">
              {t('scoringPool', lang)} · {t('completenessGate', lang)} ≥ {GATE}%
            </div>
            <div className="text-[11px] text-muted mt-0.5 tabular-nums">
              {libraryStatsData.eligibleTotal} {t('layerBrand', lang)} + {enrichment.length} {lang === 'zh' ? '补入' : 'enriched'}
            </div>
          </div>
        </div>
      </section>

      {/* Parked-layer notice. The workbench below still works, but the default answer is "you do
          not need to fill these in" — measured, not assumed. A tool that looks like a treadmill
          is worse than no tool. */}
      <section className="bg-white rounded-card border border-shaki-lavender p-5 mb-5">
        <div className="flex items-start gap-3">
          <PauseCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{t('candidateParkedTitle', lang)}</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed max-w-[720px]">
              {t('candidateParkedBody', lang).replace('{n}', String(candidateLayer.length))}
            </p>
            <p className="text-xs text-ink mt-2">
              <span className="text-muted">{t('candidateParkedPool', lang)}: </span>
              <span className="font-medium">
                {t('candidateParkedOnly', lang).replace('{n}', String(libraryStatsData.eligibleTotal))}
              </span>
            </p>
          </div>
        </div>
      </section>

      <details className="group mb-5">
        <summary className="cursor-pointer list-none text-sm font-medium text-shaki-purple hover:underline flex items-center gap-2">
          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
          {t('manualFillOptional', lang)}
        </summary>
        <p className="text-[11px] text-muted mt-2 mb-3 max-w-[720px] leading-relaxed">
          {t('manualFillHint', lang).replace('{gate}', String(GATE))}
        </p>
        <BulkImportPanel />

      <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* Left: crawled rows, richest first */}
        <aside className="bg-white rounded-card border border-shaki-lavender p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              {t('candidateList', lang)}
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-panel text-muted border border-shaki-lavender">
                {t('candidateNotScoring', lang)}
              </span>
            </h3>
            <span className="text-[11px] text-muted tabular-nums">{candidateLayer.length}</span>
          </div>
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder', lang)}
              className="w-full pl-9 pr-3 py-2 rounded-btn border border-shaki-lavender text-sm text-ink focus:outline-none focus:border-shaki-purple"
            />
          </div>
          <ul className="max-h-[560px] overflow-y-auto -mx-1 px-1 space-y-1">
            {filtered.map((c) => {
              const enriched = enrichment.find((e) => e.product_id === c.product_id);
              const pct = enriched ? enriched.product.completeness ?? 0 : c.completeness;
              return (
                <li key={c.product_id}>
                  <button
                    onClick={() => loadInto(c)}
                    className={cn(
                      'w-full text-left px-2.5 py-2 rounded-lg border transition-colors',
                      selectedId === c.product_id
                        ? 'border-shaki-purple bg-shaki-soft'
                        : 'border-transparent hover:bg-panel'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-muted truncate flex-1">{c.sku}</span>
                      {enriched && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1 flex-1 rounded-full bg-shaki-lavender overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', pct >= GATE ? 'bg-success' : 'bg-shaki-purple/40')}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted tabular-nums">{pct}%</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Right: editor */}
        <div className="bg-white rounded-card border border-shaki-lavender p-5">
          {!selected ? (
            <div className="py-20 text-center text-muted text-sm">
              <Database className="w-6 h-6 mx-auto mb-2 opacity-40" />
              {t('pickRow', lang)}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs text-muted font-mono">{selected.sku}</p>
                  <h3 className="font-semibold text-ink truncate">{selected.name_en || selected.sku}</h3>
                  <p className="text-[11px] text-muted mt-0.5">
                    {selected.inferred_category || 'Unmapped'}
                    {selected.target_gender ? ` · ${selected.target_gender}` : ''}
                    {selected.main_material ? ` · ${selected.main_material}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <Meter value={liveCompleteness} />
                  <p className="text-[11px] text-muted mt-1">
                    {liveCompleteness >= GATE ? (
                      <span className="text-success font-medium">{t('promotedNow', lang)}</span>
                    ) : hasCategory ? (
                      <span className="text-warning font-medium">{t('pooledAnyway', lang)}</span>
                    ) : (
                      <span className="text-muted">{t('needCategory', lang)}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-x-5 gap-y-4">
                {ENRICH_FIELDS.map((spec) => {
                  const crawlValue = (selected as unknown as Record<string, unknown>)[spec.key];
                  const fromCrawl = Boolean(crawlValue) && !enrichment.find((e) => e.product_id === selected.product_id);
                  return (
                    <div key={spec.key} className={spec.kind === 'multi' ? 'md:col-span-2' : ''}>
                      <label className="flex items-center gap-2 text-xs font-medium text-ink mb-1.5">
                        {enrichFieldLabel(spec.key, lang)}
                        {spec.required ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-shaki-soft text-shaki-purple">{t('requiredField', lang)}</span>
                        ) : (
                          <span className="text-[10px] text-muted">{t('optionalField', lang)}</span>
                        )}
                        {fromCrawl && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success">{t('alreadyFilled', lang)}</span>
                        )}
                      </label>
                      <FieldControl spec={spec} fields={fields} setFields={setFields} lang={lang} filledFromCrawl={fromCrawl} />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-shaki-lavender flex-wrap">
                <div className="text-[11px] text-muted">
                  {missingRequired.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {missingRequired.map((f) => enrichFieldLabel(f.key, lang)).join(' · ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {enrichment.some((e) => e.product_id === selected.product_id) && (
                    <>
                      <Link
                        href="/recommendations"
                        className="inline-flex items-center gap-1 px-3 py-2 text-sm text-shaki-purple hover:underline"
                      >
                        {lang === 'zh' ? '去匹配' : 'Go match'}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => removeEnrichment(selected.product_id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-btn border border-shaki-lavender text-sm text-muted hover:text-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('removeFromPool', lang)}
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={missingRequired.length > 0}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-4 py-2 rounded-btn text-sm font-medium transition-colors',
                      missingRequired.length > 0
                        ? 'bg-shaki-lavender text-muted cursor-not-allowed'
                        : 'bg-shaki-purple text-white hover:bg-shaki-purple2'
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {savedFlash ? t('savedToPool', lang) : t('saveToPool', lang)}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </details>
    </AppShell>
  );
}

/** Paste a block copied from Excel; header row may use Chinese or English field names. */
function BulkImportPanel() {
  const { lang, enrichment, saveEnrichment } = useAppState();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReturnType<typeof parseBulkImport> | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, LibraryCandidate>();
    for (const c of candidateLayer) {
      m.set(c.sku, c);
      m.set(c.product_id, c);
    }
    return m;
  }, []);

  const preview = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => {
      const c = byKey.get(r.key);
      if (!c) return { key: r.key, candidate: undefined, pct: 0, ok: false };
      const base = enrichment.find((e) => e.product_id === c.product_id)?.fields ?? seedFromCandidate(c);
      const merged = applyBulkRow(base, r.values);
      const pct = completenessOf(c, merged);
      return { key: r.key, candidate: c, pct, ok: pct >= GATE && Boolean(merged.primary_category) };
    });
  }, [result, byKey, enrichment]);

  const okRows = preview.filter((p) => p.ok);

  const commit = () => {
    let n = 0;
    for (const p of okRows) {
      if (!p.candidate) continue;
      const row = result!.rows.find((r) => r.key === p.key)!;
      const base = enrichment.find((e) => e.product_id === p.candidate.product_id)?.fields ?? seedFromCandidate(p.candidate);
      const merged = applyBulkRow(base, row.values);
      saveEnrichment({
        product_id: p.candidate.product_id,
        fields: merged,
        product: toProduct(p.candidate, merged),
        updatedAt: new Date().toISOString(),
      });
      n += 1;
    }
    setImported(n);
    setResult(null);
    setText('');
  };

  return (
    <section className="bg-white rounded-card border border-shaki-lavender mb-5 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2 text-left">
          <Upload className="w-4 h-4 text-shaki-purple" />
          <div>
            <div className="text-sm font-semibold text-ink">{t('bulkImport', lang)}</div>
            <div className="text-[11px] text-muted mt-0.5 max-w-[640px]">{t('bulkHint', lang)}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {imported !== null && (
            <span className="text-[11px] text-success">
              {t('bulkDone', lang)} {imported}
            </span>
          )}
          <ChevronDown className={cn('w-4 h-4 text-muted transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            // Sample key is deliberately fake: a real crawled SKU here is easy to leave in place
            // and would write to a live row. Column names below are the real accepted vocabulary.
            placeholder={
              lang === 'zh'
                ? 'SKU\t一级品类\t价格带\t目标市场\nSKU-0000\tCOUPLES\tMid-Premium\tUS, EU'
                : 'SKU\tprimary_category\tprice_level\ttarget_market\nSKU-0000\tCOUPLES\tMid-Premium\tUS, EU'
            }
            className="w-full px-3 py-2 rounded-btn border border-shaki-lavender text-xs font-mono text-ink focus:outline-none focus:border-shaki-purple"
          />
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={() => {
                setImported(null);
                setResult(parseBulkImport(text));
              }}
              className="px-3 py-2 rounded-btn border border-shaki-purple text-shaki-purple text-sm font-medium hover:bg-shaki-soft"
            >
              {t('bulkPreview', lang)}
            </button>
            {result && okRows.length > 0 && (
              <button onClick={commit} className="px-3 py-2 rounded-btn bg-shaki-purple text-white text-sm font-medium hover:bg-shaki-purple2">
                {t('bulkCommit', lang)} {okRows.length}
              </button>
            )}
            {result && (
              <span className="text-[11px] text-muted">
                {result.rows.length} {t('bulkRows', lang)}
                {preview.length - okRows.length > 0 && ` · ${preview.length - okRows.length} ${t('bulkSkipped', lang)}`}
              </span>
            )}
          </div>

          {result?.errors.length ? (
            <ul className="mt-2 space-y-0.5">
              {result.errors.map((e) => (
                <li key={e} className="text-[11px] text-warning">
                  {e === 'EMPTY' ? t('parseEmpty', lang) : e}
                </li>
              ))}
            </ul>
          ) : null}

          {preview.length > 0 && (
            <div className="mt-3 max-h-64 overflow-y-auto border border-shaki-lavender rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-panel">
                  <tr className="text-left text-muted">
                    <th className="py-1.5 px-3 font-medium">SKU</th>
                    <th className="py-1.5 px-3 font-medium">{t('completePct', lang)}</th>
                    <th className="py-1.5 px-3 font-medium">{t('status', lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.key} className="border-t border-shaki-lavender/60">
                      <td className="py-1.5 px-3 font-mono text-[11px]">{p.key}</td>
                      <td className="py-1.5 px-3 tabular-nums text-muted">{p.pct}%</td>
                      <td className="py-1.5 px-3">
                        {p.ok ? (
                          <span className="text-success">{t('promotedNow', lang)}</span>
                        ) : p.candidate ? (
                          <span className="text-warning">{t('pooledAnyway', lang)}</span>
                        ) : (
                          <span className="text-muted">{lang === 'zh' ? '未找到该 SKU' : 'SKU not found'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function EnrichmentPage() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <EnrichmentContent />
    </Suspense>
  );
}
