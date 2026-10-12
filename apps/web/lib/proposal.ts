import { ClientProfile, Lang, Recommendation } from './types';
import { categoryNames } from './data/products';
import { localizeProductField } from './utils';

export interface GeneratedCopy {
  title: string;
  copy: string;
}

/**
 * Deterministic, offline proposal-copy generator.
 * No external API dependency — swappable for a real LLM call later.
 * Uses the proposal's own language so the client document stays consistent.
 */
export function generateProposalCopy(
  client: ClientProfile | undefined,
  products: Recommendation[],
  lang: Lang,
  existingTitle?: string
): GeneratedCopy {
  const clientName = client?.name || (lang === 'zh' ? '贵司' : 'your company');

  const title =
    existingTitle?.trim() ||
    (lang === 'zh'
      ? `${clientName} · SHAKI 精选产品方案`
      : `${clientName} · Curated SHAKI Selection`);

  const intro =
    lang === 'zh'
      ? `基于我们对 ${clientName} 的品牌定位、产品结构及市场方向的研究，SHAKI 为您精选了以下 ${products.length} 款产品，最契合贵司当前业务需求与增长机会：`
      : `Based on our research into ${clientName}'s brand positioning, product portfolio and market direction, SHAKI has curated the following ${products.length} products that best match your current business needs and growth opportunities:`;

  const lines = products.map((rec, i) => {
    const name = localizeProductField(rec.product, lang, 'product_name');
    const cat = categoryNames[rec.product.primary_category]?.[lang] || rec.product.primary_category;
    const reason = rec.reason?.businessReason || '';
    if (lang === 'zh') {
      return `${i + 1}. ${name}（${cat} · 适配 ${rec.fitScore}）\n   ${reason}`;
    }
    return `${i + 1}. ${name} (${cat} · Fit ${rec.fitScore})\n   ${reason}`;
  });

  const closing =
    lang === 'zh'
      ? `\n下一步：如您对以上产品感兴趣，我们可进一步提供样品、报价及 OEM / ODM 方案，助您快速落地选品。`
      : `\nNext step: If any of these products are of interest, we can provide samples, pricing and OEM / ODM options to help you move quickly.`;

  return { title, copy: `${intro}\n\n${lines.join('\n\n')}${closing}` };
}
