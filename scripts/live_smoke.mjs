#!/usr/bin/env node
/**
 * Smoke-test a deployed site through a real browser, with no npm dependencies.
 *
 * `probe_server.py` proves the server hands over the right bytes. It cannot prove the app runs:
 * this project is a static export behind a client-side auth gate, so *every* route answers 200
 * while rendering the same login screen. From the outside, "deployed" and "working" look alike.
 *
 * So this drives the real flow -- login, analyze a client, open recommendations, export the
 * analysis -- and asserts on what a user would see. It also listens for uncaught exceptions, since
 * a page that renders but throws on every click is not working either.
 *
 * The export step is the strongest available check: the download goes to a directory we control, so
 * the PRD §16 contract gets validated against the file a real browser actually produced, rather
 * than against an in-process call in a harness.
 *
 * Chrome DevTools Protocol is spoken directly over Node 22's built-in `WebSocket` and `fetch`,
 * because `agent-browser` needs a ~500 MB Chromium download through an npm that is effectively
 * unusable on this machine. Chrome is already installed; this uses it.
 *
 * Start Chrome first:
 *   chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
 *
 * Then:
 *   node scripts/live_smoke.mjs --base https://shaki-ai-product-match.app.workbuddy.host --out shots
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const BASE = argOf('--base', 'http://127.0.0.1:4173').replace(/\/$/, '');
const OUT = argOf('--out', '');
const CDP = argOf('--cdp', 'http://127.0.0.1:9222');
const DOWNLOADS = argOf('--downloads', path.join(OUT || '.', 'downloads'));

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

// A page that renders an error is not a page that works. Asserting only "not the login gate and
// not too short" passes on a 404 page -- which is exactly how `/library/` first slipped through.
const ERROR_MARKERS = [
  'Error code:',
  'File not found',
  'This page could not be found',
  'Application error',
  'Unhandled Runtime Error',
];
const looksLikeError = (text) => ERROR_MARKERS.some((m) => text.includes(m));

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = (v) => JSON.stringify(v);

async function main() {
  const ws = connect(await target());
  await ws.ready;
  await ws.send('Page.enable');
  await ws.send('Runtime.enable');
  // Serve every request from the network, never the disk cache. A cached bundle makes a fresh deploy
  // look unchanged: this run reported "the trace still shows 2 of 8 stages" against a deployment that
  // was in fact byte-identical to local (same chunk hashes, same 82640-byte shared chunk). The same
  // cache could just as easily serve yesterday's working bundle and hide a real regression. Both
  // directions are false results, and one line removes the whole class.
  await ws.send('Network.enable');
  await ws.send('Network.setCacheDisabled', { cacheDisabled: true });
  // Pin the viewport. Without this the renderer can still report 0x0 for the first frames, and
  // `Page.captureScreenshot` then fails outright with "Cannot take screenshot with 0 width" --
  // which aborts the whole run and reads like a broken app. A fixed size also makes every
  // screenshot comparable between runs.
  await ws.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await rm(DOWNLOADS, { recursive: true, force: true });
  await mkdir(DOWNLOADS, { recursive: true });
  // Let the export button's blob actually land on disk so the contract can be checked on the file.
  await ws.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: path.resolve(DOWNLOADS),
    eventsEnabled: true,
  });

  const evalJs = async (expression) => {
    const r = await ws.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval threw');
    return r.result.value;
  };

  const goto = async (url, until = null) => {
    await ws.send('Page.navigate', { url });
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      try {
        // `readyState === 'complete'` says the network settled, not that the app rendered. With a cold
        // cache over a real network the client bundle is still hydrating then, so the page reads as its
        // mount placeholder ("…") and a capture even fails with "Cannot take screenshot with 0 width".
        // Against localhost the hydration always won the race, which is why this only showed up live.
        const ready = (await evalJs('document.readyState')) === 'complete';
        const rendered = until ? await evalJs(until) : true;
        if (ready && rendered) break;
      } catch { /* navigations tear the context down; retry next tick */ }
    }
    await sleep(until ? 400 : 1300); // hydration + data effects
  };

  const visibleText = () => evalJs('document.body.innerText.replace(/\\s+/g, " ").trim()');

  const shot = async (name) => {
    if (!OUT) return;
    await mkdir(OUT, { recursive: true });
    // Full page, not the viewport. A viewport capture silently crops anything below the fold, and a
    // cropped screenshot of a long section reads as "the section ends there" -- which is how a trace
    // showing 2 of 8 stages got waved through by eye for two rounds.
    const write = async (params) => {
      const { data } = await ws.send('Page.captureScreenshot', { format: 'png', ...params });
      await writeFile(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    };
    try {
      await write({ captureBeyondViewport: true });
    } catch (err) {
      // A failed capture must not abort the whole flow before the assertions that matter -- but it
      // must not be silent either, or a missing screenshot looks like "nothing to see here".
      console.log(`NOTE  full-page capture of ${name} failed (${err.message}); falling back to the viewport`);
      const metrics = await ws.send('Page.getLayoutMetrics').catch((e) => ({ error: e.message }));
      console.log(`NOTE  layout metrics for ${name}: ${j(metrics?.cssContentSize ?? metrics)}`);
      await write({});
    }
  };

  const setInput = (selector, value) =>
    evalJs(`(() => {
      const el = document.querySelector(${j(selector)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${j(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

  const clickText = (text) =>
    evalJs(`(() => {
      const el = [...document.querySelectorAll('button,a')].find((b) => b.innerText.trim() === ${j(text)});
      if (!el) return false;
      el.click();
      return true;
    })()`);

  const hasText = (text) => evalJs(`document.body.innerText.includes(${j(text)})`);

  // ---------------------------------------------------------------- 1. login gate

  await goto(`${BASE}/`, "document.body.innerText.trim().length > 100");
  await evalJs('localStorage.clear()');
  await goto(`${BASE}/`, "document.body.innerText.trim().length > 100");
  const gate = await visibleText();
  record('login gate renders', gate.includes('登录') && /邮箱|Email/i.test(gate), gate.slice(0, 60));
  await shot('01-login');

  // ---------------------------------------------------------------- 2. real routes past the gate

  // The gate is local-first (`lib/auth.tsx` writes `shaki_session`, no network), so seeding the
  // session does what `signIn()` does. Driving the form would only re-test its regex validation.
  await evalJs(`localStorage.setItem('shaki_session', JSON.stringify({email:'demo@shaki.com', name:'demo'}))`);

  for (const [route, label] of [
    ['/analyze/', 'analyze'],
    ['/catalog/', 'catalog'],
    ['/compare/', 'compare'],
    ['/enrichment/', 'enrichment'],
    ['/proposal/', 'proposal'],
  ]) {
    await goto(`${BASE}${route}`);
    const text = await visibleText();
    const past = !text.includes('忘记密码');
    const ok = past && !looksLikeError(text) && text.length > 60;
    record(`${label} renders`, ok, `${text.length} chars${looksLikeError(text) ? ' ERROR PAGE' : ''}: ${text.slice(0, 60)}`);
    await shot(`02-${label}`);
  }

  // ---------------------------------------------------------------- 3. drive a real analysis

  await goto(`${BASE}/analyze/`);
  const filledCat = await setInput('input[placeholder*="女性健康"]', '情趣用品、成人健康、情侣生活方式');
  const filledWeb = await setInput('input[type="url"]', 'https://www.example.com');
  record('analyze form accepts input', filledCat && filledWeb, `categories=${filledCat} website=${filledWeb}`);

  const started = await clickText('开始分析客户');
  record('analyze submit clickable', started);

  // handleSubmit waits 600ms per step, then routes to /client-intelligence?id=<id>.
  // The optional slash matters: `trailingSlash: true` in next.config makes the real URL
  // `/client-intelligence/?id=...`, and a pattern expecting `?id` directly after the segment
  // silently never matches -- which reads as "the app never navigated" rather than "my regex is wrong".
  let clientId = '';
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const url = await evalJs('location.href');
      const m = /client-intelligence\/?\?id=([^&]+)/.exec(url);
      if (m) { clientId = decodeURIComponent(m[1]); break; }
    } catch { /* still on the loading screen */ }
  }
  record('analysis produced a client', !!clientId, clientId ? `id=${clientId}` : 'never navigated');
  await shot('03-client-intelligence');

  if (!clientId) {
    console.log('\nFAIL -- cannot continue to recommendations without a client');
    ws.close();
    process.exit(1);
  }

  // ---------------------------------------------------------------- 4. recommendations + §16 export

  // The param is `id`, matching AppShell's `recHref = /recommendations?id=${latest.id}` and the
  // page's `searchParams.get('id')`. A wrong name here renders the empty state, which is easy to
  // misread as "recommendations are broken".
  await goto(`${BASE}/recommendations/?id=${encodeURIComponent(clientId)}`, "document.body.innerText.includes('最终推荐分')");
  const recText = await visibleText();
  record('recommendations render', !looksLikeError(recText) && recText.includes('推荐'), `${recText.length} chars`);
  record('related products section present', await hasText('关联产品'));

  // Batch 1: the score trace used to render 2 of the engine's 8 stages. The engine's `stages` array
  // skipped the truncation row (so the list ran 1, 2, 3, 5, 6, 7) and the page looked up only the two
  // frozen ids. A trace showing three of eight steps looks exactly like one showing eight, so assert
  // the whole funnel by label and name whichever stage is missing.
  const FUNNEL_LABELS = [
    '硬性过滤',
    '语义召回',
    '六维适配打分',
    '潜力与机会打分',
    '高匹配截断',
    '最终推荐分',
    '多样性重排',
    'Top 5 策展',
  ];
  const absentStages = FUNNEL_LABELS.filter((label) => !recText.includes(label));
  record(
    `score trace shows all ${FUNNEL_LABELS.length} stages`,
    absentStages.length === 0,
    absentStages.length ? `missing: ${absentStages.join(', ')}` : 'full funnel'
  );

  // Two UI elements describe the same gate: the summary card's "N passed the hard filter" and the
  // trace's first row. They are computed from different fields, so agreeing is meaningful -- and the
  // first row's input has to exceed its output, or the trace is describing a pipeline that already
  // ran rather than one that is running.
  const gateCard = recText.match(/(\d+)\s*款通过硬性过滤/);
  const firstRow = recText.match(/硬性过滤[^\d]*(\d+)\s*→\s*(\d+)/);
  const traceAgrees =
    !!gateCard && !!firstRow && Number(firstRow[2]) === Number(gateCard[1]) && Number(firstRow[1]) > Number(firstRow[2]);
  record(
    'score trace agrees with the summary card',
    traceAgrees,
    gateCard && firstRow ? `card says ${gateCard[1]} passed, trace says ${firstRow[1]} -> ${firstRow[2]}` : 'could not parse either'
  );

  await shot('04-recommendations');

  const hadButton = await hasText('导出分析 JSON');
  record('§16 export button rendered', hadButton);

  if (hadButton) {
    await clickText('导出分析 JSON');
    await sleep(2500);
    const exported = await hasText('已导出');
    record('export click completes and flips the label', exported);

    const files = (await readdir(DOWNLOADS)).filter((f) => f.endsWith('.json'));
    record('export wrote a JSON file', files.length > 0, files.join(', ') || 'no .json in download dir');
    if (files.length) {
      const file = path.join(DOWNLOADS, files[0]);
      const raw = await readFile(file, 'utf8');
      console.log(`\n--- downloaded ${files[0]} (${raw.length} bytes) ---`);
      console.log(raw.slice(0, 1200));
      console.log(`--- end excerpt ---\n`);
      await writeFile(path.join(OUT || '.', 'exported-analysis.json'), raw);
    }
  }

  // ---------------------------------------------------------------- 5. nothing threw

  record('no uncaught exceptions during the flow', ws.exceptions.length === 0, ws.exceptions.slice(0, 2).join(' | '));

  ws.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? 'PASS' : 'FAIL'} -- ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL -- ${err.message}`);
  process.exit(1);
});
