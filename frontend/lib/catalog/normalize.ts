import type { FacetKey, FrameDims } from './types';

/**
 * Normaliza texto para comparar: minúsculas, sin tildes y sin símbolos.
 * "ZS-22103 Hugo Boss" → "zs22103hugoboss"
 */
export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ---------- Traducciones (los datos en Supabase quedan intactos) ----------

const MATERIAL_LABELS: Record<string, string> = {
  acetate: 'Acetato',
  metal: 'Metal',
  injectedpropionate: 'Propionato inyectado',
  plastic: 'Plástico',
  titanium: 'Titanio',
  shield: 'Máscara (Shield)',
  acetatemetal: 'Acetato / Metal',
  tr90: 'TR90',
};

const FORMA_LABELS: Record<string, string> = {
  rectangular: 'Rectangular',
  round: 'Redondo',
  cateye: 'Cat eye',
  aviator: 'Aviador',
  shield: 'Máscara',
  oval: 'Ovalado',
  sportwraparound: 'Deportivo envolvente',
  oversized: 'Oversized',
  square: 'Cuadrado',
};

const GENERO_LABELS: Record<string, string> = {
  men: 'Hombre',
  women: 'Mujer',
  unisex: 'Unisex',
};

const COLOR_LABELS: Record<string, string> = {
  negro: 'Negro',
  carey: 'Carey / Habana',
  dorado: 'Dorado',
  plateado: 'Plateado / Metal',
  azul: 'Azul / Navy',
  marron: 'Café / Marrón',
  gris: 'Gris',
  rosa: 'Rosado / Rojo',
  blanco: 'Blanco / Marfil',
  cristal: 'Transparente / Cristal',
};

export function extractColorGroup(colorStr: string): string {
  if (!colorStr) return '';
  const c = colorStr.toLowerCase();
  if (c.includes('black') || c.includes('negro')) return 'negro';
  if (c.includes('havana') || c.includes('tortoise') || c.includes('carey')) return 'carey';
  if (c.includes('gold') || c.includes('dorad')) return 'dorado';
  if (c.includes('silver') || c.includes('gunmetal') || c.includes('platead') || c.includes('metal')) return 'plateado';
  if (c.includes('blue') || c.includes('azul') || c.includes('navy')) return 'azul';
  if (c.includes('brown') || c.includes('marron') || c.includes('cafe')) return 'marron';
  if (c.includes('grey') || c.includes('gray') || c.includes('gris')) return 'gris';
  if (c.includes('pink') || c.includes('rose') || c.includes('red') || c.includes('rojo') || c.includes('violet') || c.includes('bordeaux')) return 'rosa';
  if (c.includes('white') || c.includes('blanco') || c.includes('ivory') || c.includes('beige')) return 'blanco';
  if (c.includes('crystal') || c.includes('clear') || c.includes('transparent')) return 'cristal';
  return '';
}

// ---------- Calibre ----------

export const CALIBRE_RANGES = [
  { key: 'hasta50', label: '≤ 50 mm', hint: 'Pequeño', test: (c: number) => c <= 50 },
  { key: '5153', label: '51–53 mm', hint: 'Mediano', test: (c: number) => c >= 51 && c <= 53 },
  { key: '5456', label: '54–56 mm', hint: 'Grande', test: (c: number) => c >= 54 && c <= 56 },
  { key: '57mas', label: '57+ mm', hint: 'Extra grande', test: (c: number) => c >= 57 },
] as const;

/**
 * "55X18X145" → { calibre: 55, puente: 18, varilla: 145 }
 * Tolera datos incompletos del proveedor: "55X18X0" o "53XX" → puente/varilla = null.
 * Devuelve null si no hay calibre de 2 dígitos ("XX", o anchos totales de máscara como "150X0X130").
 */
export function parseTamano(raw: unknown): FrameDims | null {
  const match = String(raw ?? '').trim().match(/^(\d{2})\s*[xX×]\s*(\d*)\s*[xX×]?\s*(\d*)$/);
  if (!match) return null;
  const toMm = (v: string) => (v && Number(v) > 0 ? Number(v) : null);
  return {
    calibre: Number(match[1]),
    puente: toMm(match[2]),
    varilla: toMm(match[3]),
  };
}

export function calibreRangeKey(calibre: number): string {
  return CALIBRE_RANGES.find((r) => r.test(calibre))?.key ?? '';
}

/** Etiqueta visible para una opción de faceta */
export function labelFor(facet: FacetKey, raw: string): string {
  const key = normalizeText(raw);
  switch (facet) {
    case 'material':
      return MATERIAL_LABELS[key] ?? raw;
    case 'color':
      return COLOR_LABELS[key] ?? raw;
    case 'forma':
      return FORMA_LABELS[key] ?? raw;
    case 'genero':
      return GENERO_LABELS[key] ?? raw;
    case 'calibre':
      return CALIBRE_RANGES.find((r) => r.key === key)?.label ?? raw;
    case 'marca':
      return raw
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    default:
      // "RUDY PROJECT" → "Rudy Project"; "Hugo Boss" se mantiene
      return raw === raw.toUpperCase() && raw.length > 3
        ? raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
        : raw;
  }
}
