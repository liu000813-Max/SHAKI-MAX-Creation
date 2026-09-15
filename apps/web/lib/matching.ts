import { products } from './data/products';
import { ClientInput, ClientProfile, DimensionScores, Lang, Product, Recommendation } from './types';

const categoryKeywords: Record<string, string[]> = {
  FEMALE: ['women', 'female', 'woman', 'vibrator', 'massager', 'wellness', 'feminine', 'beauty', 'suction', 'intimate'],
  MALE: ['men', 'male', 'man', 'prostate', 'masturbator', 'couples', 'performance', 'male wellness'],
  COUPLES: ['couple', 'couples', 'relationship', 'partner', 'gift', 'remote', 'interactive', 'wearable'],
  BDSM: ['bdsm', 'bondage', 'restraint', 'roleplay', 'fetish', 'kink', 'collar', 'blindfold'],
  WATER_BASED: ['lubricant', 'lube', 'cleanser', 'cleansing', 'mousse', 'hygiene', 'care', 'liquid', 'water-based'],
};

const styleKeywords: Record<string, string[]> = {
  Minimal: ['minimal', 'simple', 'clean', 'modern', 'premium', 'elegant'],
  Premium: ['premium', 'luxury', 'high-end', 'elegant', 'sophisticated'],
  Luxury: ['luxury', 'high-end', 'exclusive', 'designer'],
  Cute: ['cute', 'playful', 'fun', 'colorful', 'young'],
  Medical: ['medical', 'wellness', 'health', 'clinical', 'discreet'],
  Wellness: ['wellness', 'health', 'lifestyle', 'self-care', 'feminine'],
  Modern: ['modern', 'contemporary', 'sleek', 'stylish'],
};

const audienceKeywords: Record<string, string[]> = {
  '18-30': ['young', 'gen z', 'millennial', 'trendy', 'budget', 'entry'],
  '25-40': ['premium', 'professional', 'women', 'wellness', 'lifestyle'],
  '25-45': ['mature', 'premium', 'couples', 'gift', 'lifestyle'],
  '28-50': ['male', 'wellness', 'health', 'mature'],
  '22-50': ['mass market', 'broad', 'daily', 'couples'],
};

const priceKeywords: Record<string, string[]> = {
  Entry: ['budget', 'entry', 'affordable', 'mass market', 'low price', 'value'],
  Mid: ['mid', 'mainstream', 'moderate', 'mid-range'],
  'Mid-Premium': ['mid-premium', 'premium mainstream', 'elevated'],
  Premium: ['premium', 'high-end', 'luxury'],
  Luxury: ['luxury', 'exclusive', 'high-ticket'],
};

const marketMapping: Record<string, string> = {
  'united states': 'US',
  us: 'US',
  usa: 'US',
  'united kingdom': 'UK',
  uk: 'UK',
  britain: 'UK',
  england: 'UK',
  europe: 'EU',
  eu: 'EU',
  australia: 'Australia',
  japan: 'Japan',
  korea: 'Korea',
  'southeast asia': 'Southeast Asia',
  'middle east': 'Middle East',
};

function detectKeywords(text: string, keywordMap: Record<string, string[]>): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const [key, words] of Object.entries(keywordMap)) {
    if (words.some((w) => lower.includes(w))) {
      matched.push(key);
    }
  }
  return matched;
}

function detectMarket(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, code] of Object.entries(marketMapping)) {
    if (lower.includes(key)) return code;
  }
  return 'Global';
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export function analyzeClient(input: ClientInput, lang: Lang): ClientProfile {
  const combined = [input.categories, input.website, input.socialLinks.join(' '), input.market || '', input.businessType || ''].join(' ');
  const lower = combined.toLowerCase();

  const detectedCategories = detectKeywords(combined, categoryKeywords);
  const detectedStyles = detectKeywords(combined, styleKeywords);
  const detectedAudiences = detectKeywords(combined, audienceKeywords);
  const detectedPrices = detectKeywords(combined, priceKeywords);
  const market = input.market || detectMarket(combined);

  const categories = detectedCategories.length
    ? detectedCategories
    : ['FEMALE', 'COUPLES', 'WATER_BASED'];

  const brandPositioning = detectedStyles.includes('Luxury') || detectedStyles.includes('Premium')
    ? 'Premium intimate wellness brand'
    : detectedStyles.includes('Wellness') || detectedStyles.includes('Medical')
    ? 'Health & wellness intimate care brand'
    : 'Modern intimate lifestyle brand';

  const visualStyle = detectedStyles.length
    ? detectedStyles.slice(0, 3)
    : ['Minimal', 'Modern', 'Feminine'];

  const targetAudience = detectedAudiences.length ? detectedAudiences[0] : '25-40';
  const pricePosition = detectedPrices.length ? detectedPrices[0] : 'Mid';

  const portfolio = categories.map((cat, i) => ({
    category: cat,
    share: Math.max(15, 40 - i * 8),
  }));

  const opportunities: string[] = [];
  if (!categories.includes('WATER_BASED')) {
    opportunities.push('Missing Category: Water-based care products to complement hardware lineup');
  }
  if (!detectedPrices.includes('Premium') && !detectedPrices.includes('Luxury')) {
    opportunities.push('Price Gap: Limited premium tier; room for mid-premium to premium upgrade');
  }
  if (!categories.includes('COUPLES')) {
    opportunities.push('Functional Gap: Couples/interactive products underrepresented');
  }
  opportunities.push('Premium Opportunity: Add multifunctional flagship SKUs with higher margins');
  opportunities.push('New Category Opportunity: AI-enabled app-controlled devices for loyalty');

  const confidence: 'High' | 'Medium' | 'Low' = input.website && input.website.startsWith('http') ? 'High' : 'Medium';

  const name = input.website
    ? input.website.replace(/^https?:\/\//, '').split('/')[0].split('.').slice(-2).join('.')
    : lang === 'zh' ? '新客户' : 'New Client';

  return {
    id: generateId(),
    name,
    website: input.website,
    market,
    businessType: input.businessType || (lang === 'zh' ? '未指定' : 'Unspecified'),
    mainCategories: categories,
    brandPositioning,
    visualStyle,
    targetAudience,
    pricePosition,
    portfolio,
    opportunities,
    confidence,
  };
}

function calculateDimensionScores(product: Product, client: ClientProfile): DimensionScores {
  const categoryFit = client.mainCategories.includes(product.primary_category) ? 90 : 60;

  const audienceFit =
    product.target_age === client.targetAudience
      ? 95
      : product.target_segment.toLowerCase().includes(client.pricePosition.toLowerCase())
      ? 85
      : 70;

  const clientStyles = client.visualStyle.map((s) => s.toLowerCase());
  const brandFit = clientStyles.includes(product.design_style.toLowerCase())
    ? 95
    : clientStyles.some((s) => product.tags.map((t) => t.toLowerCase()).includes(s))
    ? 85
    : 70;

  const priceFit =
    product.price_level === client.pricePosition
      ? 95
      : Math.abs(
          ['Entry', 'Mid', 'Mid-Premium', 'Premium', 'Luxury'].indexOf(product.price_level) -
            ['Entry', 'Mid', 'Mid-Premium', 'Premium', 'Luxury'].indexOf(client.pricePosition as any)
        ) === 1
      ? 80
      : 55;

  const portfolioFit = client.mainCategories.includes(product.primary_category) ? 88 : 65;

  const marketFit = product.target_market.includes(client.market as any) ? 95 : client.market === 'Global' ? 85 : 60;

  return {
    categoryFit: Math.min(100, categoryFit + Math.floor(Math.random() * 6)),
    audienceFit: Math.min(100, audienceFit + Math.floor(Math.random() * 6)),
    brandFit: Math.min(100, brandFit + Math.floor(Math.random() * 6)),
    priceFit: Math.min(100, priceFit + Math.floor(Math.random() * 6)),
    portfolioFit: Math.min(100, portfolioFit + Math.floor(Math.random() * 6)),
    marketFit: Math.min(100, marketFit + Math.floor(Math.random() * 6)),
  };
}

function weightedFitScore(scores: DimensionScores): number {
  return Math.round(
    scores.categoryFit * 0.2 +
      scores.audienceFit * 0.2 +
      scores.brandFit * 0.15 +
      scores.priceFit * 0.15 +
      scores.portfolioFit * 0.15 +
      scores.marketFit * 0.15
  );
}

function calculatePotentialScore(product: Product, client: ClientProfile): number {
  const portfolioGap = client.mainCategories.includes(product.primary_category) ? 60 : 90;
  const marketOpportunity = product.target_market.includes(client.market as any) ? 90 : 70;
  const differentiation = product.ai_scores.functional_differentiation;
  const priceExpansion = ['Premium', 'Luxury'].includes(product.price_level) ? 85 : 70;
  const strategicValue = product.tags.includes('Strategic Product') ? 95 : 75;

  return Math.round(
    portfolioGap * 0.2 + marketOpportunity * 0.2 + differentiation * 0.2 + priceExpansion * 0.2 + strategicValue * 0.2
  );
}

function fitLabel(score: number, lang: Lang): string {
  if (score >= 90) return lang === 'zh' ? '高度匹配' : 'Excellent Match';
  if (score >= 80) return lang === 'zh' ? '强匹配' : 'Strong Match';
  if (score >= 70) return lang === 'zh' ? '潜力匹配' : 'Potential Match';
  if (score >= 60) return lang === 'zh' ? '一般匹配' : 'Moderate Match';
  return lang === 'zh' ? '低匹配' : 'Low Match';
}

function generateReason(
  product: Product,
  client: ClientProfile,
  scores: DimensionScores,
  lang: Lang
): { clientFact: string; productFact: string; businessReason: string } {
  const clientFact =
    lang === 'zh'
      ? `客户主营${client.mainCategories.join('、')}，目标市场为${client.market}，价格定位${client.pricePosition}。`
      : `The client focuses on ${client.mainCategories.join(', ')} with target market ${client.market} and a ${client.pricePosition} price position.`;

  const productFact =
    lang === 'zh'
      ? `${product.product_name_cn}属于${product.primary_category}品类，主打${product.key_selling_point_cn}。`
      : `${product.product_name_en} belongs to the ${product.primary_category} category, featuring ${product.key_selling_point_en}.`;

  const strongest = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const dimensionName = {
    categoryFit: lang === 'zh' ? '品类适配' : 'Category Fit',
    audienceFit: lang === 'zh' ? '用户适配' : 'Audience Fit',
    brandFit: lang === 'zh' ? '品牌风格适配' : 'Brand Fit',
    priceFit: lang === 'zh' ? '价格带适配' : 'Price Fit',
    portfolioFit: lang === 'zh' ? '产品线适配' : 'Portfolio Fit',
    marketFit: lang === 'zh' ? '市场潜力' : 'Market Fit',
  }[strongest];

  const businessReason =
    lang === 'zh'
      ? `最强维度为${dimensionName}（${scores[strongest as keyof DimensionScores]} 分）。${product.short_name} 可补充客户当前${client.mainCategories[0]}产品结构，同时与${client.brandPositioning}保持一致，具备良好的商业拓展空间。`
      : `The strongest dimension is ${dimensionName} (${scores[strongest as keyof DimensionScores]}). ${product.short_name} complements the client's current ${client.mainCategories[0]} portfolio while aligning with ${client.brandPositioning}, offering solid commercial expansion potential.`;

  return { clientFact, productFact, businessReason };
}

export function generateRecommendations(client: ClientProfile, lang: Lang): Recommendation[] {
  const scored = products.map((product) => {
    const dimensionScores = calculateDimensionScores(product, client);
    const fitScore = weightedFitScore(dimensionScores);
    const potentialScore = calculatePotentialScore(product, client);
    const reason = generateReason(product, client, dimensionScores, lang);

    let type: Recommendation['type'] = 'Product Line Expansion';
    if (fitScore >= 85) type = 'Best Match';
    else if (potentialScore >= 85) type = 'Growth Opportunity';
    else if (product.tags.includes('Strategic Product')) type = 'Strategic Product';

    return {
      product_id: product.product_id,
      product,
      fitScore,
      potentialScore,
      dimensionScores,
      reason,
      type,
    };
  });

  return scored.sort((a, b) => b.fitScore - a.fitScore);
}

export { fitLabel };
