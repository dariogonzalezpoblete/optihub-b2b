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
