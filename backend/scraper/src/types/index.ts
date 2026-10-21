/**
 * Types and interfaces for OptiHub Provider Scraper
 */

export interface B2BPricingResult {
  precio_bruto_clp: number;
  precio_neto_clp: number;
  iva_clp: number;
  ganancia_clp: number;
  costo_flete_usd: number;
  costo_cif_clp: number;
  ad_valorem_clp: number;
  costo_despacho_local_clp: number;
  costo_total_chile_clp: number;
}

export interface RawCatalogItem {
  id?: string | number;
  id_ext?: string;
  sku?: string;
  model?: string;
  brand?: string;
  color?: string;
  color_code?: string;
  gender?: string;
  shape?: string;
  material?: string;
  size?: string;
  upc?: string;
  origin?: string;
  stock?: number | string;
  price?: number | string;
  wholesale_price?: number | string;
  msrp?: number | string;
  images?: string[];
  image_url?: string;
  url?: string;
  [key: string]: unknown;
}

export interface OptiHubProduct {
  id_ext: string;
  id_nywd: string;
  marca: string;
  modelo: string;
  color: string;
  codigo_color: string;
  genero?: string;
  forma?: string;
  material?: string;
  tamano?: string;
  upc?: string;
  origen?: string;
  stock: number;
  precio_usd: number;
  precio_neto_clp: number;
  precio_bruto_clp: number;
  ganancia_clp: number;
  costo_flete_usd: number;
  costo_cif_clp: number;
  ad_valorem_clp: number;
  costo_despacho_local_clp: number;
  costo_total_chile_clp: number;
  imagen_principal?: string;
  imagenes_secundarias?: string;
  url_origen?: string;
}

export interface ScraperOptions {
  brands: string[];
  headless: boolean;
  maxPages: number;
  minStock: number;
  dryRun: boolean;
  authStatePath: string;
  stockOnly?: boolean;
  allBrands?: boolean;
}

export interface InterceptedPayload {
  url: string;
  timestamp: string;
  method: string;
  data: unknown;
}
