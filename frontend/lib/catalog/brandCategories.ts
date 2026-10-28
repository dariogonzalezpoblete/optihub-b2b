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
 * Calculadora de Margen Retail Sugerido (PVP de Mercado Óptico en Chile)
 * Refleja los precios reales de venta al público en ópticas de Chile (GMO, Rotter & Krauss, etc.)
 * • Piso estricto: Ningún armazón sugerido bajo $99.900 CLP (los Guess y marcas de entrada parten desde $99.900-$109.900)
 * • Escala realista de mercado sin inflar artificialmente las marcas de lujo
 */
export function calculateRetailProjection(precioNetoClp?: number | null) {
  if (!precioNetoClp || precioNetoClp <= 0) {
    return {
      pvpSugerido: 0,
      margenPorcentaje: 50,
      gananciaPorUnidad: 0
    };
  }

  let rawPvp: number;

  if (precioNetoClp <= 55000) {
    // Modelos de entrada / Bestsellers (Guess, Converse, etc.):
    // En ópticas siempre parten desde $99.900 a $119.900
    rawPvp = Math.max(99900, precioNetoClp * 2.1);
  } else if (precioNetoClp <= 90000) {
    // Gama media / Sport (Adidas, Nike, Calvin Klein, Emporio Armani):
    // En ópticas se venden habitualmente entre $129.900 y $169.900
    rawPvp = Math.max(129900, precioNetoClp * 1.85);
  } else if (precioNetoClp <= 160000) {
    // Gama alta técnica / titanio (IC! Berlin, Burberry):
    // En ópticas se venden entre $229.900 y $269.900
    rawPvp = Math.max(229900, precioNetoClp * 1.65);
  } else {
    // Lujo superior (Gucci, Tom Ford, Prada, etc.):
    // En ópticas se venden entre $349.900 y $449.900
    rawPvp = Math.max(349900, precioNetoClp * 1.5);
  }

  // Redondeo comercial a múltiplos de $10.000 con terminación $900 (ej: $99.900, $109.900, $129.900, $249.900)
  let pvpSugerido = Math.round(rawPvp / 10000) * 10000 - 100;

  // REGLA DE NEGOCIO ESTRICTA: Ningún sugerido en menos de $99.900
  if (pvpSugerido < 99900) {
    pvpSugerido = 99900;
  }

  const gananciaPorUnidad = pvpSugerido - precioNetoClp;
  const margenPorcentaje = Math.round((gananciaPorUnidad / pvpSugerido) * 100);

  return {
    pvpSugerido,
    margenPorcentaje,
    gananciaPorUnidad
  };
}
