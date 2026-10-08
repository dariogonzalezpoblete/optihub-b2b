import {
  FACET_KEYS,
  type EnrichedMarco,
  type FacetKey,
  type FacetOption,
  type Facets,
  type FilterState,
  type Marco,
} from './types';
import { CALIBRE_RANGES, calibreRangeKey, labelFor, normalizeText, parseTamano } from './normalize';

// ---------------------------------------------------------------------------
// Enriquecimiento (se ejecuta una sola vez al cargar el catálogo)
// ---------------------------------------------------------------------------

export function enrichMarcos(list: Marco[]): EnrichedMarco[] {
  return list.map((m) => {
    const dims = parseTamano(m.tamano);
    return {
      ...m,
      _dims: dims,
      _k: {
        marca: normalizeText(m.marca),
        genero: normalizeText(m.genero),
        material: normalizeText(m.material),
        forma: normalizeText(m.forma),
        calibre: dims ? calibreRangeKey(dims.calibre) : '',
      },
      _search: [m.marca, m.modelo, m.id_ext, m.codigo_color, m.color, m.upc]
        .map(normalizeText)
        .join('|'),
    };
  });
}

/** Quita los campos internos antes de guardar en el carrito */
export function stripEnriched(m: EnrichedMarco): Marco {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _k, _search, _dims, ...base } = m;
  return base;
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

export function queryTokens(q: string): string[] {
  return q.split(/\s+/).map(normalizeText).filter(Boolean);
}

function matchesQuery(m: EnrichedMarco, tokens: string[]): boolean {
  return tokens.every((t) => m._search.includes(t));
}

function relevance(m: EnrichedMarco, tokens: string[]): number {
  if (!tokens.length) return 0;
  const sku = normalizeText(m.id_ext);
  const modelo = normalizeText(m.modelo);
  return tokens.reduce((score, t) => {
    if (sku === t || modelo === t) return score + 4;
    if (sku.startsWith(t)) return score + 3;
    if (modelo.startsWith(t)) return score + 2;
    return score + 1;
  }, 0);
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

function matchesFacets(m: EnrichedMarco, state: FilterState, exclude?: FacetKey): boolean {
  for (const f of FACET_KEYS) {
    if (f === exclude) continue;
    const selected = state[f];
    if (selected.length && !selected.includes(m._k[f])) return false;
  }
  return true;
}

export function applyFilters(
  list: EnrichedMarco[],
  state: FilterState,
  canSeePrices: boolean
): EnrichedMarco[] {
  const tokens = queryTokens(state.q);
  const filtered = list.filter((m) => matchesQuery(m, tokens) && matchesFacets(m, state));

  const sort = !canSeePrices && state.sort.startsWith('precio') ? 'relevancia' : state.sort;
  const sorted = [...filtered];

  switch (sort) {
    case 'stock':
      sorted.sort((a, b) => (b.stock || 0) - (a.stock || 0));
      break;
    case 'precio-asc':
      sorted.sort((a, b) => (a.precio_neto_clp || 0) - (b.precio_neto_clp || 0));
      break;
    case 'precio-desc':
      sorted.sort((a, b) => (b.precio_neto_clp || 0) - (a.precio_neto_clp || 0));
      break;
    case 'modelo':
      sorted.sort((a, b) => `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`, 'es'));
      break;
    case 'relevancia':
    default:
      if (tokens.length) sorted.sort((a, b) => relevance(b, tokens) - relevance(a, tokens));
  }
  return sorted;
}

/**
 * Conteos dinámicos: cada opción muestra cuántos resultados quedarían al marcarla,
 * considerando la búsqueda y todos los demás filtros activos (excepto su propio grupo).
 */
export function getFacets(list: EnrichedMarco[], state: FilterState): Facets {
  const tokens = queryTokens(state.q);
  const base = tokens.length ? list.filter((m) => matchesQuery(m, tokens)) : list;

  const result = {} as Facets;

  for (const f of FACET_KEYS) {
    const labels = new Map<string, string>();
    const counts = new Map<string, number>();

    // Todas las opciones existentes en el catálogo completo (para que no "desaparezcan")
    for (const m of list) {
      const key = m._k[f];
      if (!key || labels.has(key)) continue;
      labels.set(key, labelFor(f, f === 'calibre' ? key : String(m[f as keyof Marco] ?? '')));
      counts.set(key, 0);
    }

    for (const m of base) {
      const key = m._k[f];
      if (key && matchesFacets(m, state, f)) counts.set(key, (counts.get(key) || 0) + 1);
    }

    let options: FacetOption[] = [...labels.entries()].map(([key, label]) => ({
      key,
      label,
      count: counts.get(key) || 0,
    }));

    if (f === 'calibre') {
      // Orden fijo de menor a mayor + texto secundario
      options = CALIBRE_RANGES.filter((r) => labels.has(r.key)).map((r) => ({
        key: r.key,
        label: r.label,
        hint: r.hint,
        count: counts.get(r.key) || 0,
      }));
    } else if (f === 'genero') {
      const order = ['men', 'women', 'unisex'];
      options.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    } else {
      options.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
    }

    result[f] = options;
  }

  return result;
}

export function countActiveFilters(state: FilterState): number {
  return FACET_KEYS.reduce((sum, f) => sum + state[f].length, 0);
}

// ---------------------------------------------------------------------------
// Sugerencias del buscador predictivo
// ---------------------------------------------------------------------------

export function searchSuggestions(list: EnrichedMarco[], input: string, limit = 6) {
  const tokens = queryTokens(input);
  if (!tokens.length) return { items: [] as EnrichedMarco[], total: 0 };
  const matches = list.filter((m) => matchesQuery(m, tokens));
  matches.sort((a, b) => relevance(b, tokens) - relevance(a, tokens));
  return { items: matches.slice(0, limit), total: matches.length };
}
