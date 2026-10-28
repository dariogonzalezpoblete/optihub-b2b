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
      {/* Chip de Tipo / Línea */}
      {state.tipo && (
        <button
          type="button"
          onClick={() => (onRemoveTipo ? onRemoveTipo() : onClearAll())}
          className="group inline-flex items-center gap-1.5 bg-[#FFFFFF] border border-[#0F0F0F] text-[#0F0F0F] text-[11px] font-medium pl-3 pr-2 py-1 transition rounded-none cursor-pointer"
          title="Quitar filtro de línea"
        >
          <span className="text-[#9E8256] uppercase tracking-wider text-[10px]">Línea:</span> {state.tipo === 'optico' ? 'Monturas Ópticas' : 'Gafas de Sol'}
          <X className="w-3 h-3 text-[#5C5A55] group-hover:text-[#0F0F0F]" />
        </button>
      )}

      {state.q.trim() && (
        <button
          type="button"
          onClick={onClearQuery}
          className="group inline-flex items-center gap-1.5 bg-[#FFFFFF] border border-[#0F0F0F] text-[#0F0F0F] text-[11px] font-medium pl-3 pr-2 py-1 transition rounded-none cursor-pointer"
        >
          <span className="text-[#9E8256] uppercase tracking-wider text-[10px]">Búsqueda:</span> “{state.q.trim()}”
          <X className="w-3 h-3 text-[#5C5A55] group-hover:text-[#0F0F0F]" />
        </button>
      )}

      {chips.map((c) => (
        <button
          key={`${c.facet}-${c.key}`}
          type="button"
          onClick={() => onRemove(c.facet, c.key)}
          className="group inline-flex items-center gap-1.5 bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#0F0F0F] text-[#0F0F0F] text-[11px] font-medium pl-3 pr-2 py-1 transition rounded-none cursor-pointer"
        >
          <span className="text-[#787670] text-[10px] uppercase tracking-wider">{FACET_TITLES[c.facet]}:</span> {c.label}
          <X className="w-3 h-3 text-[#787670] group-hover:text-[#0F0F0F]" />
        </button>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="text-[10px] font-semibold text-[#787670] hover:text-[#0F0F0F] px-2 py-1 transition tracking-[0.16em] uppercase cursor-pointer"
      >
        Limpiar todo
      </button>
    </div>
  );
}
