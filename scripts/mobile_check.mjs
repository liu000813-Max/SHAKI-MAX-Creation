/**
 * Mobile usability probe — run with node, no npm:
 *   node scripts/mobile_check.mjs --base http://127.0.0.1:4175 --expect-dir apps/web/out --out shots
 *
 * Why this exists: the desktop smoke runs at 1280x900, but the link this app is shared with is
 * opened inside WeChat's in-app browser, which is a **phone**: 390pt wide, touch, no hover. A page
 * that passes every desktop assertion can still be unusable there, and nothing in the existing
 * suite would notice.
 *
 * ── Choosing assertions that can actually fail ────────────────────────────────────────────────
 * The first version of this file asserted only horizontal overflow:
 *
 *   document.documentElement.scrollWidth > window.innerWidth + 1   -> overflow
 *
 * It reported 6/6 PASS on a build that was visibly broken. The reason is instructive: the shell
 * reserved a `w-60` (240px) sidebar and gave the content column `flex-1 min-w-0`, so the content
 * did not overflow the viewport — it *collapsed inside it*. At 390pt the content wrapper was
 * `max-w-[1200px] px-12`, i.e. 390 - 240 - 96 = **54px** of usable text width, and the page title
 * 「推荐产品」 rendered one character per line. Nothing exceeded the viewport, so nothing fired.
 *
 * "Does not overflow" is therefore the wrong invariant. The invariants that separate a phone-usable
 * layout from a phone-hostile one are:
 *
 *   1. the content column keeps a usable share of the viewport (>= 55%)
 *   2. persistent navigation does not eat the phone screen (<= 20% at rest)
 *   3. navigation is still reachable — a drawer must open to >= 40%
 *
 * Each is a number. On the pre-fix shell build this probe reported 8/15 FAIL (54px of 390px, nav
 * occupying 62%); on the fixed build, 15/15 PASS (358px of 390px, nav 0% at rest). Same probe,
 * same thresholds — that contrast is what licenses the word "fixed".
 *
 * ── Two traps this file has already hit, both now guarded ─────────────────────────────────────
 *
 *   * Seed real data. With a session but no client, /recommendations and /compare render their
 *     EMPTY states, and an empty state cannot show a cramped card grid. `scripts/make_mobile_
 *     fixture.ts` produces the payload with the app's own engine; `--fixture` points at it.
 *
 *   * Prove you are testing the build you think you are. A stale `python -m http.server` left
 *     bound to port 4173 from an earlier session outlived a rebuild and answered every request, so
 *     a post-fix run printed numbers byte-identical to the pre-fix baseline. Nothing about the site
 *     looked wrong — the probe was simply reading a different build. `--expect-dir` compares the
 *     stylesheet hash the page actually loads against the one on disk and fails loudly if they
 *     disagree. Pass it whenever you are checking a local build.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const BASE = argOf('--base', 'http://127.0.0.1:4173').replace(/\/$/, '');
const OUT = argOf('--out', '');
const CDP = argOf('--cdp', 'http://127.0.0.1:9223');
const WIDTH = Number(argOf('--width', '390'));
const HEIGHT = Number(argOf('--height', '844'));
const FIXTURE = argOf('--fixture', path.resolve('scripts/.mobile-fixture.json'));
const EXPECT_DIR = argOf('--expect-dir', '');

// Minimum share of the viewport the page's own content column must keep. Below this the reader is
// looking at a strip, not a page. 0.55 leaves headroom for a genuinely generous mobile gutter.
const MIN_CONTENT_SHARE = Number(argOf('--min-content-share', '0.55'));
// A sidebar may be off-canvas, or it may be a closed drawer, but it may not hold the phone screen.
const MAX_NAV_SHARE = Number(argOf('--max-nav-share', '0.2'));
// When a drawer is opened it has to actually open.
const MIN_OPEN_NAV_SHARE = Number(argOf('--min-open-nav-share', '0.4'));

// A current iPhone UA. Some layouts branch on UA rather than on width, so emulating the viewport
// alone can test a code path a real phone never takes.
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no page target; is Chrome running with --remote-debugging-port?');
  return page.webSocketDebuggerUrl;
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const exceptions = [];
  let nextId = 1;
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res(), { once: true });
    ws.addEventListener('error', () => rej(new Error(`cdp socket failed: ${url}`)), { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails;
      exceptions.push(d?.exception?.description || d?.text || 'unknown exception');
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ready, send, exceptions, close: () => ws.close() };
}

// Rendered as `54px of 390px (14%)` so a failure states the size of the problem, not just its name.
const share = (part, whole) => `${part}px of ${whole}px (${Math.round((part / whole) * 100)}%)`;

const main = async () => {
  // ── Real data, or every screen below is an empty state ──
  let FIX = null;
  try {
    FIX = JSON.parse(await readFile(FIXTURE, 'utf8'));
    console.log(`fixture: client ${FIX.client.id} | ${(FIX.recommendations[FIX.client.id] || []).length} recommendations`);
  } catch {
    console.log(`NOTE  no fixture at ${FIXTURE}; recommendations and compare will be probed as empty states`);
  }

  // ── The build-identity guard: what is on disk, before any request is made ──
  let diskCss = null;
  if (EXPECT_DIR) {
    try {
      diskCss = (await readdir(path.join(EXPECT_DIR, '_next/static/css'))).filter((f) => f.endsWith('.css'));
    } catch {
      console.log(`NOTE  --expect-dir ${EXPECT_DIR} has no built stylesheet; identity check skipped`);
    }
  }

  const ws = connect(await target());
  await ws.ready;
  await ws.send('Page.enable');
  await ws.send('Runtime.enable');
  await ws.send('Network.enable');
  await ws.send('Network.setCacheDisabled', { cacheDisabled: true });
  await ws.send('Network.setUserAgentOverride', { userAgent: UA });
  await ws.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await ws.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const evalJs = async (expr) => {
    const { result, exceptionDetails } = await ws.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result?.value;
  };

  const goto = async (url, until = null) => {
    await ws.send('Page.navigate', { url });
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      try {
        const ready = (await evalJs('document.readyState')) === 'complete';
        const rendered = until ? await evalJs(until) : true;
        if (ready && rendered) break;
      } catch {
        /* navigations tear the context down; retry next tick */
      }
    }
    await sleep(until ? 400 : 1200);
  };

  const shot = async (name) => {
    if (!OUT) return;
    await mkdir(OUT, { recursive: true });
    const write = async (params) => {
      const { data } = await ws.send('Page.captureScreenshot', { format: 'png', ...params });
      await writeFile(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    };
    try {
      await write({ captureBeyondViewport: true });
    } catch (err) {
      console.log(`NOTE  full-page capture of ${name} failed (${err.message}); falling back to the viewport`);
      await write({});
    }
  };

  // One round trip per page. Everything the assertions need is measured here so the page is read at
  // a single instant — measuring twice can straddle a re-render and compare two different layouts.
  const probe = () =>
    evalJs(`(() => {
      const de = document.documentElement;
      const iw = window.innerWidth;
      const overflowing = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > iw + 1)
        .slice(0, 4)
        .map((el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''));

      // The shell wraps every page's children in <main><div>. Its padding is chrome; subtract it.
      let usable = null;
      let wrapWidth = null;
      const wrap = document.querySelector('main > div');
      if (wrap) {
        const cs = getComputedStyle(wrap);
        wrapWidth = wrap.clientWidth;
        usable = Math.round(wrap.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0'));
      }

      // How much of the phone screen the navigation holds right now. Off-canvas counts as zero:
      // an element parked outside the viewport costs the reader nothing.
      let navVisible = 0;
      const aside = document.querySelector('aside');
      if (aside) {
        const r = aside.getBoundingClientRect();
        const cs = getComputedStyle(aside);
        const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
        navVisible = shown ? Math.round(Math.max(0, Math.min(r.right, iw) - Math.max(r.left, 0))) : 0;
      }

      return {
        iw,
        scrollWidth: de.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        overflowing,
        usable,
        wrapWidth,
        navVisible,
        hasAside: !!aside,
        hasToggle: !!document.querySelector('[data-shell-nav-toggle]'),
        textLength: document.body.innerText.trim().length,
      };
    })()`);

  // ── Login has no shell: only the overflow invariant applies to it ──
  await goto(`${BASE}/`, 'document.body.innerText.trim().length > 100');
  await evalJs('localStorage.clear()');
  await goto(`${BASE}/`, 'document.body.innerText.trim().length > 100');
  // Measure BEFORE shooting: `captureBeyondViewport` momentarily resizes the layout viewport, and a
  // probe that lands in that window reads a layout the phone never sees.
  let g = await probe();
  await shot('m1-login');
  record(
    'login: no horizontal overflow',
    g.scrollWidth <= g.iw + 1,
    `${g.scrollWidth}px content vs ${g.iw}px viewport${g.overflowing.length ? ` | over: ${g.overflowing.join(', ')}` : ''}`
  );

  // ── Identity: is the page the build on disk, or a stale server? ──
  if (diskCss?.length) {
    const loaded = await evalJs(`[...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'))`);
    const names = (loaded || []).map((h) => String(h || '').split('/').pop()).filter(Boolean);
    const ok = names.some((n) => diskCss.includes(n));
    record(
      'the probe is reading the build on disk, not a stale server',
      ok,
      ok ? `loads ${names.join(', ')}` : `page loads ${names.join(', ') || '(no stylesheet)'} but ${EXPECT_DIR} has ${diskCss.join(', ')}`
    );
  }

  // ── Seed a session and, when available, a real client so the pages are not empty states ──
  const seedExpr = FIX
    ? `(() => {
        localStorage.setItem('shaki_session', JSON.stringify({ email: 'demo@shaki.com', name: 'demo' }));
        localStorage.setItem('shaki_clients', ${JSON.stringify(JSON.stringify([FIX.client]))});
        localStorage.setItem('shaki_recommendations', ${JSON.stringify(JSON.stringify(FIX.recommendations))});
        return true;
      })()`
    : `(() => { localStorage.setItem('shaki_session', JSON.stringify({ email: 'demo@shaki.com', name: 'demo' })); return true; })()`;
  await evalJs(seedExpr);

  const rid = FIX?.client?.id || '';
  const recs = FIX?.recommendations?.[rid] || [];
  const curatedIds = recs
    .filter((r) => r.curationSlot != null)
    .sort((a, b) => (a.curationSlot ?? 99) - (b.curationSlot ?? 99))
    .slice(0, 3)
    .map((r) => r.product_id)
    .join(',');

  // `content` is a JS expression returning a NUMBER and `min` is its floor. Every route gets the
  // signal that actually distinguishes "rendered its real content" from "rendered an empty state":
  // /analyze is a form, so its signal is the number of inputs, not the amount of text — the first
  // version used a text-length floor for every route and /analyze failed it at 278 chars while
  // showing a perfectly healthy form.
  const routes = [
    {
      route: '/analyze/',
      label: 'analyze',
      until: 'document.body.innerText.includes("退出登录")',
      content: `document.querySelectorAll('main input, main textarea').length`,
      min: 2,
      what: 'form inputs',
    },
    {
      route: '/catalog/',
      label: 'catalog',
      until: 'document.body.innerText.includes("退出登录")',
      content: 'document.body.innerText.trim().length',
      min: 1200,
      what: 'body text chars',
    },
    {
      route: `/recommendations/?id=${rid}`,
      label: 'recommendations',
      until: 'document.body.innerText.includes("退出登录") && document.body.innerText.length > 1200',
      content: 'document.body.innerText.trim().length',
      min: 1200,
      what: 'body text chars',
    },
    {
      route: `/compare/?id=${rid}&ids=${curatedIds}`,
      label: 'compare',
      until: 'document.body.innerText.includes("退出登录") && document.body.innerText.length > 1200',
      content: 'document.body.innerText.trim().length',
      min: 1200,
      what: 'body text chars',
    },
  ];

  for (const r of routes) {
    await goto(`${BASE}${r.route}`, r.until);
    g = await probe();
    await shot(`m2-${r.label}`);

    record(
      `${r.label}: no horizontal overflow`,
      g.scrollWidth <= g.iw + 1,
      `${g.scrollWidth}px content vs ${g.iw}px viewport${g.overflowing.length ? ` | over: ${g.overflowing.join(', ')}` : ''}`
    );

    const contentOk = g.usable !== null && g.usable >= MIN_CONTENT_SHARE * g.iw;
    record(`${r.label}: content column keeps >=${Math.round(MIN_CONTENT_SHARE * 100)}% of the viewport`, contentOk,
      g.usable === null ? 'no <main><div> wrapper found to measure' : `${share(g.usable, g.iw)} usable (wrapper ${g.wrapWidth}px)`);

    const navOk = g.navVisible <= MAX_NAV_SHARE * g.iw;
    record(`${r.label}: navigation does not hold the phone screen`, navOk,
      g.hasAside ? `nav occupies ${share(g.navVisible, g.iw)} at rest (max ${Math.round(MAX_NAV_SHARE * 100)}%)` : 'no <aside> rendered');

    // An empty state would satisfy every assertion above while showing the reader nothing.
    const have = await evalJs(r.content);
    record(`${r.label}: rendered real content, not an empty state`, have >= r.min, `${r.what}: ${have} (min ${r.min})`);
  }

  // ── Navigation must remain reachable: either already in flow, or a drawer that opens ──
  // Run last so the drawer is open when the run ends; the screenshots above were all taken at rest.
  await goto(`${BASE}/recommendations/?id=${rid}`, 'document.body.innerText.includes("退出登录")');
  g = await probe();
  if (g.hasToggle) {
    await evalJs(`document.querySelector('[data-shell-nav-toggle]').click()`);
    await sleep(500);
    const open = await probe();
    await shot('m3-drawer-open');
    record(
      'opening the drawer reveals the navigation',
      open.navVisible >= MIN_OPEN_NAV_SHARE * open.iw,
      `nav occupies ${share(open.navVisible, open.iw)} once opened (min ${Math.round(MIN_OPEN_NAV_SHARE * 100)}%)`
    );
  } else {
    record(
      'navigation is reachable without a drawer',
      g.navVisible >= MIN_OPEN_NAV_SHARE * g.iw,
      g.hasAside ? `no toggle; nav occupies ${share(g.navVisible, g.iw)} at rest` : 'no navigation rendered at all'
    );
  }

  record('no uncaught exceptions', ws.exceptions.length === 0, ws.exceptions.slice(0, 2).join(' | '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? `${failed.length} of ${results.length} checks failed` : `${results.length}/${results.length} checks passed`}`);
  ws.close();
  if (failed.length) process.exitCode = 1;
};

main().catch((err) => {
  console.error(`FAIL -- ${err.message}`);
  process.exitCode = 1;
  process.exit(1);
});
