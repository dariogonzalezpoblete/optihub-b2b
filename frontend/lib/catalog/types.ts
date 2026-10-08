// Tipos compartidos del módulo de catálogo OptiHub B2B

export interface Marco {
  id?: number;
  id_ext: string;
  marca: string;
  modelo: string;
  color: string;
  codigo_color: string;
  genero: string;
  forma: string;
  material: string;
  tamano: string;
  upc: string;
  origen: string;
  stock: number;
  precio_usd: number;
  precio_bruto_clp: number;
  precio_neto_clp: number;
  ganancia_clp: number;
  imagen_principal: string;
  imagenes_secundarias: string;
  url_origen: string;
}

/** Facetas filtrables del catálogo (el orden define el orden visual) */
export type FacetKey = 'marca' | 'genero' | 'material' | 'forma' | 'calibre';

export const FACET_KEYS: FacetKey[] = ['marca', 'genero', 'material', 'forma', 'calibre'];

export type SortKey = 'relevancia' | 'stock' | 'precio-asc' | 'precio-desc' | 'modelo';

export const SORT_KEYS: SortKey[] = ['relevancia', 'stock', 'precio-asc', 'precio-desc', 'modelo'];

export interface FilterState {
  q: string;
  marca: string[];
  genero: string[];
  material: string[];
  forma: string[];
  calibre: string[];
  sort: SortKey;
}

export interface FacetOption {
  key: string;     // clave normalizada (la que viaja en la URL)
  label: string;   // texto visible en español
  count: number;   // resultados que quedarían al marcar esta opción
  hint?: string;   // texto secundario opcional (ej: "Mediano")
}

export type Facets = Record<FacetKey, FacetOption[]>;

/** Medidas ópticas extraídas de "55X18X145" */
export interface FrameDims {
  calibre: number;        // ancho de lente (mm)
  puente: number | null;  // puente (mm)
  varilla: number | null; // largo de varilla (mm)
}

/** Marco con claves pre-calculadas para filtrar/buscar en O(1) */
export interface EnrichedMarco extends Marco {
  _k: Record<FacetKey, string>;
  _search: string;
  _dims: FrameDims | null;
}
