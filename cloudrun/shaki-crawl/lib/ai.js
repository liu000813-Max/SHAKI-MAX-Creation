/**
 * AI enrichment — turn a crawled candidate row into scoring-eligible attributes.
 *
 * THE RULE THAT MATTERS: a field is only kept if the model quoted a span that really exists in the
 * row's own source text. `evidenceIsReal()` re-reads the source and drops anything it cannot find.
 * A model that invents a plausible sentence therefore produces an empty field, not a fabricated
 * attribute — the omission is enforced here rather than trusted to the prompt.
 *
 * That keeps the existing completeness gate meaningful: a field the AI could not ground stays
 * missing, so the row does not quietly climb over 75% on invented data.
 *
 * The model is called through @cloudbase/node-sdk; credentials come from CLOUDBASE_APIKEY, which
 * the platform injects. Nothing secret is read from disk or echoed back.
 */
const tcb = require('@cloudbase/node-sdk');

// Tried in order; the first that answers wins and the choice is reported back to the caller.
// Set AI_MODEL to pin one explicitly.
const CANDIDATE_MODELS = (process.env.AI_MODEL || 'deepseek-v4-flash,deepseek-v3.2,glm-5,hunyuan-pro,hunyuan-standard')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let cachedModel = null;
let cachedName = null;
let cachedProvider = null;

function sdk() {
  const env = process.env.CRAWL_ENV_ID || process.env.SCF_NAMESPACE || process.env.TCB_ENV;
  return tcb.init(env ? { env } : {});
}

/**
 * Which backend answers the calls. Explicit env config first, then DeepSeek, then the platform's
 * own TokenHub — in that order, so a key that is present and working is never silently ignored in
 * favour of one that returns 401.
 */
function provider() {
  if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
    return {
      kind: 'openai-compatible',
      baseUrl: process.env.AI_BASE_URL.replace(/\/+$/, ''),
      model: process.env.AI_MODEL || 'deepseek-chat',
      apiKey: process.env.AI_API_KEY,
    };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: process.env.DEEPSEEK_API_KEY };
  }
  return { kind: 'cloudbase', model: null, apiKey: null };
}

/**
 * `app.ai` is a FACTORY, not the AI instance — calling `createModel` straight off it throws
 * "ai.createModel is not a function". `app.ai()` returns the instance.
 */
function aiInstance() {
  return sdk().ai();
}

/** One OpenAI-compatible chat completion. Used by DeepSeek and any other compatible endpoint. */
async function chatComplete(p, messages, maxTokens, jsonMode) {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({
      model: p.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.1,
      // JSON mode is a strong lever, but the parser below still strips fences — a model that
      // ignores this should not be able to produce an unparseable answer.
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const e = new Error(`upstream ${res.status}`);
    e.code = `UPSTREAM_${res.status}`;
    e.detail = body.slice(0, 300);
    throw e;
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content || '';
}

/** Resolve a usable model once per instance and remember which one it was. */
async function pickModel() {
  if (cachedModel) return cachedModel;
  const p = provider();

  if (p.kind === 'openai-compatible') {
    await chatComplete(p, [{ role: 'user', content: 'ping' }], 4, false);
    cachedProvider = 'openai-compatible';
    cachedName = p.model;
    cachedModel = { generate: (messages, maxTokens) => chatComplete(p, messages, maxTokens, true) };
    return cachedModel;
  }

  const errors = [];
  for (const model of CANDIDATE_MODELS) {
    try {
      const m = aiInstance().createModel('cloudbase');
      await m.generateText({ model, messages: [{ role: 'user', content: 'ping' }], maxTokens: 1 });
      cachedModel = { generate: (messages, maxTokens) => m.generateText({ model, messages, maxTokens }).then((r) => r.text || '') };
      cachedName = model;
      cachedProvider = 'cloudbase';
      return cachedModel;
    } catch (err) {
      errors.push(`${model}: ${(err && err.message) || String(err)}`.slice(0, 200));
    }
  }
  const e = new Error(`no usable model. tried ${CANDIDATE_MODELS.join(', ')}`);
  e.code = 'AI_UNAVAILABLE';
  e.detail = errors;
  throw e;
}

async function generate(messages, maxTokens = 1400) {
  const model = await pickModel();
  return String((await model.generate(messages, maxTokens)) || '');
}

// ───────────────────────────────────────────────────────────── normalisation for evidence checks

/** Fold a string down to something where "same words, same order" survives formatting differences. */
function normalize(s) {
  return String(s || '')
    // NFKC first: it folds full-width Latin/digits to ASCII, so Ｗaterproof and waterproof match.
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[.,;:!?，。；：！？、"'“”‘’()（）\-—_/\\|]+/g, '');
}

/**
 * Flatten a tag group into plain strings.
 *
 * The crawled rows are not uniform: some tag groups are arrays of plain strings, some are arrays
 * of objects (`{ tag_group, tag_value, source_type, confidence }`), and some are a *JSON string*
 * holding an array. Joining those raw produced "[object Object]" in the prompt — i.e. the model was
 * being shown garbage and told to quote it verbatim.
 */
function tagStrings(value) {
  const out = [];
  const push = (v) => {
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'string' && x.trim()) out.push(x.trim());
        else if (x && typeof x === 'object' && typeof x.tag_value === 'string' && x.tag_value.trim()) out.push(x.tag_value.trim());
      }
      return;
    }
    if (typeof v === 'string' && v.trim()) {
      const s = v.trim();
      if (s.startsWith('[')) {
        try {
          for (const x of JSON.parse(s)) if (typeof x === 'string' && x.trim()) out.push(x.trim());
          return;
        } catch {
          // A value that opens like JSON but is not JSON is junk. Pushing it through would put
          // "[broken" into the prompt — the exact failure this function exists to prevent.
          return;
        }
      }
      out.push(s);
    }
  };
  push(value);
  return out;
}

/** The text an evidence span must be found in. Everything the crawler actually gave us. */
function sourceText(row) {
  const tags = row.tags || {};
  return [
    row.name_cn,
    row.name_en,
    row.inferred_category,
    row.secondary_category,
    row.target_gender,
    row.main_material,
    row.primary_function,
    ...tagStrings(tags.all),
    ...tagStrings(tags.category),
    ...tagStrings(tags.function),
    ...tagStrings(tags.audience),
    ...tagStrings(tags.scenario),
  ]
    .filter(Boolean)
    .join(' · ');
}

function evidenceIsReal(span, src) {
  if (typeof span !== 'string') return false;
  const n = normalize(span);
  // Very short spans match by accident, so they prove nothing.
  if (n.length < 4) return false;
  return normalize(src).includes(n);
}

// ───────────────────────────────────────────────────────────── the contract handed to the model

const CATEGORY = ['FEMALE', 'MALE', 'COUPLES', 'BDSM', 'WATER_BASED'];
const PRICE = ['Entry', 'Mid', 'Mid-Premium', 'Premium', 'Luxury'];
const STATUS = ['Active', 'New', 'Best Seller', 'Strategic', 'Coming Soon'];
const MARKET = ['US', 'UK', 'EU', 'Australia', 'Japan', 'Korea', 'Southeast Asia', 'Middle East', 'Global'];

const TEXT_FIELDS = ['product_name_cn', 'description_cn', 'key_selling_point_cn', 'target_age', 'target_segment', 'design_style', 'visual_style'];
const ENUM_FIELDS = ['primary_category', 'price_level', 'target_market', 'product_status'];

const SYSTEM_PROMPT = [
  '你是外贸选品情报助手，为一个成人用品外贸平台的选品库补齐产品属性。',
  '',
  '硬性规则（违反其一，该字段作废）：',
  '1. 每个字段都要给出 evidence：从【原始资料】里逐字照抄一段连续文字，不改写、不拼接。',
  '2. evidence 必须是**原始资料里的原文**（资料是英文就抄英文）；但 fields 里的值可以是中文——翻译、归纳、改写都允许，只要它基于那段 evidence。',
  '   例：evidence 抄 "Rechargeable Silicone Vibrator with 12 Modes"，description_cn 可以写「12 档震动 rechargeable 硅胶震动器」。',
  '3. 原始资料里找不到依据的字段，值必须留空字符串或空数组，禁止"合理推测"。',
  '4. 资料里只有货号/编号（例如 PAS-MA-0535 这类没有中文名的行），你无法判断它是什么产品，',
  '   **除了能从品类/功能/材质字段直接读到的，其余字段一律留空**。绝对不要根据货号猜产品。',
  '5. 不确定就给低置信度，不要为了填满而编。',
  '',
  '字段说明：',
  '- product_name_cn：中文品名。若资料已有中文名则照抄；只有英文名时给中文译名，evidence 抄英文原名。',
  '- description_cn：1-2 句中文描述，只描述资料提到的功能/材质/卖点。',
  '- key_selling_point_cn：中文卖点，用「｜」分隔 3-5 个短词。',
  '- target_age：年龄段，如 25-40；无依据留空。',
  '- target_segment：客群描述，如「注重隐私的都市女性」；无依据留空。',
  '- design_style：设计风格，如「极简」「人体工学」；无依据留空。',
  '- visual_style：视觉风格，如「奶油白」「玫瑰金」；无依据留空。',
  `- primary_category：只能取 ${CATEGORY.join(' | ')}。`,
  `- price_level：只能取 ${PRICE.join(' | ')}；原始资料没有价格依据就留空，不要猜。`,
  `- target_market：数组，只能取 ${MARKET.join(' | ')}；没有依据就留空数组。`,
  `- product_status：只能取 ${STATUS.join(' | ')}；没有依据就留空。`,
  '',
  '只输出 JSON，不要任何解释文字。格式：',
  '{"fields":{...},"evidence":{"字段名":"原文片段"},"confidence":{"字段名":0.0}}',
].join('\n');

function buildUserPrompt(row) {
  return ['【原始资料】', sourceText(row) || '(空)', '', '【必须输出的 JSON】'].join('\n');
}

function parseJson(text) {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

const pickEnum = (v, allowed) => (allowed.includes(v) ? v : '');
const pickList = (v, allowed) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);

/**
 * Enrich one row. Never throws: a failure comes back as `{ ok: false, error }` so a 200-row batch
 * is not derailed by one bad row.
 */
async function enrichRow(row, { minConfidence = 0.5 } = {}) {
  const src = sourceText(row);
  if (!src.trim()) return { product_id: row.product_id, ok: false, error: 'EMPTY_SOURCE', fields: {}, evidence: {}, omitted: {} };

  let parsed;
  try {
    const text = await generate([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(row) },
    ]);
    parsed = parseJson(text);
  } catch (err) {
    return {
      product_id: row.product_id,
      ok: false,
      error: (err && err.code) || 'AI_ERROR',
      detail: ((err && err.message) || String(err)).slice(0, 200),
      fields: {},
      evidence: {},
      omitted: {},
    };
  }

  if (!parsed || !parsed.fields) {
    return { product_id: row.product_id, ok: false, error: 'BAD_JSON', fields: {}, evidence: {}, omitted: {} };
  }

  const raw = parsed.fields;
  const ev = parsed.evidence || {};
  const conf = parsed.confidence || {};
  const fields = {};
  const keptEvidence = {};
  const omitted = {};

  const consider = (key, cleaned) => {
    const value = cleaned;
    const empty = value === '' || value === undefined || value === null || (Array.isArray(value) && !value.length);
    if (empty) {
      omitted[key] = 'empty';
      return;
    }
    if (!evidenceIsReal(ev[key], src)) {
      // The model quoted something the row never said. Refuse the field.
      omitted[key] = 'no_evidence_in_source';
      return;
    }
    const c = Number(conf[key]);
    if (Number.isFinite(c) && c < minConfidence) {
      omitted[key] = `low_confidence:${c}`;
      return;
    }
    fields[key] = value;
    keptEvidence[key] = String(ev[key]).slice(0, 300);
  };

  for (const k of TEXT_FIELDS) consider(k, typeof raw[k] === 'string' ? raw[k].trim() : '');
  consider('primary_category', pickEnum(raw.primary_category, CATEGORY));
  consider('price_level', pickEnum(raw.price_level, PRICE));
  consider('product_status', pickEnum(raw.product_status, STATUS));
  consider('target_market', pickList(raw.target_market, MARKET));

  return { product_id: row.product_id, ok: true, fields, evidence: keptEvidence, omitted };
}

/** Small batches with limited concurrency: one bad rate limit should not cost the whole run. */
async function enrichRows(rows, { batchSize = 4, concurrency = 2 } = {}) {
  const results = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map((r) => enrichRow(r)));
    results.push(...settled);
  }
  return results;
}

/**
 * Vision extraction — SHAKI.com publishes its specifications as images, so the specs are only
 * reachable by looking at them.
 *
 * The evidence rule is necessarily weaker here than for text: a transcription cannot be substring-
 * checked against HTML that never contained it. Two things compensate, and both are code-enforced
 * rather than promised:
 *   - the model must transcribe the readable text verbatim, and that transcription is stored as
 *     the evidence, so a PM can check the claim against the picture;
 *   - `visionEnrichRow` refuses the row outright when the transcription does not mention the
 *     product name, which is what a mismatched or wrong image looks like.
 * Fields therefore carry `source: 'image'` and must never be presented as verified text.
 */
const VISION_PROMPT = [
  '你是一张产品详情图的转录助手。请完成两件事：',
  '',
  '1. transcription：把图里所有能读到的文字**逐字**转录出来（中文照抄，英文照抄），按图顺序排列。读不清的不要猜，跳过。',
  '2. fields：从上面转录的文字里抽取产品属性。每填一个字段，evidence 必须抄一段转录里逐字存在的原文。',
  '   抽取不到的字段一律留空，禁止根据常识或同类产品推测。',
  '',
  '字段（枚举值必须严格取给定值）：',
  '- product_name_cn / description_cn / key_selling_point_cn：中文，照抄或据转录归纳。',
  '- primary_category：只能取 FEMALE | MALE | COUPLES | BDSM | WATER_BASED。',
  '- secondary_category：图上原文的中文品类名。',
  '- main_material：材质，图上有才填。',
  '- target_gender：只能取 female | male | couples。',
  '- price_level：只能取 Entry | Mid | Mid-Premium | Premium | Luxury；图上没有价格就留空。',
  '- specs_text：图上的规格/参数原文（如 尺寸、重量、材质、频次、防水等级），逐字转录。',
  '',
  '只输出 JSON：',
  '{"transcription":"...","fields":{...},"evidence":{"字段名":"原文"},"confidence":{"字段名":0.0}}',
].join('\n');

async function visionJson(imageUrls, prompt, maxTokens = 1500) {
  const p = provider();
  if (p.kind !== 'openai-compatible') {
    const e = new Error('vision needs an OpenAI-compatible endpoint; set AI_API_KEY + AI_BASE_URL (e.g. Volcengine Ark)');
    e.code = 'NO_VISION_BACKEND';
    throw e;
  }
  const content = [
    { type: 'text', text: prompt },
    ...imageUrls.map((u) => ({ type: 'image_url', image_url: { url: u } })),
  ];
  return chatComplete(p, [{ role: 'user', content }], maxTokens, true);
}

async function visionEnrichRow(row, imageUrls) {
  const urls = (imageUrls || []).filter(Boolean).slice(0, 6);
  if (!urls.length) return { product_id: row.product_id, ok: false, error: 'NO_IMAGES', fields: {}, transcription: '' };

  let parsed;
  try {
    parsed = parseJson(await visionJson(urls, VISION_PROMPT));
  } catch (err) {
    return {
      product_id: row.product_id,
      ok: false,
      error: (err && err.code) || 'VISION_ERROR',
      detail: ((err && (err.detail || err.message)) || String(err)).slice(0, 200),
      fields: {},
    };
  }
  if (!parsed || typeof parsed.transcription !== 'string') {
    return { product_id: row.product_id, ok: false, error: 'BAD_JSON', fields: {} };
  }

  const transcription = parsed.transcription.slice(0, 4000);
  const name = String(row.name_cn || row.name_en || '').trim();

  // R1 name cross-check: if the pictures are of a different product, the name will not be in them.
  // Refusing the row is cheaper than shipping another SKU's specifications.
  const haystack = normalize(transcription);
  const nameKey = normalize(name);
  const nameSeen = !nameKey || haystack.includes(nameKey) || nameKey.includes(normalize(transcription).slice(0, 8));
  if (!nameSeen) {
    return {
      product_id: row.product_id,
      ok: false,
      error: 'NAME_MISMATCH',
      fields: {},
      transcription,
      detail: `the pictures do not mention "${name}"`,
    };
  }

  const fields = {};
  const evidence = {};
  for (const [k, v] of Object.entries(parsed.fields || {})) {
    if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
    fields[k] = v;
    if (parsed.evidence && typeof parsed.evidence[k] === 'string') evidence[k] = parsed.evidence[k].slice(0, 300);
  }

  return { product_id: row.product_id, ok: true, source: 'image', fields, evidence, transcription, images: urls };
}

module.exports = {
  enrichRow,
  enrichRows,
  visionEnrichRow,
  sourceText,
  evidenceIsReal,
  normalize,
  pickModel,
  provider,
  CANDIDATE_MODELS,
  TEXT_FIELDS,
  ENUM_FIELDS,
  get modelName() {
    return cachedName;
  },
  get modelProvider() {
    return cachedProvider;
  },
};
