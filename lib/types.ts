export type Lang = 'zh' | 'en';

export type CategoryCode = 'FEMALE' | 'MALE' | 'COUPLES' | 'BDSM' | 'WATER_BASED';

export type ProductStatus =
  | 'Draft'
  | 'Active'
  | 'New'
  | 'Best Seller'
  | 'Strategic'
  | 'Seasonal'
  | 'Discontinued'
  | 'Coming Soon';

export type PriceLevel = 'Entry' | 'Mid' | 'Mid-Premium' | 'Premium' | 'Luxury';

export type MarketCode =
  | 'US'
  | 'UK'
  | 'EU'
  | 'Australia'
  | 'Japan'
  | 'Korea'
  | 'Southeast Asia'
  | 'Middle East'
  | 'Global';

export type BusinessType =
  | 'Brand'
  | 'Distributor'
  | 'Retailer'
  | 'Wholesaler'
  | 'E-commerce'
  | 'Amazon Seller'
  | 'Chain Store'
  | 'Boutique'
  | 'OEM/ODM Buyer';

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface Product {
  product_id: string;
  sku: string;
  product_name_cn: string;
  product_name_en: string;
  short_name: string;
  series_name: string;
  product_status: ProductStatus;
  launch_date?: string;
  primary_category: CategoryCode;
  secondary_category: string;
  tertiary_category?: string;
  description_cn: string;
  description_en: string;
  short_description_cn: string;
  short_description_en: string;
  key_selling_point_cn: string;
  key_selling_point_en: string;
  primary_function: string;
  secondary_functions: string[];
  target_gender: string;
  target_age: string;
  target_segment: string;
  design_style: string;
  visual_style: string;
  main_material: string;
  product_length?: string;
  product_width?: string;
  product_height?: string;
  net_weight?: string;
  mode_count?: string;
  control_type?: string;
  battery_type?: string;
  battery_capacity?: string;
  charging_type?: string;
  waterproof_rating?: string;
  noise_level?: string;
  packaging_type?: string;
  price_level: PriceLevel;
  wholesale_price?: number;
  suggested_retail_price?: number;
  moq?: string;
  sample_price?: number;
  lead_time?: string;
  target_market: MarketCode[];
  oem_available: boolean;
  odm_available: boolean;
  custom_moq?: string;
  custom_lead_time?: string;
  hero_image?: string;
  tags: string[];
  ai_scores: {
    product_quality: number;
    design_value: number;
    functional_differentiation: number;
    commercial_potential: number;
    market_adaptability: number;
    brand_value: number;
    total: number;
  };
  commercial: {
    margin_level?: string;
    stock_status?: string;
    production_capacity?: string;
  };
}

export interface ClientInput {
  categories: string;
  website: string;
  socialLinks: string[];
  market?: string;
  businessType?: string;
  goal?: string;
}

export interface ClientProfile {
  id: string;
  name: string;
  website: string;
  market: string;
  businessType: string;
  mainCategories: string[];
  brandPositioning: string;
  visualStyle: string[];
  targetAudience: string;
  pricePosition: string;
  portfolio: { category: string; share: number }[];
  opportunities: string[];
  confidence: 'High' | 'Medium' | 'Low';
}

export interface DimensionScores {
  categoryFit: number;
  audienceFit: number;
  brandFit: number;
  priceFit: number;
  portfolioFit: number;
  marketFit: number;
}

export interface Recommendation {
  product_id: string;
  product: Product;
  fitScore: number;
  potentialScore: number;
  dimensionScores: DimensionScores;
  reason: {
    clientFact: string;
    productFact: string;
    businessReason: string;
  };
  type: 'Best Match' | 'Growth Opportunity' | 'Product Line Expansion' | 'Strategic Product';
}

export interface Proposal {
  id: string;
  clientId: string;
  clientName: string;
  companyName?: string;
  language: Lang;
  products: Recommendation[];
  type: 'Single Product' | 'Product Collection' | 'Product Line Proposal';
  status: 'Draft' | 'Sent' | 'Viewed' | 'Interested' | 'Sample Requested' | 'Negotiating' | 'Won' | 'Lost';
  createdAt: string;
  updatedAt: string;
  shareUrl?: string;
}
