'use client';

import { useEffect } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import FilterPanel, { type FilterPanelProps } from './FilterPanel';

interface FilterDrawerProps extends FilterPanelProps {
  open: boolean;
  onClose: () => void;
  resultCount: number;
  activeCount: number;
  onClearAll: () => void;
}

/** Drawer deslizable de filtros (solo mobile/tablet < lg) - Maison Editorial */
export default function FilterDrawer({
  open,
  onClose,
  resultCount,
  activeCount,
  onClearAll,
  ...panel
}: FilterDrawerProps) {
  // Bloquear scroll del body y cerrar con Esc
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div
      className={`lg:hidden fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Fondo */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-[#111111]/60 backdrop-blur-xs transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtros del catálogo"
        className={`absolute inset-y-0 left-0 w-[88%] max-w-sm bg-[#FFFFFF] border-r border-[#E5E4DF] shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E4DF]">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#111111] uppercase tracking-wider">
            <SlidersHorizontal className="w-4 h-4 text-[#B89768]" />
            Filtros
            {activeCount > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#111111] text-white text-[10px] font-tech font-bold flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#E5E4DF] hover:bg-[#FFFFFF] text-[#575551] flex items-center justify-center transition"
            aria-label="Cerrar filtros"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 scrollbar-thin">
          <FilterPanel {...panel} />
        </div>

        <div className="p-4 border-t border-[#E5E4DF] flex gap-3 bg-[#FFFFFF]">
          <button
            type="button"
            onClick={onClearAll}
            disabled={activeCount === 0}
            className="btn-secondary flex-1 !py-3 !text-xs"
          >
            Limpiar
          </button>
          <button type="button" onClick={onClose} className="btn-primary flex-[2] !py-3 !text-xs">
            Ver {resultCount} {resultCount === 1 ? 'resultado' : 'resultados'}
          </button>
        </div>
      </div>
    </div>
  );
}
