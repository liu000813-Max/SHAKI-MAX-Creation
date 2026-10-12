/** Why do /catalog/, /recommendations/ and /compare/ look empty in the mobile check? Evidence, not guesses. */
const CDP = 'http://127.0.0.1:9223';
const BASE = 'http://127.0.0.1:3111';
const FIX = JSON.parse((await import('node:fs')).readFileSync('scripts/.mobile-fixture.json', 'utf8'));

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const logs = [];
let id = 1;
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    logs.push(`${m.params.type}: ${(m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push(`exception: ${(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300)}`);
  }
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

await send('Page.navigate', { url: `${BASE}/` });
await new Promise((r) => setTimeout(r, 2000));

console.log('session set:', await evalJs(`(() => {
  localStorage.setItem('shaki_session', JSON.stringify({ email: 'demo@shaki.com', name: 'demo' }));
  localStorage.setItem('shaki_clients', ${JSON.stringify(JSON.stringify([FIX.client]))});
  localStorage.setItem('shaki_recommendations', ${JSON.stringify(JSON.stringify(FIX.recommendations))});
  return localStorage.getItem('shaki_session') !== null;
})()`));
console.log('library version stored:', await evalJs(`localStorage.getItem('shaki_library_version')`));

for (const route of ['/catalog/', `/recommendations/?id=${FIX.client.id}`, `/compare/?id=${FIX.client.id}&ids=x`]) {
  await send('Page.navigate', { url: BASE + route });
  await new Promise((r) => setTimeout(r, 3500));
  const info = await evalJs(`JSON.stringify({
    href: location.pathname + location.search,
    chars: document.body.innerText.trim().length,
    head: document.body.innerText.trim().slice(0, 120),
    hasLogout: document.body.innerText.includes('退出登录'),
    cards: document.querySelectorAll('a[href*="/product/"]').length,
  })`);
  console.log(`\n${route}\n  ${info}`);
}
console.log('\nconsole:', logs.slice(0, 8).join('\n  ') || '(clean)');
ws.close();