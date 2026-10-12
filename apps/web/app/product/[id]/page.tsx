import Link from 'next/link';
import { products, categoryNames, productStatusNames, priceLevelNames } from '@/lib/data/products';
import ProductDetailClient from './ProductDetailClient';

export function generateStaticParams() {
  return products.map((p) => ({ id: p.product_id }));
}

export function generateMetadata({ params }: { params: { id: string } }) {
  const product = products.find((p) => p.product_id === params.id);
  return {
    title: product ? `${product.product_name_en} | SHAKI AI` : 'Product Detail',
  };
}

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const product = products.find((p) => p.product_id === params.id);

  if (!product) {
    // Unreachable in the shipped build: `generateStaticParams` enumerates every product, and a
    // static export serves the 404 page for ids it never generated. It is kept as a guard, and it
    // is a *server* component, so it cannot read the client language toggle — hence both languages
    // are printed rather than one hard-coded English sentence (PRD §18).
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center text-gray-500">
        <p>Product not found / 未找到该产品</p>
        <Link href="/catalog" className="text-shaki-purple hover:underline mt-2 inline-block">
          Product Library / 产品库
        </Link>
      </div>
    );
  }

  return <ProductDetailClient product={product} />;
}
