'use client';

export function FitBadge({ score }: { score: number }) {
  let colorClass = 'bg-red-50 text-red-700 border-red-100';
  let label = 'Low Match';
  if (score >= 90) {
    colorClass = 'bg-purple-50 text-shaki-purple border-purple-100';
    label = 'Excellent';
  } else if (score >= 80) {
    colorClass = 'bg-green-50 text-green-700 border-green-100';
    label = 'Strong';
  } else if (score >= 70) {
    colorClass = 'bg-amber-50 text-amber-700 border-amber-100';
    label = 'Potential';
  } else if (score >= 60) {
    colorClass = 'bg-orange-50 text-orange-700 border-orange-100';
    label = 'Moderate';
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {label} · {score}
    </span>
  );
}
