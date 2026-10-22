/**
 * Curaduría y Arquitectura B2B de Marcas para OptiHub
 */

export interface BrandSegment {
  id: string;
  label: string;
  icon: string;
  brands: string[];
  description: string;
}

export const BRAND_SEGMENTS: BrandSegment[] = [
  {
    id: 'bestsellers',
    label: 'Más Vendidos en Chile',
    icon: '🔥',
    brands: [
      'Guess', 
      'Guess By Marciano', 
      'Calvin Klein', 
      'Calvin Klein Jeans', 
      'Dkny', 
      'DKNY', 
      'Hugo Boss', 
      'Tommy Hilfiger', 
      'Lacoste', 
      'Carrera'
    ],
    description: 'Modelos de alta rotación comprobada en el mercado óptico chileno.'
  },
  {
    id: 'luxury',
    label: 'Alta Gama',
    icon: '💎',
    brands: [
      'Gucci', 
      'Burberry', 
      'Bmw', 
      'BMW', 
      'Tom Ford', 
      'Ferragamo', 
      'Salvatore Ferragamo', 
      'Versace', 
      'Prada', 
      'Chopard'
    ],
    description: 'Armazones de prestigio internacional con alto valor de reventa.'
  },
  {
    id: 'sport',
    label: 'Sport',
    icon: '⚡',
    brands: [
      'Nike', 
      'Adidas', 
      'Rudy Project', 
      'Bolle', 
      'Converse', 
      'Carrera', 
      'SPY', 
      'Under Armour', 
      'Spyder'
    ],
    description: 'Armazones envolventes, dinámicos, deportivos y de alta resistencia.'
  },
  {
    id: 'clinical',
    label: 'Autoridad Clínica',
    icon: '🩺',
    brands: [
      'IC! Berlin', 
      'Ic Berlin', 
      'IC Berlin', 
      'Zeiss', 
      'Silhouette', 
      'Flexon', 
      'Police'
    ],
    description: 'Titanio, bisagras de precisión técnica y máxima ergonomía médica.'
  },
  {
    id: 'women',
    label: 'Gemas Femeninas',
    icon: '✨',
    brands: [
      'Tous', 
      'Tiffany', 
      'Tiffany & Co.', 
      'Kate Spade', 
      'Swarovski', 
      'Furla', 
      'Draper James', 
      'Marc Jacobs'
    ],
    description: 'Detalles de joyería, elegancia y alta demanda femenina.'
  }
];

/**
 * Marcas secundarias de baja demanda o licencias sin posicionamiento óptico
 * que se ocultan del catálogo público para mantener la exclusividad.
 */
export const FILLER_BRANDS: string[] = [
  'gap',
  'chesterfield',
  'adensco',
  'bebe',
  'emozioni',
  'elasta',
  'joe optical',
  'j. landon'
];

export function isFillerBrand(brand: string): boolean {
  if (!brand) return false;
  const normalized = brand.toLowerCase().trim();
  return FILLER_BRANDS.some(fb => fb === normalized || normalized.startsWith(fb));
}

/**
 * Asigna un distintivo comercial (Badge de Rotación) a cada tarjeta
 */
export function getRotationBadge(brand: string): { label: string; bg: string; text: string; icon: string } | null {
  if (!brand) return null;
  const b = brand.toLowerCase();

  if (['guess', 'calvin klein', 'tommy hilfiger', 'hugo boss', 'lacoste', 'dkny'].some(x => b.includes(x))) {
    return {
      label: 'Bestseller Chile',
      bg: 'bg-amber-500/15 border-amber-500/30',
      text: 'text-amber-400',
      icon: '⭐'
    };
  }

  if (['gucci', 'burberry', 'bmw', 'tom ford', 'versace', 'ferragamo', 'prada', 'chopard'].some(x => b.includes(x))) {
    return {
      label: 'Alta Gama',
      bg: 'bg-purple-500/15 border-purple-500/30',
      text: 'text-purple-300',
      icon: '💎'
    };
  }

  if (['ic! berlin', 'ic berlin', 'zeiss', 'silhouette', 'flexon'].some(x => b.includes(x))) {
    return {
      label: 'Clínico / Titanio',
      bg: 'bg-sky-500/15 border-sky-500/30',
      text: 'text-sky-300',
      icon: '🩺'
    };
  }

  if (['tous', 'tiffany', 'kate spade', 'swarovski', 'furla'].some(x => b.includes(x))) {
    return {
      label: 'Gema Femenina',
      bg: 'bg-pink-500/15 border-pink-500/30',
      text: 'text-pink-300',
      icon: '✨'
    };
  }

  if (['nike', 'adidas', 'rudy project', 'bolle', 'converse', 'carrera', 'spy'].some(x => b.includes(x))) {
    return {
      label: 'Sport',
      bg: 'bg-emerald-500/15 border-emerald-500/30',
      text: 'text-emerald-300',
      icon: '⚡'
    };
  }

  return null;
}

/**
 * Calculadora de Margen Retail Sugerido (PVP de Mercado Óptico)
 * Basado en multiplicador estándar B2B de 2.8x - 3.0x sobre costo neto.
 */
export function calculateRetailProjection(precioNetoClp: number) {
  if (!precioNetoClp || precioNetoClp <= 0) {
    return {
      pvpSugerido: 0,
      margenPorcentaje: 65,
      gananciaPorUnidad: 0
    };
  }

  // Multiplicador retail estándar de ópticas en Chile (~2.85x sobre neto)
  const rawPvp = precioNetoClp * 2.85;
  // Redondeo comercial a terminación $900 (ej. $129.900)
  const pvpSugerido = Math.round(rawPvp / 1000) * 1000 - 100;
  const gananciaPorUnidad = pvpSugerido - precioNetoClp;
  const margenPorcentaje = Math.round((gananciaPorUnidad / pvpSugerido) * 100);

  return {
    pvpSugerido,
    margenPorcentaje,
    gananciaPorUnidad
  };
}
