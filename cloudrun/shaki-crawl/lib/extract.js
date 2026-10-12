/**
 * HTML → page facts.
 *
 * Deliberately dumb: it reports what the page said (title, meta, headings, visible text, outgoing
 * social links) and does **not** infer categories, styles or markets. Interpretation belongs to the
 * frontend, which already owns the keyword dictionaries — keeping them in one place means the
 * server can never drift from the engine's vocabulary.
 *
 * No external HTML parser: the shapes we need are a handful of tags, and a regex pass keeps the
 * deployment small and the output stable.
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // Punctuation keeps its real glyph — replacing it with ASCII would quietly rewrite the page's
  // own wording, and this service's only job is to report that wording faithfully.
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] || m);
}

function clean(s) {
  return decodeEntities(String(s || ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMeta(html) {
  const out = {};
  const re = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const key = /(?:name|property|itemprop)\s*=\s*["']?([^"'\s>]+)["']?/i.exec(attrs);
    const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    if (!key || !content) continue;
    const value = content[1] !== undefined ? content[1] : content[2] !== undefined ? content[2] : content[3];
    const k = key[1].toLowerCase();
    if (!(k in out)) out[k] = clean(value);
  }
  return out;
}

function matchOne(html, re) {
  const m = re.exec(html);
  return m ? clean(m[1]) : '';
}

function matchAll(html, re, limit) {
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const v = clean(m[1]);
    if (v) out.push(v);
  }
  return out;
}

const SOCIAL_HOSTS = [
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'youtube.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'pinterest.com',
];

function socialLinks(html, baseUrl) {
  const found = new Set();
  const re = /href\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let m;
  while ((m = re.exec(html)) !== null && found.size < 12) {
    let href = m[1] !== undefined ? m[1] : m[2];
    if (!href) continue;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
      const host = abs.hostname.toLowerCase().replace(/^www\./, '');
      if (SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) found.add(abs.toString());
    } catch {
      /* unparseable href: skip */
    }
  }
  return [...found].slice(0, 12);
}

/**
 * Remove the blocks whose text is not page content — comments first (a commented-out `<h2>` must
 * not be reported as a heading), then script/style and friends. Every extractor below runs against
 * this cleaned copy so it can never quote markup the browser would not have rendered.
 */
function stripNonContent(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ');
}

/** Drop tags, decode entities, collapse whitespace. */
function visibleText(strippedHtml) {
  const s = stripNonContent(strippedHtml).replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

function charsetOf(headers, html) {
  const ct = String(headers['content-type'] || '');
  const fromHeader = /charset\s*=\s*([^;\s]+)/i.exec(ct);
  if (fromHeader) return fromHeader[1].toLowerCase();
  const fromMeta = /charset\s*=\s*["']?([^"'\s>;]+)/i.exec(html.slice(0, 2048));
  return fromMeta ? fromMeta[1].toLowerCase() : 'unknown';
}

/**
 * @param {Buffer|string} body  raw response body (already decompressed)
 * @param {string} finalUrl     the URL the body actually came from (for resolving relative links)
 * @param {object} headers      response headers
 * @param {number} maxChars     cap on the returned `text`
 */
/**
 * Content images — the pictures that actually carry the product's specifications.
 *
 * SHAKI.com renders 详情介绍 as a sequence of `<img>` files rather than text, so these URLs are
 * the only place the specs exist. They are returned separately from decorative assets (logos,
 * banners) because they are what a vision model has to read.
 */
function contentImages(html, baseUrl, limit) {
  const found = [];
  const seen = new Set();
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null && found.length < limit) {
    const tag = m[0];
    const src =
      /(?:data-src|data-original|src)\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(tag);
    const raw = src && (src[1] !== undefined ? src[1] : src[2]);
    if (!raw || raw.startsWith('data:')) continue;
    // Uploads albums are product photography and spec sheets; everything else is chrome.
    if (!/\/uploads\//i.test(raw)) continue;
    let abs;
    try {
      abs = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (seen.has(abs.toString())) continue;
    seen.add(abs.toString());
    found.push(abs.toString());
  }
  return found;
}

/**
 * Navigation menu labels — the retailer's own department taxonomy.
 *
 * On a shop homepage the departments ("Dildos", "Cuffs and Restraints", "Harnesses and Strap-ons")
 * live in the nav, not in the headings: a real retailer's h1-h3 turned out to be nothing but footer
 * boilerplate. Counting what the nav says is the difference between knowing a shop sells bondage gear
 * and guessing it from the word "intimate".
 */
function navItems(html, limit) {
  const out = [];
  const seen = new Set();
  const blocks = html.match(/<nav\b[\s\S]*?<\/nav>/gi) || [];
  // Some themes put the menu in <header> without a <nav>; take the first header as a fallback.
  const scopes = blocks.length ? blocks : (html.match(/<header\b[\s\S]*?<\/header>/gi) || []).slice(0, 1);
  for (const scope of scopes) {
    const re = /<a\b[^>]*>([\s\S]{0,80}?)<\/a>/gi;
    let m;
    while ((m = re.exec(scope)) !== null && out.length < limit) {
      const label = decodeEntities(stripNonContent(m[1])).trim();
      if (label.length < 2 || label.length > 40) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

function extractFacts(body, finalUrl, headers, maxChars) {
  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
  const html = stripNonContent(raw);
  const meta = parseMeta(html);

  const title = matchOne(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const canonicalTag = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html);
  const headings = matchAll(html, /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi, 12);
  const text = visibleText(html);
  const truncated = text.length > maxChars;

  const description =
    meta['og:description'] || meta['twitter:description'] || meta.description || meta['description'] || '';

  return {
    title: title || meta['og:title'] || '',
    siteName: meta['og:site_name'] || '',
    description: description.slice(0, 600),
    lang: matchOne(html, /<html\b[^>]*\blang\s*=\s*["']([^"'>]+)["']/i),
    canonical: canonicalTag ? matchOne(canonicalTag[0], /href\s*=\s*(?:"([^"]+)"|'([^']+)')/i) : '',
    metaKeywords: (meta.keywords || '').slice(0, 400),
    headings,
    text: text.slice(0, maxChars),
    textChars: Math.min(text.length, maxChars),
    truncated,
    socialLinks: socialLinks(html, finalUrl),
    navItems: navItems(html, 120),
    contentImages: contentImages(html, finalUrl, 12),
    charset: charsetOf(headers || {}, html),
  };
}

module.exports = { extractFacts, visibleText, stripNonContent, parseMeta, decodeEntities, contentImages, navItems };
