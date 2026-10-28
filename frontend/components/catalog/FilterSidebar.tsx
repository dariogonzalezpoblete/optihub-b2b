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
      <div className="sticky top-28 bg-[#FFFFFF] border border-[#E6E2DD] max-h-[calc(100vh-8rem)] flex flex-col rounded-none">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#E6E2DD]">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold text-[#0F0F0F] uppercase tracking-[0.18em]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#9E8256]" />
            Filtros
          </h2>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[10px] font-semibold text-[#787670] hover:text-[#0F0F0F] uppercase tracking-[0.16em] transition cursor-pointer"
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
