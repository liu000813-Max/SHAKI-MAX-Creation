import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Lang } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const suffixFor = (lang: Lang) => (lang === 'zh' ? 'cn' : 'en');

export function localizeProductField<T extends Record<string, any>>(
  obj: T,
  lang: Lang,
  field: 'product_name' | 'description' | 'short_description' | 'key_selling_point'
): string {
  const suffix = suffixFor(lang);
  return (obj[`${field}_${suffix}` as keyof T] as string) || '';
}
