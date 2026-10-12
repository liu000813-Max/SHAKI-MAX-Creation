/**
 * End-to-end proof that the *browser* really fetches the client website.
 *
 * Everything else in the chain can be verified with curl (service answers, CORS preflight passes,
 * the built chunk carries the endpoint) — but none of that proves the React path calls the fetcher
 * and renders the outcome. This drives it: log in, submit a real website on /analyze, and read back
 * what the panel says.
 *
 * It asserts the *reported fetch*, not just "a request was made": the status line carries the HTTP
 * status and character count, so "已抓取" with no numbers would fail.
 *
 * Requires Chrome on 9222:
 *   chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<private profile>
 */
// Node 22 ships a global WebSocket, so this needs no dependency at all — same as the other CDP
// harnesses in this repo.

const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const BASE = process.env.BASE || 'https://shaki-ai-product-match.app.workbuddy.host';
const SITE = process.env.SITE || 'https://www.shaki.com';

let pass = 0;
let fail = 0;
const record = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no page target; is Chrome running with --remote-debugging-port?');
  return page.webSocketDebuggerUrl;
}

function connect(url) {
  // The built-in WebSocket is event-target based; it has no `on()`.
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    }
  });
  const send = async (method, params = {}) => {
    await ready;
    const mid = ++id;
    return new Promise((res, rej) => {
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  };
  return { send, close: () => ws.close() };
}

const main = async () => {
  const { send, close } = connect(await target());
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed');
    return r.result.value;
  };
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.enable');

  // 1. through the login gate
  await send('Page.navigate', { url: `${BASE}/login/` });
  await sleep(2500);
  await evalJs(`localStorage.setItem('shaki_session', JSON.stringify({email:'demo@shaki.com', name:'demo'}))`);

  // 2. analyse a client with a real website
  await send('Page.navigate', { url: `${BASE}/analyze/` });
  await sleep(2500);
  // Facts are cached per URL for 30 minutes. Clear that, or the second run of this script is served
  // from cache and the "a request actually went out" assertion flips for a reason that is correct
  // behaviour rather than a bug.
  await evalJs(`
    Object.keys(localStorage)
      .filter((k) => k.startsWith('shaki.siteFacts.'))
      .forEach((k) => localStorage.removeItem(k));
    true
  `);
  // Network is instrumented so we can see the actual POST to the fetcher, not just its effect.
  const requests = [];
  const attached = await send('Target.getTargets');
  void attached;

  await evalJs(`
    (() => {
      window.__crawlCalls = [];
      const orig = window.fetch;
      window.fetch = function (...args) {
        try { window.__crawlCalls.push(String(args[0])); } catch (e) {}
        return orig.apply(this, args);
      };
      return true;
    })()
  `);

  await evalJs(`
    (() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const inputs = [...document.querySelectorAll('main input, input')];
      const cat = inputs.find((i) => i.type === 'text');
      const url = inputs.find((i) => i.type === 'url');
      if (cat) set(cat, '情趣用品、润滑剂、按摩器');
      if (url) set(url, ${JSON.stringify(SITE)});
      const form = document.querySelector('form');
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return !!url;
    })()
  `);

  // 3. read the panel while it is still on screen (it navigates away when done)
  let text = '';
  for (let i = 0; i < 40; i += 1) {
    await sleep(700);
    text = (await evalJs(`document.body.innerText`)) || '';
    if (/官网已抓取|Website fetched|抓取失败|could not be fetched/i.test(text)) break;
  }

  const expectFail = process.env.EXPECT_FAIL === '1';
  const fetched = /官网已抓取|Website fetched/i.test(text);
  const failed = /抓取失败|could not be fetched/i.test(text);
  // zh renders "正文 1242 字"; the unit is short, so accept 字 / 字符 / chars.
  const hasNumbers = /HTTP\s*\d{3}/i.test(text) && /\d[\d,]*\s*(字符|字|chars)/i.test(text);
  if (expectFail) {
    // An unreachable site must say so and fall back — never quietly proceed as if it had been read.
    record('an unreachable site is reported as a failure', failed, text.match(/官网抓取失败[^\n]*/)?.[0] || text.slice(0, 80));
    record('the failure says the analysis fell back', /回退|fell back/i.test(text));
    record('a failed fetch is not dressed up as a success', !fetched);
  } else {
    record('the analyze panel reports a real fetch', fetched, text.match(/官网已抓取[^\n]*/)?.[0] || text.slice(0, 80));
    record('the report carries HTTP status + character count', hasNumbers, text.match(/HTTP\s*\d{3}[^\n]*/)?.[0] || '');
  }
  record('the page does not claim the platform never crawls', !/不会抓取客户官网|does not fetch the client website/i.test(text));

  const calls = (await evalJs(`window.__crawlCalls || []`)) || [];
  record(
    'a request actually went to the fetcher service',
    calls.some((u) => u.includes('shaki-crawl')),
    calls.filter((u) => u.includes('shaki-crawl'))[0] || calls.join(',').slice(0, 80),
  );

  close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error('SMOKE ERROR', e);
  process.exit(1);
});
