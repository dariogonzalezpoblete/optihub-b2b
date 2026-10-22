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
    brands: ['Guess', 'Hugo Boss', 'Tommy Hilfiger', 'Lacoste', 'Carrera'],
    description: 'Modelos de alta rotación comprobada en el mercado óptico chileno.'
  },
  {
    id: 'luxury',
    label: 'Lujo & Alta Gama',
    icon: '💎',
    brands: ['Tom Ford', 'Gucci', 'Ferragamo', 'Salvatore Ferragamo', 'Versace', 'Burberry', 'Prada', 'Chopard'],
    description: 'Segmento ABC1 con alto ticket promedio y valor de reventa.'
  },
  {
    id: 'sport',
    label: 'Deporte & Escolar',
    icon: '⚡',
    brands: ['Nike', 'Adidas', 'Carrera', 'Rudy Project', 'SPY', 'Under Armour', 'Spyder'],
    description: 'Armazones envolventes, acetatos deportivos y alta resistencia.'
  },
  {
    id: 'clinical',
    label: 'Autoridad Clínica',
    icon: '🩺',
    brands: ['Zeiss', 'Silhouette', 'IC Berlin', 'IC! Berlin', 'Flexon', 'Police'],
    description: 'Titanio, bisagras sin tornillos y máxima ergonomía médica.'
  },
  {
    id: 'women',
    label: 'Gemas Femeninas',
    icon: '✨',
    brands: ['Tous', 'Tiffany', 'Tiffany & Co.', 'Kate Spade', 'Swarovski', 'Furla', 'Draper James', 'Marc Jacobs'],
    description: 'Detalles de joyería, cristales y elegancia para el público femenino.'
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

  if (['guess', 'tommy hilfiger', 'hugo boss', 'lacoste'].some(x => b.includes(x))) {
    return {
      label: 'Bestseller Chile',
      bg: 'bg-amber-500/15 border-amber-500/30',
      text: 'text-amber-400',
      icon: '⭐'
    };
  }

  if (['tom ford', 'gucci', 'versace', 'burberry', 'ferragamo', 'prada', 'chopard'].some(x => b.includes(x))) {
    return {
      label: 'Alta Gama ABC1',
      bg: 'bg-purple-500/15 border-purple-500/30',
      text: 'text-purple-300',
      icon: '💎'
    };
  }

  if (['zeiss', 'silhouette', 'ic berlin', 'flexon'].some(x => b.includes(x))) {
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

  if (['nike', 'adidas', 'rudy project', 'carrera', 'spy'].some(x => b.includes(x))) {
    return {
      label: 'Sport & Escolar',
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
