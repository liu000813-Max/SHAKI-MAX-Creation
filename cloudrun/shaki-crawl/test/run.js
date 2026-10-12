/**
 * Local harness. app.js is function-mode (it exports the app and never listens), so this file is
 * the only place that binds a port — it exists for local verification, not for deployment.
 *
 * Run: node test/run.js            (network cases are attempted; offline failures are reported,
 *                                   never silently skipped)
 *      node test/run.js --offline  (skip the live-fetch case)
 */
const app = require('../app');

const PORT = Number(process.env.TEST_PORT || 3210);
const OFFLINE = process.argv.includes('--offline');
const LIVE_URL = process.env.LIVE_URL || 'https://example.com';

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function post(path, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));

  try {
    const health = await fetch(`http://127.0.0.1:${PORT}/health`);
    check('GET /health returns ok', health.status === 200, `status ${health.status}`);

    // ── Guards: these must be refused before any socket is opened ────────────────────────────
    for (const [name, url, expected] of [
      ['localhost is refused', 'http://localhost/', 'BLOCKED_ADDRESS'],
      ['cloud metadata IP is refused', 'http://169.254.169.254/latest/meta-data/', 'BLOCKED_ADDRESS'],
      ['private IP literal is refused', 'http://192.168.0.1/', 'BLOCKED_ADDRESS'],
      ['non-http scheme is refused', 'ftp://example.com/', 'BLOCKED_SCHEME'],
      ['non-web port is refused', 'http://example.com:22/', 'BLOCKED_PORT'],
    ]) {
      const { json } = await post('/crawl', { url });
      check(
        name,
        json.ok === false && json.error && json.error.code === expected,
        `got ${json.error && json.error.code}`,
      );
    }

    const bad = await post('/crawl', { url: '   ' });
    check('empty url is refused', bad.json.ok === false && bad.json.error.code === 'INVALID_URL');

    const missing = await post('/crawl', {});
    check('missing url is refused', missing.json.ok === false && missing.json.error.code === 'INVALID_URL');

    const notFound = await fetch(`http://127.0.0.1:${PORT}/nope`);
    check('unknown route 404s', notFound.status === 404, `status ${notFound.status}`);

    // ── Live fetch ──────────────────────────────────────────────────────────────────────────
    if (OFFLINE) {
      console.log(`SKIP  live fetch of ${LIVE_URL} (--offline)`);
    } else {
      const { json } = await post('/crawl', { url: LIVE_URL });
      if (json.ok !== true) {
        check(`live fetch of ${LIVE_URL}`, false, `${json.error && json.error.code} ${json.error && json.error.message}`);
      } else {
        check('live fetch returns ok', true);
        check('live fetch reports httpStatus 200', json.httpStatus === 200, `got ${json.httpStatus}`);
        check('live fetch returns a title', typeof json.title === 'string' && json.title.length > 0, JSON.stringify(json.title));
        check('live fetch returns visible text', json.textChars > 0, `textChars ${json.textChars}`);
        check('live fetch caps its text', json.textChars <= 6000, `textChars ${json.textChars}`);
        check('live fetch records finalUrl', typeof json.finalUrl === 'string' && json.finalUrl.startsWith('http'));
        check(
          'response carries no credential-bearing header echo',
          !JSON.stringify(json).includes('x-cloudbase-context'),
        );
        console.log(`      title: ${JSON.stringify(json.title)}`);
        console.log(`      textChars: ${json.textChars}  bytes: ${json.bytes}  charset: ${json.charset}`);
        console.log(`      excerpt: ${JSON.stringify(String(json.text).slice(0, 160))}`);
      }
    }
  } finally {
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
