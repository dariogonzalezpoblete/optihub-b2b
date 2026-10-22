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
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border ${
            isAll
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
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
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/10'
                  : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700 hover:bg-slate-850'
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
