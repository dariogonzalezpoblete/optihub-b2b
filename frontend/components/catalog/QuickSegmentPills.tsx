'use client';

import React from 'react';
import { BRAND_SEGMENTS } from '@/lib/catalog/brandCategories';
import { normalizeText } from '@/lib/catalog/normalize';

interface QuickSegmentPillsProps {
  selectedBrands: string[];
  onSelectSegment: (brands: string[]) => void;
  onClear: () => void;
}

export default function QuickSegmentPills({
  selectedBrands,
  onSelectSegment,
  onClear
}: QuickSegmentPillsProps) {
  const activeSegmentId = BRAND_SEGMENTS.find((seg) => {
    if (selectedBrands.length === 0) return false;
    const segNormalized = seg.brands.map(normalizeText);
    return selectedBrands.some(sb => segNormalized.includes(normalizeText(sb)));
  })?.id;

  const isAll = selectedBrands.length === 0;

  return (
    <div className="w-full pb-2 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 min-w-max py-1">
        {/* Pestaña rectangular: Todo el Catálogo */}
        <button
          type="button"
          onClick={onClear}
          className={`border px-4 py-2 text-[11px] uppercase tracking-[0.14em] font-medium transition-all rounded-none cursor-pointer ${
            isAll
              ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
              : 'bg-[#FFFFFF] text-[#5C5A55] border-[#E6E2DD] hover:text-[#0F0F0F] hover:border-[#0F0F0F]'
          }`}
        >
          Todo el Catálogo
        </button>

        {/* Pestañas rectangulares por segmento */}
        {BRAND_SEGMENTS.map((seg) => {
          const isActive = activeSegmentId === seg.id;
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => onSelectSegment(seg.brands)}
              className={`border px-4 py-2 text-[11px] uppercase tracking-[0.14em] font-medium transition-all rounded-none cursor-pointer ${
                isActive
                  ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                  : 'bg-[#FFFFFF] text-[#5C5A55] border-[#E6E2DD] hover:text-[#0F0F0F] hover:border-[#0F0F0F]'
              }`}
              title={seg.description}
            >
              {seg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
