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
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center text-gray-500">
        <p>Product not found</p>
        <Link href="/library" className="text-shaki-purple hover:underline mt-2 inline-block">
          Product Library
        </Link>
      </div>
    );
  }

  return <ProductDetailClient product={product} />;
}
