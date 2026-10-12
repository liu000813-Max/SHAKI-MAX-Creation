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

/**
 * Some Product Master taxonomy fields pack both languages into one string, separated by " / "
 * (e.g. "吸吮类 / Suction Devices", "BDSM套装 / BDSM Sets"). Printing the raw value puts Chinese
 * into English sentences and vice versa, so split it and hand each language its own half.
 * Values that are not in the paired format (e.g. PM free-text) pass through unchanged.
 */
export function localizeBilingual(value: string | undefined | null, lang: Lang): string {
  if (!value) return '';
  const parts = value.split(' / ');
  if (parts.length < 2) return value;
  return (lang === 'zh' ? parts[0] : parts[parts.length - 1]).trim();
}
