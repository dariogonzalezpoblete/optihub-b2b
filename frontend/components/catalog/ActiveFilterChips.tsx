'use client';

import { X } from 'lucide-react';
import { FACET_KEYS, type FacetKey, type Facets, type FilterState } from '@/lib/catalog/types';

const FACET_TITLES: Record<FacetKey, string> = {
  marca: 'Marca',
  color: 'Color',
  genero: 'Género',
  material: 'Material',
  forma: 'Forma',
  calibre: 'Calibre',
};

interface ActiveFilterChipsProps {
  state: FilterState;
  facets: Facets;
  onRemove: (facet: FacetKey, key: string) => void;
  onClearQuery: () => void;
  onClearAll: () => void;
  onRemoveTipo?: () => void;
}

export default function ActiveFilterChips({
  state,
  facets,
  onRemove,
  onClearQuery,
  onClearAll,
  onRemoveTipo,
}: ActiveFilterChipsProps) {
  const chips = FACET_KEYS.flatMap((f) =>
    state[f].map((key) => ({
      facet: f,
      key,
      label: facets[f]?.find((o) => o.key === key)?.label ?? key,
    }))
  );

  if (!chips.length && !state.q.trim() && !state.tipo) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 animate-fade-in">
      {/* Chip de Tipo / Línea (Monturas Ópticas vs Gafas de Sol) */}
      {state.tipo && (
        <button
          type="button"
          onClick={() => (onRemoveTipo ? onRemoveTipo() : onClearAll())}
          className="group inline-flex items-center gap-1.5 bg-[#F7F3EB] border border-[#B89768]/50 text-[#9E7D4F] text-xs font-semibold pl-3 pr-2 py-1.5 rounded-full hover:border-[#B89768] transition shadow-2xs"
          title="Quitar filtro de línea"
        >
          <span className="text-[#B89768]">Línea:</span> {state.tipo === 'optico' ? 'Monturas Ópticas' : 'Gafas de Sol'}
          <X className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
        </button>
      )}

      {state.q.trim() && (
        <button
          type="button"
          onClick={onClearQuery}
          className="group inline-flex items-center gap-1.5 bg-[#F7F3EB] border border-[#B89768]/50 text-[#9E7D4F] text-xs font-semibold pl-3 pr-2 py-1.5 rounded-full hover:border-[#B89768] transition"
        >
          <span className="text-[#B89768]">Búsqueda:</span> “{state.q.trim()}”
          <X className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
        </button>
      )}

      {chips.map((c) => (
        <button
          key={`${c.facet}-${c.key}`}
          type="button"
          onClick={() => onRemove(c.facet, c.key)}
          className="group inline-flex items-center gap-1.5 bg-[#FFFFFF] border border-[#E5E4DF] text-[#111111] text-xs font-medium pl-3 pr-2 py-1.5 rounded-full hover:border-[#B89768] hover:bg-[#FAF9F6] transition shadow-2xs"
        >
          <span className="text-[#82807A] text-[11px] uppercase tracking-wider">{FACET_TITLES[c.facet]}:</span> {c.label}
          <X className="w-3.5 h-3.5 text-[#82807A] group-hover:text-[#111111]" />
        </button>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-bold text-[#82807A] hover:text-[#C0392B] px-2 py-1.5 transition tracking-wider uppercase"
      >
        Limpiar todo
      </button>
    </div>
  );
}
