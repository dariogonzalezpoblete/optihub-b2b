export interface Producto {
  id?: number;
  id_ext: string;
  marca?: string;
  modelo?: string;
  color?: string;
  codigo_color?: string;
  material?: string;
  genero?: string;
  forma?: string;
  tamano?: string;
  upc?: string;
  origen?: string;
  stock?: number;
  precio_usd?: number;
  precio_neto_clp: number;
  precio_bruto_clp?: number;
  imagen_principal?: string;
  imagenes_secundarias?: string;
}

export interface CartItem {
  producto: Producto;
  cantidad: number;
}