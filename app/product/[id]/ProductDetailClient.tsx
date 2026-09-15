'use client';

import Link from 'next/link';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { ScoreRing } from '@/components/ScoreRing';
import { categoryNames, priceLevelNames, productStatusNames } from '@/lib/data/products';
import { Product } from '@/lib/types';
import { localizeProductField } from '@/lib/utils';
import { ArrowLeft, Package, Ruler, Zap, Globe, Factory, Clock, DollarSign, Award, CheckCircle2, Box } from 'lucide-react';

export default function ProductDetailClient({ product }: { product: Product }) {
  const { lang } = useAppState();

  const name = localizeProductField(product, lang, 'product_name');
  const desc = localizeProductField(product, lang, 'description');
  const short = localizeProductField(product, lang, 'short_description');
  const ksp = localizeProductField(product, lang, 'key_selling_point');

  const aiScore = product.ai_scores.total;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <Link href="/library" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-shaki-purple mb-6">
        <ArrowLeft className="w-4 h-4" />
        {t('productLibrary', lang)}
      </Link>

      <div className="grid lg:grid-cols-2 gap-8 mb-10">
        <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-8 flex items-center justify-center min-h-[360px]">
          <div className="text-center">
            <div className="w-40 h-40 mx-auto rounded-2xl bg-gradient-to-br from-shaki-soft to-white border border-shaki-lavender flex items-center justify-center mb-4">
              <Package className="w-16 h-16 text-shaki-purple/40" />
            </div>
            <p className="text-sm text-gray-400">{product.sku}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-shaki-soft text-shaki-purple text-xs rounded-full font-medium">
                {categoryNames[product.primary_category]?.[lang]}
              </span>
              <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                {productStatusNames[product.product_status]?.[lang]}
              </span>
            </div>
            <h1 className="text-3xl font-semibold text-shaki-deep mb-2">{name}</h1>
            <p className="text-gray-600">{short}</p>
          </div>

          <div className="flex items-center gap-6">
            <ScoreRing score={aiScore} label={t('sixDimensionScore', lang)} />
            <div className="flex-1">
              <p className="text-sm text-gray-500 mb-2">{t('productOverview', lang)}</p>
              <p className="text-sm text-gray-700 leading-relaxed">{desc}</p>
            </div>
          </div>

          <div className="bg-shaki-soft/50 rounded-xl p-5">
            <p className="text-sm font-medium text-shaki-deep mb-2">{t('keyFeatures', lang)}</p>
            <div className="flex flex-wrap gap-2">
              {ksp.split('｜').map((item) => (
                <span key={item} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-shaki-lavender rounded-lg text-sm text-gray-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-shaki-purple" />
                  {item.trim()}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Info label={t('moq', lang)} value={product.moq || '-'} icon={Box} />
            <Info label={t('leadTime', lang)} value={product.lead_time || '-'} icon={Clock} />
            <Info label={t('price', lang)} value={product.wholesale_price ? `$${product.wholesale_price}` : '-'} icon={DollarSign} />
            <Info label={t('targetMarket', lang)} value={product.target_market.join(', ')} icon={Globe} />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Section title={t('technicalSpecifications', lang)} icon={Zap}>
          <Spec label={t('category', lang)} value={categoryNames[product.primary_category]?.[lang]} />
          <Spec label={lang === 'zh' ? '核心功能' : 'Primary Function'} value={product.primary_function} />
          <Spec label={lang === 'zh' ? '模式数量' : 'Modes'} value={product.mode_count} />
          <Spec label={lang === 'zh' ? '控制方式' : 'Control'} value={product.control_type} />
          <Spec label={lang === 'zh' ? '电池类型' : 'Battery'} value={product.battery_type} />
          <Spec label={lang === 'zh' ? '充电方式' : 'Charging'} value={product.charging_type} />
          <Spec label={lang === 'zh' ? '防水等级' : 'Waterproof'} value={product.waterproof_rating} />
          <Spec label={lang === 'zh' ? '噪音' : 'Noise'} value={product.noise_level} />
        </Section>

        <Section title={lang === 'zh' ? '尺寸与材质' : 'Dimensions & Material'} icon={Ruler}>
          <Spec label={lang === 'zh' ? '长度' : 'Length'} value={product.product_length} />
          <Spec label={lang === 'zh' ? '宽度' : 'Width'} value={product.product_width} />
          <Spec label={lang === 'zh' ? '高度' : 'Height'} value={product.product_height} />
          <Spec label={lang === 'zh' ? '净重' : 'Net Weight'} value={product.net_weight} />
          <Spec label={lang === 'zh' ? '主要材质' : 'Main Material'} value={product.main_material} />
          <Spec label={lang === 'zh' ? '包装类型' : 'Packaging'} value={product.packaging_type} />
          <Spec label={t('pricePosition', lang)} value={priceLevelNames[product.price_level]?.[lang]} />
        </Section>

        <Section title={t('oemOdmCapability', lang)} icon={Factory}>
          <Spec label="OEM" value={product.oem_available ? (lang === 'zh' ? '支持' : 'Available') : (lang === 'zh' ? '不支持' : 'Not Available')} />
          <Spec label="ODM" value={product.odm_available ? (lang === 'zh' ? '支持' : 'Available') : (lang === 'zh' ? '不支持' : 'Not Available')} />
          <Spec label={lang === 'zh' ? '定制 MOQ' : 'Custom MOQ'} value={product.custom_moq} />
          <Spec label={lang === 'zh' ? '定制交期' : 'Custom Lead Time'} value={product.custom_lead_time} />
          <Spec label={lang === 'zh' ? '产能' : 'Capacity'} value={product.commercial.production_capacity} />
          <Spec label={lang === 'zh' ? '库存状态' : 'Stock Status'} value={product.commercial.stock_status} />
        </Section>
      </div>

      <div className="mt-8 bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-shaki-purple" />
          <h3 className="text-base font-semibold text-shaki-deep">{lang === 'zh' ? 'AI 产品评分' : 'AI Product Score'}</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <ScoreRing score={product.ai_scores.product_quality} label={lang === 'zh' ? '产品力' : 'Product Quality'} size={72} />
          <ScoreRing score={product.ai_scores.design_value} label={lang === 'zh' ? '设计价值' : 'Design Value'} size={72} />
          <ScoreRing score={product.ai_scores.functional_differentiation} label={lang === 'zh' ? '功能差异化' : 'Differentiation'} size={72} />
          <ScoreRing score={product.ai_scores.commercial_potential} label={lang === 'zh' ? '商业潜力' : 'Commercial Potential'} size={72} />
          <ScoreRing score={product.ai_scores.market_adaptability} label={lang === 'zh' ? '市场适应性' : 'Market Adaptability'} size={72} />
          <ScoreRing score={product.ai_scores.brand_value} label={lang === 'zh' ? '品牌价值' : 'Brand Value'} size={72} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-shaki-purple" />
        <h3 className="text-base font-semibold text-shaki-deep">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-shaki-lavender last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-shaki-deep text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-shaki-soft/50 rounded-xl">
      <Icon className="w-5 h-5 text-shaki-purple" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-shaki-deep">{value}</p>
      </div>
    </div>
  );
}
