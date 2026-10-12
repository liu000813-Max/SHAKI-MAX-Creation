/**
 * Portable proposal links.
 *
 * A proposal used to live only in this browser's localStorage, so the link `/share?id=AB12CD34`
 * opened as an empty page for anyone who was not the rep who created it — a share link that could
 * not be shared. There is no backend in this build (the app is a static export with zero network
 * requests), so the proposal has to travel in the URL itself.
 *
 * What travels is NOT the rendered proposal. It is the client profile plus the selected product
 * ids. The engine is deterministic, so the receiving device re-runs `runEngine` on the profile and
 * gets back exactly the recommendations the sender was looking at — including their scores, their
 * evidence and their PRD §16 disclosure. Shipping the inputs rather than the output means a shared
 * link cannot drift from what the app would have computed, and it keeps the payload small: ~650
 * bytes, ~870 base64url characters, against a ~2000 character practical ceiling for a link pasted
 * into WeChat.
 *
 * `opportunities` is dropped: the shared page never renders it and it is half the profile's JSON.
 */
import type { ClientProfile, Lang, Proposal } from './types';

export const SHARE_PAYLOAD_VERSION = 1;

/** Longest share URL we are willing to produce. WeChat truncates long links pasted into a chat. */
export const MAX_SHARE_URL_CHARS = 2000;

export type SharedProfile = Omit<ClientProfile, 'opportunities'>;

export interface SharedProposalPayload {
  v: number;
  /** Original proposal id, so the same proposal shared twice keeps its identity. */
  id: string;
  ti?: string;
  ty: Proposal['type'];
  co?: string;
  l: Lang;
  cl: SharedProfile;
  /** Product ids in the order the rep arranged them. */
  ids: string[];
  at?: string;
}

// TextEncoder/Decoder + btoa/atob rather than Buffer, so this module runs unchanged in the browser
// and under jiti in the verification harness.
const toBase64Url = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (s: string): string => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export function encodeSharePayload(payload: SharedProposalPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Returns null on anything it cannot trust: bad version, bad JSON, missing shape. */
export function decodeSharePayload(encoded: string): SharedProposalPayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as SharedProposalPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== SHARE_PAYLOAD_VERSION) return null;
    if (!parsed.cl || typeof parsed.cl.name !== 'string') return null;
    if (!Array.isArray(parsed.ids)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The hash form is deliberate: the payload never reaches a server, and WeChat rewrites query
 *  strings on shared links far more often than it touches fragments. */
export function buildShareUrl(origin: string, payload: SharedProposalPayload): string {
  return `${origin}/share#p=${encodeSharePayload(payload)}`;
}

/** Reads the payload out of a `#p=...` fragment. Returns null when the link carries none. */
export function payloadFromHash(hash: string): SharedProposalPayload | null {
  const m = /[#&]p=([^&]+)/.exec(hash || '');
  if (!m) return null;
  return decodeSharePayload(m[1]);
}
