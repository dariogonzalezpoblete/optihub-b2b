export type ImportStageKey = 'logistica_usa' | 'viajando' | 'desaduanamiento' | 'reparto_chile' | 'entregado';

export interface StageDefinition {
  key: ImportStageKey;
  step: number;
  label: string;
  badge: string;
  location: string;
  description: string;
}

export const IMPORT_STAGES: StageDefinition[] = [
  {
    key: 'logistica_usa',
    step: 1,
    label: 'Logística en USA',
    badge: 'Miami, USA',
    location: 'Bodega Central de Exportación',
    description: 'Consolidación de armazones, control de originalidad de marca y embalaje reforzado de exportación.'
  },
  {
    key: 'viajando',
    step: 2,
    label: 'Viajando a Chile',
    badge: 'Tránsito Internacional',
    location: 'Vuelo Comercial Miami ➔ SCL',
    description: 'Embarque aéreo en ruta a Santiago de Chile bajo custodia internacional.'
  },
  {
    key: 'desaduanamiento',
    step: 3,
    label: 'En Desaduanamiento',
    badge: 'Aduana SCL',
    location: 'Aduana de Chile & Control OptiHub',
    description: 'Trámite de internación comercial, aforo aduanero y verificación técnica física de piezas por OptiHub.'
  },
  {
    key: 'reparto_chile',
    step: 4,
    label: 'En Reparto en Chile',
    badge: 'Última Milla',
    location: 'Courier Nacional en Ruta',
    description: 'En despacho terrestre hacia la dirección comercial de tu óptica con courier asignado.'
  },
  {
    key: 'entregado',
    step: 5,
    label: 'Entregado Conforme',
    badge: 'Completado',
    location: 'En Óptica',
    description: 'Pedido recibido con sus estuches originales, paños de microfibra oficiales y Factura Electrónica SII.'
  }
];

export const COURIER_OPTIONS = [
  { id: 'DHL Express', name: 'DHL Express', urlPrefix: 'https://www.dhl.com/cl-es/home/tracking/tracking-express.html?submit=1&tracking-id=' },
  { id: 'FedEx', name: 'FedEx', urlPrefix: 'https://www.fedex.com/fedextrack/?trknbr=' },
  { id: 'Starken', name: 'Starken', urlPrefix: 'https://www.starken.cl/seguimiento?codigo=' },
  { id: 'Chilexpress', name: 'Chilexpress', urlPrefix: 'https://www.chilexpress.cl/seguimiento-envios?numero=' },
  { id: 'Blue Express', name: 'Blue Express', urlPrefix: 'https://www.bluex.cl/seguimiento/?tracking=' },
  { id: 'CorreosChile', name: 'Correos de Chile', urlPrefix: 'https://www.correos.cl/seguimiento-en-linea?codigo=' },
  { id: 'Otro', name: 'Otro Courier / Especial', urlPrefix: '' }
];

export function getCourierTrackingUrl(courier?: string | null, trackingNumber?: string | null): string | null {
  if (!trackingNumber) return null;
  const cleanTracking = trackingNumber.trim();
  if (!cleanTracking) return null;

  const found = COURIER_OPTIONS.find(c => courier && c.name.toLowerCase().includes(courier.toLowerCase()));
  if (found && found.urlPrefix) {
    return `${found.urlPrefix}${encodeURIComponent(cleanTracking)}`;
  }

  // Auto-detect based on tracking number format or courier string
  const lowerCourier = (courier || '').toLowerCase();
  if (lowerCourier.includes('dhl') || cleanTracking.toUpperCase().startsWith('DHL')) {
    return `https://www.dhl.com/cl-es/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(cleanTracking)}`;
  }
  if (lowerCourier.includes('starken')) {
    return `https://www.starken.cl/seguimiento?codigo=${encodeURIComponent(cleanTracking)}`;
  }
  if (lowerCourier.includes('chilexpress')) {
    return `https://www.chilexpress.cl/seguimiento-envios?numero=${encodeURIComponent(cleanTracking)}`;
  }
  if (lowerCourier.includes('blue')) {
    return `https://www.bluex.cl/seguimiento/?tracking=${encodeURIComponent(cleanTracking)}`;
  }
  if (lowerCourier.includes('fedex')) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(cleanTracking)}`;
  }

  return `https://www.google.com/search?q=seguimiento+${encodeURIComponent(cleanTracking)}`;
}

export interface ParsedTracking {
  currentStageKey: ImportStageKey;
  currentStep: number;
  stageInfo: StageDefinition;
  courier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  customNote: string | null;
  updatedAt: string | null;
}

export function parseOrderTracking(order: {
  status: string;
  notes?: string | null;
  shipping_provider?: string | null;
  tracking_number?: string | null;
}): ParsedTracking {
  let stageKey: ImportStageKey = 'logistica_usa';
  let customNote: string | null = null;
  let updatedAt: string | null = null;

  // 1. Try parsing JSON notes first
  if (order.notes) {
    try {
      if (order.notes.trim().startsWith('{')) {
        const parsed = JSON.parse(order.notes);
        if (parsed.stage && ['logistica_usa', 'viajando', 'desaduanamiento', 'reparto_chile', 'entregado'].includes(parsed.stage)) {
          stageKey = parsed.stage as ImportStageKey;
        }
        if (parsed.note) customNote = parsed.note;
        if (parsed.message) customNote = parsed.message;
        if (parsed.updatedAt) updatedAt = parsed.updatedAt;
      } else {
        customNote = order.notes;
      }
    } catch {
      customNote = order.notes;
    }
  }

  // 2. If no valid stage found from JSON, map from order.status
  if (!order.notes || !order.notes.includes('"stage"')) {
    if (order.status === 'delivered') stageKey = 'entregado';
    else if (order.status === 'shipped') stageKey = 'reparto_chile';
    else if (order.status === 'preparing' || order.status === 'paid') stageKey = 'logistica_usa';
    else stageKey = 'logistica_usa';
  }

  const stageInfo = IMPORT_STAGES.find(s => s.key === stageKey) || IMPORT_STAGES[0];
  const courier = order.shipping_provider || null;
  const trackingNumber = order.tracking_number || null;
  const trackingUrl = getCourierTrackingUrl(courier, trackingNumber);

  return {
    currentStageKey: stageKey,
    currentStep: stageInfo.step,
    stageInfo,
    courier,
    trackingNumber,
    trackingUrl,
    customNote,
    updatedAt
  };
}
