'use client';

import { SlidersHorizontal } from 'lucide-react';
import FilterPanel, { type FilterPanelProps } from './FilterPanel';

interface FilterSidebarProps extends FilterPanelProps {
  activeCount: number;
  onClearAll: () => void;
}

/** Panel lateral fijo (solo desktop ≥ lg) */
export default function FilterSidebar({ activeCount, onClearAll, ...panel }: FilterSidebarProps) {
  return (
    <aside className="hidden lg:block w-64 flex-shrink-0">
      <div className="sticky top-24 bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-lg shadow-black/20 max-h-[calc(100vh-7rem)] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-800/80">
          <h2 className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-wider">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            Filtros
          </h2>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-bold text-slate-400 hover:text-rose-400 uppercase tracking-wider transition"
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
