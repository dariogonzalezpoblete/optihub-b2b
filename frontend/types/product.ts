export interface Producto {
  id: number;
  id_ext: string;
  marca: string;
  modelo: string;
  color?: string;
  precio_usd: number;
  precio_neto_clp: number;
  precio_bruto_clp: number;
  stock: number;
  imagen_principal?: string;
}