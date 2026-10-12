/**
 * Outbound HTTP fetch with SSRF guards.
 *
 * This service is reachable from the public internet and takes a URL from the request body, so
 * every hop is validated before a socket is opened:
 *
 *   1. scheme must be http/https, port must be 80/443 (or absent)
 *   2. the hostname must resolve, and *every* resolved address must be public — a hostname that
 *      resolves to both a public and a private address is refused outright rather than "picking
 *      the good one", because DNS rebinding makes that choice meaningless by the time we connect
 *   3. redirects are followed manually (max 3) and re-validated hop by hop
 *
 * The lookup hook is what makes (2) real: `http.request` still connects by hostname, so TLS SNI
 * and certificate validation keep working, but we get to inspect the DNS answer first.
 */
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const zlib = require('node:zlib');
const { URL } = require('node:url');

const MAX_REDIRECTS = 3;
const MAX_BYTES = 1024 * 1024; // 1 MiB of compressed-or-raw body is plenty for a landing page
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

/** Hostnames that are internal by convention, whatever they resolve to. */
function isBlockedHostname(host) {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true;
  if (h === 'metadata' || h.endsWith('.metadata') || h === 'metadata.google.internal') return true;
  if (h === 'instance-data' || h.endsWith('.instance-data')) return true;
  return false;
}

function ipv4IsPrivate(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true; // link-local, incl. 169.254.169.254 metadata
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true; // IETF protocol assignments
  if (p[0] === 192 && p[1] === 0 && p[2] === 2) return true; // TEST-NET-1
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true; // benchmarking
  if (p[0] >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function ipv6IsPrivate(ip) {
  const v = String(ip).toLowerCase().split('%')[0];
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fe80') || v.startsWith('fec0')) return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

function isPrivateAddress(ip, family) {
  if (family === 6 || String(ip).includes(':')) return ipv6IsPrivate(ip);
  return ipv4IsPrivate(ip);
}

/** A `net.connect`-compatible lookup that refuses to hand back a private address. */
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    if (list.some((a) => isPrivateAddress(a.address, a.family))) {
      const e = new Error('BLOCKED_ADDRESS');
      e.code = 'BLOCKED_ADDRESS';
      return callback(e);
    }
    if (options && options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    const e = new Error('INVALID_URL');
    e.code = 'INVALID_URL';
    throw e;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    const e = new Error('BLOCKED_SCHEME');
    e.code = 'BLOCKED_SCHEME';
    throw e;
  }
  if (!ALLOWED_PORTS.has(u.port)) {
    const e = new Error('BLOCKED_PORT');
    e.code = 'BLOCKED_PORT';
    throw e;
  }
  if (isBlockedHostname(u.hostname)) {
    const e = new Error('BLOCKED_ADDRESS');
    e.code = 'BLOCKED_ADDRESS';
    throw e;
  }
  // A bare IP literal never goes through DNS, so the lookup hook cannot vet it.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.startsWith('[')) {
    const e = new Error('BLOCKED_ADDRESS');
    e.code = 'BLOCKED_ADDRESS';
    throw e;
  }
  return u;
}

function decompress(buf, encoding) {
  try {
    if (encoding === 'gzip') return zlib.gunzipSync(buf);
    if (encoding === 'br') return zlib.brotliDecompressSync(buf);
    if (encoding === 'deflate') return zlib.inflateSync(buf);
  } catch {
    /* fall through: return the raw bytes and let the parser cope */
  }
  return buf;
}

function requestOnce(url, timeoutMs, deadline, maxBytes) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const remaining = Math.max(1000, Math.min(timeoutMs, deadline - Date.now()));
    const limit = maxBytes || MAX_BYTES;

    const req = mod.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        lookup: guardedLookup,
        headers: {
          // A crawler for keyword extraction looks like itself; no UA spoofing, no cookies.
          'user-agent': 'SHAKI-SiteFacts/1.0 (+https://shaki-ai-product-match.app.workbuddy.host)',
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1',
          'accept-encoding': 'gzip, deflate',
          'accept-language': 'en',
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        let done = false;

        const finish = (err, result) => {
          if (done) return;
          done = true;
          res.destroy();
          clearTimeout(timer);
          if (err) reject(err);
          else resolve(result);
        };

        res.on('data', (c) => {
          size += c.length;
          if (size > limit) {
            const e = new Error('TOO_LARGE');
            e.code = 'TOO_LARGE';
            return finish(e);
          }
          chunks.push(c);
        });
        res.on('aborted', () => finish(new Error('UPSTREAM_ERROR')));
        res.on('error', (e) => finish(e));
        res.on('end', () => {
          const body = decompress(Buffer.concat(chunks), (res.headers['content-encoding'] || '').toLowerCase());
          finish(null, {
            status: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      },
    );

    const timer = setTimeout(() => {
      const e = new Error('UPSTREAM_TIMEOUT');
      e.code = 'UPSTREAM_TIMEOUT';
      req.destroy(e);
    }, remaining);

    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.setTimeout(remaining, () => {
      const e = new Error('UPSTREAM_TIMEOUT');
      e.code = 'UPSTREAM_TIMEOUT';
      req.destroy(e);
    });
    req.end();
  });
}

/**
 * Fetch a page, following redirects manually so each hop is validated.
 * Rejects with an Error carrying `.code`; resolves with `{ status, headers, body, finalUrl }`.
 */
async function safeFetch(rawUrl, { timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let url = normalizeUrl(rawUrl);
  const chain = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (Date.now() > deadline) {
      const e = new Error('UPSTREAM_TIMEOUT');
      e.code = 'UPSTREAM_TIMEOUT';
      throw e;
    }
    let res;
    try {
      res = await requestOnce(url, timeoutMs, deadline);
    } catch (err) {
      if (err && err.code === 'BLOCKED_ADDRESS') throw err;
      const e = new Error(err && err.code ? err.code : 'UPSTREAM_ERROR');
      e.code = e.message;
      e.detail = err && err.message;
      throw e;
    }
    chain.push({ url: url.toString(), status: res.status });

    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.location;
    if (!isRedirect) {
      return { ...res, finalUrl: url.toString(), chain };
    }
    if (hop === MAX_REDIRECTS) {
      const e = new Error('TOO_MANY_REDIRECTS');
      e.code = 'TOO_MANY_REDIRECTS';
      throw e;
    }
    let next;
    try {
      next = normalizeUrl(new URL(res.headers.location, url).toString());
    } catch (err) {
      throw err && err.code ? err : Object.assign(new Error('INVALID_URL'), { code: 'INVALID_URL' });
    }
    url = next;
  }

  const e = new Error('TOO_MANY_REDIRECTS');
  e.code = 'TOO_MANY_REDIRECTS';
  throw e;
}

module.exports = { safeFetch, normalizeUrl, isPrivateAddress, isBlockedHostname, MAX_BYTES, MAX_REDIRECTS };
