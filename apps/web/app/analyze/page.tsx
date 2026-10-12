'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/components/ClientProvider';
import { t, businessTypeLabel, goalLabel } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { SiteEvidenceCard } from '@/components/SiteEvidenceCard';
import { CRAWL_CONFIG } from '@/lib/config/crawl';
import { fetchSiteFacts, type CrawlOutcome } from '@/lib/siteFacts';
import { BusinessType, ClientInput } from '@/lib/types';
import { Globe, Link2, Hash, Building2, Target, ChevronDown, ChevronUp, Loader2, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';

const markets = [
  'United States', 'United Kingdom', 'Europe', 'Australia',
  'Southeast Asia', 'Middle East', 'Japan', 'Korea', 'Other',
];

const businessTypes: BusinessType[] = [
  'Brand', 'Distributor', 'Retailer', 'Wholesaler', 'E-commerce',
  'Amazon Seller', 'Chain Store', 'Boutique', 'OEM/ODM Buyer',
];

const goals = ['New Product', 'Bestseller', 'Premium', 'High Margin', 'Product Line Expansion', 'OEM/ODM'];

/**
 * Progress steps, named after what the pipeline actually does.
 *
 * These previously described analysing the client's website and social accounts while the app made
 * no network calls at all — steps announcing work that never happened. Each label below maps to a
 * real stage (fetch → parse → recall → gate → score → curate). The fetch step is only prepended
 * when there is a website to fetch *and* a fetcher endpoint was baked into this build, so the walk
 * cannot promise a request that will not be made.
 */
const analysisSteps = [
  { zh: '解析你填写的主营品类', en: 'Parsing the categories you entered', key: 'parse' },
  { zh: '提取品牌定位关键词', en: 'Extracting positioning keywords', key: 'keywords' },
  { zh: '推断目标市场与价格带', en: 'Inferring target market & price corridor', key: 'infer' },
  { zh: '过滤可评分货盘', en: 'Filtering the scorable catalog', key: 'gate' },
  { zh: '计算六维适配分与最终分', en: 'Scoring six fit dimensions', key: 'score' },
  { zh: '策展 Top 5 并生成推荐理由', en: 'Curating Top 5 with reasons', key: 'curate' },
];

/**
 * The step list the panel walks. The fetch step exists only when a fetch will actually be attempted,
 * so it can never announce a request this build is incapable of making.
 */
function stepList(website: string, crawlEnabled: boolean, lang: 'zh' | 'en') {
  if (!website.trim() || !crawlEnabled) return analysisSteps;
  const label = t('crawlStep', lang);
  return [{ zh: label, en: label, key: 'crawl' }, ...analysisSteps];
}

/**
 * One-line account of what the fetcher did.
 *
 * Built in code rather than assembled from dictionary fragments because `t()` has no interpolation
 * and the line carries live numbers (HTTP status, character count). Both languages are spelled out
 * here, which is the same pattern the rest of this page uses for copy with values in it.
 */
function crawlStatusLine(crawl: CrawlOutcome | null, website: string, lang: 'zh' | 'en'): string {
  if (!crawl) return '';
  if (crawl.facts) {
    const f = crawl.facts;
    const redirected = f.finalUrl && f.finalUrl.replace(/\/+$/, '') !== website.trim().replace(/\/+$/, '') ? ` · ${f.finalUrl}` : '';
    return lang === 'zh'
      ? `官网已抓取 · HTTP ${f.httpStatus} · 正文 ${f.textChars} 字${redirected}`
      : `Website fetched · HTTP ${f.httpStatus} · ${f.textChars} chars${redirected}`;
  }
  if (crawl.errorCode === 'NO_URL') {
    return lang === 'zh' ? '未填写官网，仅基于你填写的信息。' : 'No website given — using only what you entered.';
  }
  // SERVICE_BUSY is about our own service, not about the client's site. Saying "the website could
  // not be fetched" here would blame their website for our cold start.
  if (crawl.errorCode === 'SERVICE_BUSY') {
    return lang === 'zh'
      ? '抓取服务暂时不可用（已自动重试 3 次）— 已回退为仅基于你填写的信息，置信度不会到「高」。'
      : 'The fetcher is temporarily unavailable (3 attempts) — fell back to the information you entered only, so confidence will not reach High.';
  }
  const code = crawl.errorCode ? ` (${crawl.errorCode})` : '';
  return lang === 'zh'
    ? `官网抓取失败${code} — 已回退为仅基于你填写的信息，置信度不会到「高」。`
    : `Website could not be fetched${code} — fell back to the information you entered only, so confidence will not reach High.`;
}

const aiAnalyzes = [
  { zh: '你填写的主营品类与品牌定位', en: 'The categories & positioning you enter' },
  { zh: '目标市场与价格带偏好', en: 'Target market & price corridor' },
  { zh: '与 SHAKI 货盘的结构缺口', en: 'Gaps against the SHAKI catalog' },
  { zh: '视觉风格与受众匹配', en: 'Visual style & audience match' },
  { zh: '可评分货盘上的六维适配', en: 'Six-dimension fit over the scorable catalog' },
];

export default function NewClientPage() {
  const { lang, addClient } = useAppState();
  const router = useRouter();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [urlError, setUrlError] = useState(false);
  const [crawl, setCrawl] = useState<CrawlOutcome | null>(null);
  const [form, setForm] = useState<ClientInput>({
    categories: '',
    website: '',
    socialLinks: [''],
    market: '',
    businessType: '',
    goal: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.website && !/^https?:\/\//.test(form.website)) {
      setUrlError(true);
      return;
    }
    setUrlError(false);
    setLoading(true);
    setCrawl(null);

    // Fetch first, and let the panel show what happened — a failure has to be visible, because a
    // silent fallback would leave the rep believing the site was read when it was not.
    let outcome: CrawlOutcome = { facts: null, errorCode: 'NO_URL' };
    if (form.website.trim()) {
      outcome = CRAWL_CONFIG.enabled
        ? await fetchSiteFacts(form.website)
        : { facts: null, errorCode: 'DISABLED' };
      setCrawl(outcome);
    }

    const steps = stepList(form.website, CRAWL_CONFIG.enabled, lang);
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    const client = addClient(form, outcome.facts);
    router.push(`/client-intelligence?id=${client.id}`);
  };

  const updateSocial = (index: number, value: string) => {
    const next = [...form.socialLinks];
    next[index] = value;
    setForm({ ...form, socialLinks: next });
  };
  const addSocial = () => setForm({ ...form, socialLinks: [...form.socialLinks, ''] });

  const crawlStatus = crawlStatusLine(crawl, form.website, lang);

  if (loading) {
    return (
      <AppShell title={t('newClient', lang)}>
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-card border border-shaki-lavender shadow-sm p-10">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-shaki-soft flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-shaki-purple animate-spin" />
            </div>
            <h2 className="text-2xl font-semibold text-ink mb-2 text-center">{t('analysisStepsTitle', lang)}</h2>
            <p className="text-muted text-center mb-3">
              {lang === 'zh' ? '按确定性规则解析并匹配 SHAKI 货盘' : 'Parsing and matching the SHAKI catalog with deterministic rules'}
            </p>
            <p className="text-[11px] text-warning text-center mb-4 flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {CRAWL_CONFIG.enabled ? t('analysisScopeNoteLive', lang) : t('analysisScopeNote', lang)}
            </p>
            {crawl && crawlStatus && (
              <div
                className={`mb-8 max-w-md mx-auto rounded-lg px-3 py-2 text-[11px] flex items-start gap-1.5 ${
                  crawl.facts ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                }`}
              >
                {crawl.facts ? (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                )}
                <span>{crawlStatus}</span>
              </div>
            )}
            {/*
              Credibility for the analysis: the rep sees what was actually read, not a claim that
              the site was read. Deliberately a data card, not a screenshot — see SiteEvidenceCard.
            */}
            <div className="max-w-md mx-auto">
              <SiteEvidenceCard facts={crawl?.facts ?? null} website={form.website} lang={lang} />
            </div>

            <div className="space-y-3 text-left max-w-md mx-auto">
              {stepList(form.website, CRAWL_CONFIG.enabled, lang).map((step, idx) => (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    idx <= currentStep ? 'bg-shaki-soft text-ink' : 'text-gray-400'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      idx < currentStep
                        ? 'bg-shaki-purple text-white'
                        : idx === currentStep
                          ? 'border-2 border-shaki-purple text-shaki-purple'
                          : 'border border-gray-300'
                    }`}
                  >
                    {idx < currentStep ? '✓' : ''}
                  </div>
                  <span className="text-sm font-medium">{lang === 'zh' ? step.zh : step.en}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t('newClient', lang)}>
      {/* The 720px track is a floor, not a floor *and* a ceiling: at lg (1024px) the shell leaves
          688px, so a hard 720px track pushed the form off the right edge. `minmax(0,720px)` keeps
          the intended width when there is room and lets it shrink when there is not. */}
      <div className="grid lg:grid-cols-[minmax(0,720px)_1fr] gap-6 items-start">
        {/* Left: input form (720px) */}
        <form onSubmit={handleSubmit} className="bg-white rounded-card border border-shaki-lavender shadow-sm p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              <span className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-shaki-purple" />
                {t('mainCategories', lang)}
              </span>
            </label>
            <input
              required
              type="text"
              value={form.categories}
              onChange={(e) => setForm({ ...form, categories: e.target.value })}
              placeholder={t('mainCategoriesPlaceholder', lang)}
              className="w-full px-4 py-3 rounded-btn border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              <span className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-shaki-purple" />
                {t('clientWebsite', lang)}
              </span>
            </label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder={t('clientWebsitePlaceholder', lang)}
              className={`w-full px-4 py-3 rounded-btn border focus:ring-2 focus:ring-shaki-purple/20 outline-none transition-all ${
                urlError ? 'border-danger' : 'border-gray-200 focus:border-shaki-purple'
              }`}
            />
            {urlError && <p className="text-xs text-danger mt-1">{t('enterValidUrl', lang)}</p>}
            {!form.website && <p className="text-xs text-muted mt-1">{t('enterWebsiteToBegin', lang)}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-shaki-purple" />
                {t('socialMedia', lang)}
              </span>
            </label>
            {form.socialLinks.map((link, idx) => (
              <input
                key={idx}
                type="url"
                value={link}
                onChange={(e) => updateSocial(idx, e.target.value)}
                placeholder={t('socialMediaPlaceholder', lang)}
                className="w-full px-4 py-3 rounded-btn border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none mb-2"
              />
            ))}
            <button type="button" onClick={addSocial} className="text-sm text-shaki-purple hover:underline">
              + {lang === 'zh' ? '添加更多' : 'Add more'}
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-shaki-purple hover:underline"
            >
              {t('advancedOptions', lang)}
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-5 pt-2 border-t border-shaki-lavender">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  <span className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-shaki-purple" />
                    {t('targetMarket', lang)}
                  </span>
                </label>
                <select
                  value={form.market}
                  onChange={(e) => setForm({ ...form, market: e.target.value })}
                  className="w-full px-4 py-3 rounded-btn border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none bg-white"
                >
                  <option value="">{lang === 'zh' ? '请选择' : 'Select'}</option>
                  {markets.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  <span className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-shaki-purple" />
                    {t('customerType', lang)}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {businessTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm({ ...form, businessType: type })}
                      className={`px-3 py-1.5 rounded-btn text-sm border transition-colors ${
                        form.businessType === type
                          ? 'bg-shaki-purple text-white border-shaki-purple'
                          : 'border-gray-200 text-muted hover:border-shaki-purple'
                      }`}
                    >
                      {businessTypeLabel(type, lang)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  <span className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-shaki-purple" />
                    {t('recommendationGoal', lang)}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {goals.map((goal) => (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => setForm({ ...form, goal })}
                      className={`px-3 py-1.5 rounded-btn text-sm border transition-colors ${
                        form.goal === goal
                          ? 'bg-shaki-purple text-white border-shaki-purple'
                          : 'border-gray-200 text-muted hover:border-shaki-purple'
                      }`}
                    >
                      {goalLabel(goal, lang)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 py-3.5 bg-shaki-purple text-white font-semibold rounded-btn hover:bg-shaki-purple2 transition-colors shadow-lg shadow-shaki-purple/20"
            >
              {t('startAnalyzing', lang)}
            </button>
            <button
              type="button"
              onClick={() => setForm({ categories: '', website: '', socialLinks: [''], market: '', businessType: '', goal: '' })}
              className="px-4 py-3.5 border border-gray-200 text-muted rounded-btn hover:bg-shaki-soft"
            >
              {t('clear', lang)}
            </button>
          </div>
        </form>

        {/* Right: "What AI will analyze" (360px) */}
        <aside className="bg-panel rounded-card border border-shaki-lavender p-6 lg:sticky lg:top-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-shaki-purple" />
            <h3 className="font-semibold text-ink">{t('whatAiAnalyzes', lang)}</h3>
          </div>
          <ul className="space-y-3">
            {aiAnalyzes.map((a) => (
              <li key={a.en} className="flex items-start gap-2 text-sm text-muted">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                {lang === 'zh' ? a.zh : a.en}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-4">
            {CRAWL_CONFIG.enabled
              ? t('analysisScopeLive', lang)
              : lang === 'zh'
                ? '分析只基于你填写的这些信息：平台不会抓取客户官网或社媒。'
                : 'The analysis uses only what you enter here: the platform does not fetch the client website or social accounts.'}
          </p>
          <p className="text-[11px] text-warning mt-3 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
            {CRAWL_CONFIG.enabled ? t('analysisScopeNoteLive', lang) : t('analysisScopeNote', lang)}
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
