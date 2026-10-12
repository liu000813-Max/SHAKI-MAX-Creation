/**
 * Fault injection for the stale-cache bug: a browser that persisted recommendations computed
 * against an OLD library must not keep rendering product names that no longer exist.
 *
 * Seeds localStorage with a fabricated recommendation (a name that is in no build of the data),
 * leaves `shaki_library_version` unset so the app must treat everything as stale, then loads the
 * client page and checks the fabricated name is gone while a real one is present.
 *
 * Requires Chrome on 9222.
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const BASE = process.env.BASE || 'https://shaki-ai-product-match.app.workbuddy.host';
const FAKE_NAME = '假产品 · 不存在的型号';

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

  await send('Page.navigate', { url: `${BASE}/login/` });
  await sleep(2500);
  await evalJs(`localStorage.setItem('shaki_session', JSON.stringify({email:'demo@shaki.com', name:'demo'}))`);

  // The poisoned cache: a client plus a recommendation naming a product that exists in no build,
  // and deliberately NO library-version key, so the app must treat everything as stale.
  await evalJs(`
    (() => {
      const client = {
        id: 'STALECACHE01', name: 'stale-cache-probe', website: '', market: 'Global',
        businessType: 'Distributor', mainCategories: ['FEMALE', 'COUPLES'],
        brandPositioning: { zh: '现代亲密生活方式品牌', en: 'Modern intimate lifestyle brand' },
        visualStyle: ['Minimal'], targetAudience: '25-40', pricePosition: 'Mid',
        portfolio: [{ category: 'FEMALE', share: 40 }], opportunities: [], confidence: 'Medium',
      };
      const fake = {
        product_id: 'SHAKI-DB002', sku: 'SHAKI-DB002',
        product_name_cn: ${JSON.stringify(FAKE_NAME)}, product_name_en: 'Fake Product',
        primary_category: 'FEMALE', secondary_category: '震动类 / Vibrators',
        final_score: 99, curationSlot: '01', evidence: [],
        dimension_scores: { categoryFit: 99, audienceFit: 99, brandFit: 99, priceFit: 99, portfolioFit: 99, marketFit: 99 },
      };
      localStorage.setItem('shaki_clients', JSON.stringify([client]));
      localStorage.setItem('shaki_recommendations', JSON.stringify({ STALECACHE01: [fake] }));
      localStorage.removeItem('shaki_library_version');
      return true;
    })()
  `);

  await send('Page.navigate', { url: `${BASE}/client-intelligence/?id=STALECACHE01` });
  let text = '';
  for (let i = 0; i < 15; i += 1) {
    await sleep(1000);
    text = (await evalJs(`document.body.innerText`)) || '';
    // The recommendation cards render after hydration; wait for either a product name to show up
    // or the wait to run out — a missing name must be diagnosed, not raced.
    if (/杜宾|震动棒|产品/.test(text) && text.length > 400) break;
  }
  console.log(`      page chars: ${text.length}`);

  record('the fabricated product name is gone', !text.includes(FAKE_NAME));

  // The decisive check is what the app STORED after recomputing — rendering depends on which tab
  // is open, storage does not lie about what every screen will read.
  const storedRecs = (await evalJs(`localStorage.getItem('shaki_recommendations') || 'null'`)) || 'null';
  record('stale recommendations were recomputed, not kept', storedRecs !== 'null' && storedRecs.includes('双点震动棒'));
  record('the fabricated name does not survive anywhere in storage', !storedRecs.includes(FAKE_NAME));
  record(
    'the app stamped the current library version',
    (await evalJs(`localStorage.getItem('shaki_library_version')`)) !== null,
  );

  close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error('SMOKE ERROR', e);
  process.exit(1);
});
