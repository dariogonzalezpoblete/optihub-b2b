'use client';

import { SlidersHorizontal } from 'lucide-react';
import FilterPanel, { type FilterPanelProps } from './FilterPanel';

interface FilterSidebarProps extends FilterPanelProps {
  activeCount: number;
  onClearAll: () => void;
}

/** Panel lateral fijo (solo desktop ≥ lg) - Maison Editorial */
export default function FilterSidebar({ activeCount, onClearAll, ...panel }: FilterSidebarProps) {
  return (
    <aside className="hidden lg:block w-64 flex-shrink-0">
      <div className="sticky top-24 bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl shadow-xs max-h-[calc(100vh-7rem)] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#E5E4DF]">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#111111] uppercase tracking-wider">
            <SlidersHorizontal className="w-4 h-4 text-[#B89768]" />
            Filtros
          </h2>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-bold text-[#82807A] hover:text-[#C0392B] uppercase tracking-wider transition"
            >
              Limpiar ({activeCount})
            </button>
          )}
        </div>
        <div className="px-5 overflow-y-auto scrollbar-thin">
          <FilterPanel {...panel} />
        </div>
      </div>
    </aside>
  );
}
