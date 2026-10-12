/**
 * Shared-link smoke — run with node, no npm:
 *   node scripts/_share_url.ts <origin>          # prints the link
 *   node scripts/shared_link_smoke.mjs --url "$(jiti scripts/_share_url.ts <origin>)"
 *
 * Why this exists: a proposal link is only useful if it works for someone who did not create it.
 * The old `/share?id=<id>` read the proposal out of the sender's localStorage, so a recipient with
 * empty storage got an empty page — a share link that could not be shared. The fix ships the client
 * profile and the product ids in the URL fragment and re-runs the engine on arrival.
 *
 * The one thing that must be true, and the only thing asserted hard here:
 *
 *   with localStorage CLEARED, opening the link still renders the proposal's products
 *
 * Everything else (no exceptions, no seller chrome) is secondary. The recipient's browser is
 * emulated at phone width because that is where a link pasted into WeChat actually opens.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const URL_ARG = argOf('--url', '');
const CDP = argOf('--cdp', 'http://127.0.0.1:9222');
const OUT = argOf('--out', '');
const WIDTH = Number(argOf('--width', '390'));
const HEIGHT = Number(argOf('--height', '844'));

if (!URL_ARG) {
  console.error('FAIL -- pass --url (produce it with: jiti scripts/_share_url.ts <origin>)');
  process.exit(1);
}

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

const main = async () => {
  const ws = connect(await target());
  await ws.ready;
  await ws.send('Page.enable');
  await ws.send('Runtime.enable');
  await ws.send('Network.enable');
  await ws.send('Network.setCacheDisabled', { cacheDisabled: true });
  await ws.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 3, mobile: true });

  const evalJs = async (expr) => {
    const { result, exceptionDetails } = await ws.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result?.value;
  };

  // Warm the origin so localStorage is addressable, wipe it, then open the link. This is the whole
  // point: whatever the page shows, it cannot have come from this browser's own data.
  const origin = new URL(URL_ARG).origin;
  await ws.send('Page.navigate', { url: `${origin}/login/` });
  await sleep(1500);
  await evalJs('localStorage.clear()');
  const before = await evalJs(`JSON.stringify({ clients: localStorage.getItem('shaki_clients'), proposals: localStorage.getItem('shaki_proposals') })`);
  record('recipient starts with no local data', before === '{"clients":null,"proposals":null}', before);

  await ws.send('Page.navigate', { url: URL_ARG });
  let text = '';
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    try {
      text = await evalJs('document.body ? document.body.innerText : ""');
      if ((await evalJs('document.readyState')) === 'complete' && text.trim().length > 200) break;
    } catch {
      /* navigation tears the context down; retry next tick */
    }
  }
  await sleep(600);
  text = await evalJs('document.body.innerText');

  if (OUT) {
    await mkdir(OUT, { recursive: true });
    try {
      const { data } = await ws.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(path.join(OUT, 'shared-link.png'), Buffer.from(data, 'base64'));
    } catch (err) {
      console.log(`NOTE  full-page capture failed (${err.message}); falling back to the viewport`);
      const { data } = await ws.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(OUT, 'shared-link-viewport.png'), Buffer.from(data, 'base64'));
    }
  }

  record('shared link renders for a recipient with empty storage', text.trim().length > 200, `${text.trim().length} chars`);
  record('it says the proposal was shared', text.includes('您正在查看他人分享的产品方案'), text.slice(0, 60).replace(/\n/g, ' '));

  // The products must actually be there, not just the chrome. Count the SKU chips the page renders.
  const skus = await evalJs(`[...document.querySelectorAll('p.text-sm.text-gray-400')].map((e) => e.textContent.trim()).filter((s) => /^SHAKI-/.test(s))`);
  record('the shared products are listed', skus.length >= 3, `${skus.length} product(s): ${skus.slice(0, 5).join(', ')}`);

  // The recipient has nothing to copy, so the seller's copy-link bar must not be shown to them.
  record('no seller-only copy bar for the recipient', !text.includes('复制链接') && !text.includes('Copy link'), '');

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
