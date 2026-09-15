'use client';

import { useState } from 'react';
import Link from 'next/link';
import { products, categoryNames, productStatusNames, priceLevelNames } from '@/lib/data/products';
import { useAppState } from '@/components/ClientProvider';
import { t } from '@/lib/i18n';
import { Search, Package, ArrowRight } from 'lucide-react';
import { ProductStatus } from '@/lib/types';
import { localizeProductField } from '@/lib/utils';

const statusFilters = ['All', 'Active', 'New', 'Best Seller', 'Coming Soon', 'Strategic'];

export default function LibraryPage() {
  const { lang } = useAppState();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const filtered = products.filter((p) => {
    const matchesQuery =
      query === '' ||
      p.sku.toLowerCase().includes(query.toLowerCase()) ||
      p.product_name_en.toLowerCase().includes(query.toLowerCase()) ||
      p.product_name_cn.includes(query);
    const matchesStatus = statusFilter === 'All' || p.product_status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-shaki-deep">{t('productLibrary', lang)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {lang === 'zh' ? `${products.length} 款 SHAKI 产品` : `${products.length} SHAKI products`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search', lang)}
              className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 focus:border-shaki-purple focus:ring-2 focus:ring-shaki-purple/20 outline-none text-sm w-48"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {statusFilters.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              statusFilter === status
                ? 'bg-shaki-purple text-white border-shaki-purple'
                : 'bg-white border-gray-200 text-gray-600 hover:border-shaki-purple'
            }`}
          >
            {status === 'All' ? t('allProducts', lang) : productStatusNames[status as ProductStatus]?.[lang] || status}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((product) => (
          <div
            key={product.product_id}
            className="bg-white rounded-2xl border border-shaki-lavender shadow-sm p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-shaki-soft flex items-center justify-center flex-shrink-0">
                <Package className="w-7 h-7 text-shaki-purple/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-1">{categoryNames[product.primary_category]?.[lang]}</p>
                <h3 className="font-semibold text-shaki-deep truncate">
                  {localizeProductField(product, lang, 'product_name')}
                </h3>
                <p className="text-xs text-gray-400 mt-1">{product.sku}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-1 bg-shaki-soft text-shaki-purple text-xs rounded-md font-medium">
                {productStatusNames[product.product_status]?.[lang]}
              </span>
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md font-medium">
                {priceLevelNames[product.price_level]?.[lang]}
              </span>
            </div>
            <p className="text-sm text-gray-600 line-clamp-2 mb-4">
              {localizeProductField(product, lang, 'short_description')}
            </p>
            <Link
              href={`/product/${product.product_id}`}
              className="inline-flex items-center gap-1 text-sm text-shaki-purple hover:underline"
            >
              {t('viewProduct', lang)}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-gray-500 bg-white rounded-2xl border border-shaki-lavender">
          {t('noData', lang)}
        </div>
      )}
    </div>
  );
}
