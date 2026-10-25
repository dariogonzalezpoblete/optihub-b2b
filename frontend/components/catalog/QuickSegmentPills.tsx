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
  // Determina cuál segmento está activo (si las marcas seleccionadas coinciden con las del segmento)
  const activeSegmentId = BRAND_SEGMENTS.find((seg) => {
    if (selectedBrands.length === 0) return false;
    const segNormalized = seg.brands.map(normalizeText);
    return selectedBrands.some(sb => segNormalized.includes(normalizeText(sb)));
  })?.id;

  const isAll = selectedBrands.length === 0;

  return (
    <div className="w-full pb-2 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 min-w-max py-1">
        {/* Píldora: Todos */}
        <button
          type="button"
          onClick={onClear}
          className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 border ${
            isAll
              ? 'bg-[#111111] text-white border-[#111111] shadow-xs'
              : 'bg-[#FFFFFF] text-[#575551] border-[#E5E4DF] hover:text-[#111111] hover:border-[#B89768]/60 hover:bg-[#FAF9F6]'
          }`}
        >
          <span>🌐</span>
          <span>Todo el Catálogo</span>
        </button>

        {/* Píldoras por segmento */}
        {BRAND_SEGMENTS.map((seg) => {
          const isActive = activeSegmentId === seg.id;
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => onSelectSegment(seg.brands)}
              className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 border ${
                isActive
                  ? 'bg-[#F7F3EB] text-[#9E7D4F] border-[#B89768] shadow-xs'
                  : 'bg-[#FFFFFF] text-[#575551] border-[#E5E4DF] hover:text-[#111111] hover:border-[#B89768]/60 hover:bg-[#FAF9F6]'
              }`}
              title={seg.description}
            >
              <span>{seg.icon}</span>
              <span>{seg.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
