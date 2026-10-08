'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FACET_KEYS, SORT_KEYS, type FacetKey, type FilterState, type SortKey } from '@/lib/catalog/types';
import { normalizeText } from '@/lib/catalog/normalize';

function parseList(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map(normalizeText).filter(Boolean))];
}

/**
 * Estado de filtros del catálogo sincronizado con la URL.
 * Ej: /catalogo?marca=zeiss,nike&material=titanium&calibre=5456&q=zs22
 * Acepta formatos antiguos como ?marca=NIKE o ?marca=Hugo Boss.
 */
export function useCatalogFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = useMemo<FilterState>(() => {
    const sortParam = searchParams.get('sort') as SortKey | null;
    return {
      q: searchParams.get('q') ?? '',
      marca: parseList(searchParams.get('marca')),
      genero: parseList(searchParams.get('genero')),
      material: parseList(searchParams.get('material')),
      forma: parseList(searchParams.get('forma')),
      calibre: parseList(searchParams.get('calibre')),
      sort: sortParam && SORT_KEYS.includes(sortParam) ? sortParam : 'relevancia',
    };
  }, [searchParams]);

  const commit = useCallback(
    (next: FilterState) => {
      const params = new URLSearchParams();
      if (next.q.trim()) params.set('q', next.q.trim());
      for (const f of FACET_KEYS) {
        if (next[f].length) params.set(f, next[f].join(','));
      }
      if (next.sort !== 'relevancia') params.set('sort', next.sort);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  const toggle = useCallback(
    (facet: FacetKey, key: string) => {
      const current = state[facet];
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      commit({ ...state, [facet]: next });
    },
    [state, commit]
  );

  const setQuery = useCallback((q: string) => commit({ ...state, q }), [state, commit]);
  const setSort = useCallback((sort: SortKey) => commit({ ...state, sort }), [state, commit]);

  const clearAll = useCallback(
    () =>
      commit({ q: '', marca: [], genero: [], material: [], forma: [], calibre: [], sort: state.sort }),
    [state.sort, commit]
  );

  return { state, toggle, setQuery, setSort, clearAll };
}
