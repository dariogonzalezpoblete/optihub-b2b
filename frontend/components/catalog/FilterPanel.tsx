'use client';

import type { FacetKey, Facets, FilterState } from '@/lib/catalog/types';
import FilterGroup from './FilterGroup';

export interface FilterPanelProps {
  facets: Facets;
  state: FilterState;
  onToggle: (facet: FacetKey, key: string) => void;
}

/** Contenido de filtros compartido entre el sidebar (desktop) y el drawer (mobile) */
export default function FilterPanel({ facets, state, onToggle }: FilterPanelProps) {
  return (
    <div>
      <FilterGroup
        title="Marca"
        options={facets.marca}
        selected={state.marca}
        onToggle={(k) => onToggle('marca', k)}
      />
      <FilterGroup
        title="Género"
        options={facets.genero}
        selected={state.genero}
        onToggle={(k) => onToggle('genero', k)}
      />
      <FilterGroup
        title="Material"
        options={facets.material}
        selected={state.material}
        onToggle={(k) => onToggle('material', k)}
        initialVisible={5}
      />
      <FilterGroup
        title="Forma"
        options={facets.forma}
        selected={state.forma}
        onToggle={(k) => onToggle('forma', k)}
        initialVisible={5}
      />
      <FilterGroup
        title="Calibre"
        subtitle="Ancho de lente en milímetros"
        variant="chips"
        options={facets.calibre}
        selected={state.calibre}
        onToggle={(k) => onToggle('calibre', k)}
      />
    </div>
  );
}
