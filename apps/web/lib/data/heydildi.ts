import catalog from './heydildi-catalog.json';
import type { HeydildiSku } from '../types';

// The real product database: SKU folders extracted from the Heydildi media export.
// Media binaries live under /public/products/heydildi (local, gitignored); this
// manifest is the committed, source-of-truth index the app reads at runtime.
export const heydildiCatalog: HeydildiSku[] = catalog as HeydildiSku[];

export function getHeydildiSku(sku: string): HeydildiSku | undefined {
  return heydildiCatalog.find((e) => e.sku === sku);
}

export function heydildiHeroImage(sku: string): string | undefined {
  return getHeydildiSku(sku)?.images[0];
}

export interface HeydildiProductView {
  sku: string;
  name: string;
  hero: string | undefined;
  gallery: string[];
  videos: string[];
  cad: string[];
  videoCount: number;
  cadCount: number;
  hasEnglishPage: boolean;
  isBundle: boolean;
}

// Display-oriented projection used by the catalog UI. No fabricated scores —
// only the real media that actually shipped in the export.
export function heydildiProductView(sku: string): HeydildiProductView | undefined {
  const e = getHeydildiSku(sku);
  if (!e) return undefined;
  return {
    sku: e.sku,
    name: e.sku.replace(/\s*&\s*/g, ' + '),
    hero: e.images[0],
    gallery: e.images,
    videos: e.videos,
    cad: e.cad,
    videoCount: e.videos.length,
    cadCount: e.cad.length,
    hasEnglishPage: e.englishPage,
    isBundle: e.sku.includes('&'),
  };
}

export const heydildiViews: HeydildiProductView[] = heydildiCatalog
  .map((e) => heydildiProductView(e.sku))
  .filter((v): v is HeydildiProductView => Boolean(v));
