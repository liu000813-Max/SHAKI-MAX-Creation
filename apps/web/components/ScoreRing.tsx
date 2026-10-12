'use client';

import { SCORE_BAND_STYLE, scoreBand } from '@/components/scoreBand';

export function ScoreRing({ score, size = 72, stroke = 6, label, sublabel }: { score: number; size?: number; stroke?: number; label?: string; sublabel?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  // Band colour from config + the shared style map, so this ring agrees with the badges and bars.
  const color = SCORE_BAND_STYLE[scoreBand(score).key].hex;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#E9E1F7" strokeWidth={stroke} fill="transparent" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-shaki-deep">{score}</span>
        </div>
      </div>
      {label && <p className="text-sm font-medium text-shaki-deep mt-2 text-center">{label}</p>}
      {sublabel && <p className="text-xs text-gray-500 text-center">{sublabel}</p>}
    </div>
  );
}
