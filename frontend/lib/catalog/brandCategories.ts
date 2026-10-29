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
      'Carrera',
      'Emporio Armani'
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
      'Chopard',
      'Philipp Plein',
      'Roberto Cavalli',
      'Moschino',
      'Palm Angels'
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
      'Spy',
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

  if (['guess', 'calvin klein', 'tommy hilfiger', 'hugo boss', 'lacoste', 'dkny', 'emporio armani'].some(x => b.includes(x))) {
    return {
      label: 'Bestseller Chile',
      bg: 'bg-amber-500/15 border-amber-500/30',
      text: 'text-amber-400',
      icon: '⭐'
    };
  }

  if (['gucci', 'burberry', 'bmw', 'tom ford', 'versace', 'ferragamo', 'prada', 'chopard', 'philipp plein', 'roberto cavalli', 'moschino', 'palm angels'].some(x => b.includes(x))) {
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

  if (['nike', 'adidas', 'rudy project', 'bolle', 'converse', 'carrera', 'spy', 'under armour'].some(x => b.includes(x))) {
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
 * Guiada por referencias reales de mercado (Farfetch, VisionDirecta, GMO, Rotter & Krauss)
 * para presentar precios de venta al público creíbles, aspiracionales y con alto margen
 * comercial que entusiasme al dueño de óptica B2B.
 */
export function calculateRetailProjection(precioNetoClp?: number | null, brand?: string) {
  if (!precioNetoClp || precioNetoClp <= 0) {
    return {
      pvpSugerido: 0,
      margenPorcentaje: 50,
      gananciaPorUnidad: 0
    };
  }

  const b = (brand || '').toLowerCase().trim();

  // Pisos y multiplicadores según categoría de marca en Farfetch / VisionDirecta / GMO:

  // 1. Alta Costura & Diseñador Internacional de Lujo (Farfetch / Boutiques)
  const isFarfetchLuxuryTier = [
    'roberto cavalli',
    'cavalli',
    'tom ford',
    'gucci',
    'philipp plein',
    'chopard',
    'palm angels',
    'salvatore ferragamo',
    'ferragamo',
    'prada',
    'versace',
    'balenciaga',
    'cartier',
    'saint laurent',
    'ysl',
    'celine',
    'dior',
    'bottega veneta',
    'fendi',
    'alexander mcqueen',
    'burberry'
  ].some(x => b.includes(x));

  // 2. Especialidad Clínica de Precisión & Titanio
  const isClinicalHighPrecision = [
    'ic! berlin',
    'ic berlin',
    'zeiss',
    'silhouette',
    'flexon'
  ].some(x => b.includes(x));

  // 3. Gemas de Moda Femenina & Joyería / Cristales
  const isJewelryAndFashion = [
    'swarovski',
    'moschino',
    'tous',
    'tiffany',
    'kate spade',
    'furla',
    'marc jacobs'
  ].some(x => b.includes(x));

  // 4. Sport Técnico de Alto Rendimiento & Línea Alemana
  const isSportAndEngineering = [
    'bmw',
    'rudy project',
    'spy',
    'under armour',
    'nike',
    'adidas',
    'bolle'
  ].some(x => b.includes(x));

  // 5. Bestsellers Masivos de Alta Rotación en Chile
  const isBestsellerMassMarket = [
    'guess',
    'calvin klein',
    'tommy hilfiger',
    'emporio armani',
    'converse',
    'dkny',
    'lacoste',
    'carrera',
    'hugo boss',
    'hugo'
  ].some(x => b.includes(x));

  let rawPvp: number;

  if (isFarfetchLuxuryTier) {
    // Modelos de Farfetch / Boutiques de Alta Costura:
    // Roberto Cavalli, Tom Ford, Gucci, Ferragamo, Philipp Plein, etc.
    // En Farfetch y VisionDirecta Chile parten desde $329.900 a $489.900+
    if (b.includes('chopard')) {
      rawPvp = Math.max(499900, precioNetoClp * 2.6);
    } else if (b.includes('gucci') || b.includes('tom ford') || b.includes('philipp plein')) {
      rawPvp = Math.max(359900, precioNetoClp * 2.35);
    } else if (b.includes('roberto cavalli') || b.includes('cavalli')) {
      // Modelos Farfetch/VisionDirecta: piso estricto sobre $300.000 (habitualmente $349.900)
      rawPvp = Math.max(349900, precioNetoClp * 2.25);
    } else if (b.includes('palm angels') || b.includes('ferragamo') || b.includes('salvatore ferragamo')) {
      rawPvp = Math.max(319900, precioNetoClp * 2.25);
    } else if (b.includes('burberry')) {
      rawPvp = Math.max(269900, precioNetoClp * 2.1);
    } else {
      rawPvp = Math.max(329900, precioNetoClp * 2.2);
    }
  } else if (isClinicalHighPrecision) {
    if (b.includes('ic! berlin') || b.includes('ic berlin')) {
      rawPvp = Math.max(349900, precioNetoClp * 2.4);
    } else if (b.includes('zeiss')) {
      rawPvp = Math.max(229900, precioNetoClp * 2.6);
    } else {
      rawPvp = Math.max(239900, precioNetoClp * 2.3);
    }
  } else if (isJewelryAndFashion) {
    if (b.includes('swarovski')) {
      rawPvp = Math.max(249900, precioNetoClp * 2.1);
    } else if (b.includes('moschino')) {
      rawPvp = Math.max(249900, precioNetoClp * 2.25);
    } else {
      rawPvp = Math.max(229900, precioNetoClp * 2.2);
    }
  } else if (isSportAndEngineering) {
    if (b.includes('bmw')) {
      rawPvp = Math.max(229900, precioNetoClp * 2.2);
    } else if (b.includes('rudy project')) {
      rawPvp = Math.max(189900, precioNetoClp * 2.2);
    } else if (b.includes('spy')) {
      rawPvp = Math.max(159900, precioNetoClp * 2.1);
    } else {
      rawPvp = Math.max(149900, precioNetoClp * 2.1);
    }
  } else if (isBestsellerMassMarket) {
    if (b.includes('tommy hilfiger') || b.includes('calvin klein') || b.includes('lacoste') || b.includes('carrera') || b.includes('emporio armani')) {
      rawPvp = Math.max(149900, precioNetoClp * 2.15);
    } else {
      rawPvp = Math.max(119900, precioNetoClp * 2.2);
    }
  } else {
    if (precioNetoClp <= 55000) {
      rawPvp = Math.max(119900, precioNetoClp * 2.2);
    } else if (precioNetoClp <= 90000) {
      rawPvp = Math.max(169900, precioNetoClp * 2.1);
    } else if (precioNetoClp <= 140000) {
      rawPvp = Math.max(269900, precioNetoClp * 2.1);
    } else {
      rawPvp = Math.max(349900, precioNetoClp * 2.2);
    }
  }

  // Redondeo comercial chileno a múltiplos de $10.000 con terminación $900
  let pvpSugerido = Math.round(rawPvp / 10000) * 10000 - 100;

  // Piso comercial estricto para ópticas en Chile
  if (pvpSugerido < 119900) {
    pvpSugerido = 119900;
  }

  const gananciaPorUnidad = pvpSugerido - precioNetoClp;
  const margenPorcentaje = Math.round((gananciaPorUnidad / pvpSugerido) * 100);

  return {
    pvpSugerido,
    margenPorcentaje,
    gananciaPorUnidad
  };
}
