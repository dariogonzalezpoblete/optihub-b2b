'use client';

import { X } from 'lucide-react';
import { FACET_KEYS, type FacetKey, type Facets, type FilterState } from '@/lib/catalog/types';

const FACET_TITLES: Record<FacetKey, string> = {
  marca: 'Marca',
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
}

export default function ActiveFilterChips({
  state,
  facets,
  onRemove,
  onClearQuery,
  onClearAll,
}: ActiveFilterChipsProps) {
  const chips = FACET_KEYS.flatMap((f) =>
    state[f].map((key) => ({
      facet: f,
      key,
      label: facets[f]?.find((o) => o.key === key)?.label ?? key,
    }))
  );

  if (!chips.length && !state.q.trim()) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 animate-fade-in">
      {state.q.trim() && (
        <button
          type="button"
          onClick={onClearQuery}
          className="group inline-flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold pl-3 pr-2 py-1.5 rounded-full hover:border-sky-400/60 transition"
        >
          <span className="text-sky-400/70">Búsqueda:</span> “{state.q.trim()}”
          <X className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
        </button>
      )}

      {chips.map((c) => (
        <button
          key={`${c.facet}-${c.key}`}
          type="button"
          onClick={() => onRemove(c.facet, c.key)}
          className="group inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold pl-3 pr-2 py-1.5 rounded-full hover:border-emerald-400/60 transition"
        >
          <span className="text-emerald-400/60">{FACET_TITLES[c.facet]}:</span> {c.label}
          <X className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
        </button>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-bold text-slate-400 hover:text-rose-400 px-2 py-1.5 transition"
      >
        Limpiar todo
      </button>
    </div>
  );
}
