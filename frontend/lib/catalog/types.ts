// Tipos compartidos del módulo de catálogo OptiHub B2B

/**
 * Columnas públicas no sensibles de `public.marcos` autorizadas para el rol `anon` y SSR público.
 * NUNCA incluye `precio_neto_clp`, `precio_bruto_clp`, `stock`, ni costos/márgenes internos.
 */
export const MARCOS_PUBLIC_COLUMNS_LIST = [
  'id',
  'id_ext',
  'marca',
  'modelo',
  'color',
  'codigo_color',
  'genero',
  'forma',
  'material',
  'tamano',
  'upc',
  'origen',
  'imagen_principal',
  'imagenes_secundarias',
] as const;

export const MARCOS_PUBLIC_COLUMNS =
  'id, id_ext, marca, modelo, color, codigo_color, genero, forma, material, tamano, upc, origen, imagen_principal, imagenes_secundarias';

/**
 * Columnas públicas mínimas para el cálculo de facetas del catálogo en SSR (`anon`).
 */
export const MARCOS_FACET_PUBLIC_COLUMNS =
  'id, id_ext, marca, modelo, genero, material, forma, tamano';

/**
 * Columnas comerciales B2B adicionales autorizadas únicamente para el rol `authenticated`.
 * NUNCA incluye costos ni márgenes internos (`costo_cif_clp`, `costo_flete_usd`,
 * `costo_total_chile_clp`, `costo_despacho_local_clp`, `ad_valorem_clp`, `ganancia_clp`,
 * `iva_clp`, `precio_usd`, `id_nywd`, `url_origen`).
 */
export const MARCOS_B2B_ONLY_COLUMNS_LIST = [
  'precio_neto_clp',
  'precio_bruto_clp',
  'stock',
] as const;

export const MARCOS_B2B_COMMERCIAL_OVERLAY_COLUMNS =
  'id_ext, precio_neto_clp, precio_bruto_clp, stock';

export const MARCOS_B2B_COLUMNS_LIST = [
  ...MARCOS_PUBLIC_COLUMNS_LIST,
  ...MARCOS_B2B_ONLY_COLUMNS_LIST,
] as const;

export const MARCOS_B2B_COLUMNS =
  'id, id_ext, marca, modelo, color, codigo_color, genero, forma, material, tamano, upc, origen, imagen_principal, imagenes_secundarias, precio_neto_clp, precio_bruto_clp, stock';

/**
 * Columnas internas de costos, márgenes y proveedor que jamás deben exponerse a `anon` ni `authenticated`.
 */
export const MARCOS_INTERNAL_SENSITIVE_COLUMNS_LIST = [
  'costo_cif_clp',
  'costo_flete_usd',
  'costo_total_chile_clp',
  'costo_despacho_local_clp',
  'ad_valorem_clp',
  'ganancia_clp',
  'iva_clp',
  'precio_usd',
  'id_nywd',
  'url_origen',
] as const;

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
  stock?: number;
  precio_bruto_clp?: number;
  precio_neto_clp?: number;
  imagen_principal: string;
  imagenes_secundarias: string;
}

/** Facetas filtrables del catálogo (el orden define el orden visual) */
export type FacetKey = 'marca' | 'color' | 'genero' | 'material' | 'forma' | 'calibre';

export const FACET_KEYS: FacetKey[] = ['marca', 'color', 'genero', 'material', 'forma', 'calibre'];

export type SortKey = 'relevancia' | 'stock' | 'precio-asc' | 'precio-desc' | 'modelo';

export const SORT_KEYS: SortKey[] = ['relevancia', 'stock', 'precio-asc', 'precio-desc', 'modelo'];

export interface FilterState {
  q: string;
  marca: string[];
  color: string[];
  genero: string[];
  material: string[];
  forma: string[];
  calibre: string[];
  sort: SortKey;
  page?: number;
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


// --- NUEVOS TIPOS B2B (Capa Transaccional) ---

export interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  rut: string | null;
  business_name: string | null;
  business_giro: string | null;
  billing_address: string | null;
  commune: string | null;
  region: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id: string;
  user_id: string;
  status: 'pending' | 'payment_pending' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'requires_attention';
  payment_status: 'pending' | 'approved' | 'rejected' | 'refunded';
  payment_provider?: string;
  payment_id?: string;
  subtotal_net: number;
  tax_amount: number;
  shipping_amount: number;
  total_amount: number;
  currency: string;
  stock_decremented?: boolean;
  stock_error?: string | null;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  business_name?: string;
  business_rut?: string;
  billing_address?: string;
  shipping_address?: string;
  shipping_region?: string;
  shipping_commune?: string;
  tracking_number?: string;
  shipping_provider?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  brand_name: string;
  unit_price_net: number;
  quantity: number;
  subtotal_net: number;
  created_at: string;
}

export interface Cart {
  id: string;
  user_id?: string;
  status: 'active' | 'converted' | 'abandoned';
  created_at: string;
  updated_at: string;
  converted_at?: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}
