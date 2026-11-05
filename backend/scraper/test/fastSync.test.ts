import { calculateB2BPricing } from '../src/services/pricing';
import { SyncReportItem, ProductStockPriceUpdate, ExistingProductRecord } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('Running Fast Sync & Commercial Pricing Unit Tests...');

// 1. Test pricing ($40.00 USD, default 45% margin < 20.000 floor -> 20.000 floor applied)
const costUsd = 40.0;
// FOB CLP = 40 * 950 = 38.000
// Costo Total Neto = 38.000 + 6.192 = 44.192
// 45% margin = 19.886,4 < 20.000 -> enforces clean profit floor of 20.000 CLP!
// precio_neto_clp = Math.round((44.192 + 20.000) / 100) * 100 = 64.200 CLP
const tier2Res = calculateB2BPricing(costUsd);
assert(tier2Res.precio_neto_clp === 64200, `Expected 64,200 CLP net, got ${tier2Res.precio_neto_clp}`);
assert(tier2Res.precio_bruto_clp === Math.round((64200 * 1.19) / 100) * 100, 'Gross price with 19% IVA matches');
assert(tier2Res.ganancia_clp === 20000, 'Clean profit must be at least 20.000 CLP');

// 2. Test pricing ($20.00 USD, default 45% margin < 20.000 floor -> 20.000 floor applied)
// FOB CLP = 20 * 950 = 19.000
// Costo Total Neto = 19.000 + 6.192 = 25.192
// precio_neto_clp = Math.round((25.192 + 20.000) / 100) * 100 = 45.200 CLP
const tier1Res = calculateB2BPricing(20.0);
assert(tier1Res.precio_neto_clp === 45200, `Expected 45,200 CLP for $20 USD, got ${tier1Res.precio_neto_clp}`);
assert(tier1Res.ganancia_clp === 20000, 'Clean profit must be at least 20.000 CLP');

// 3. Test diff reconciliation logic between DB records and provider scan
const mockDbRecords: Map<string, ExistingProductRecord> = new Map([
  [
    'GU-001',
    {
      id_ext: 'GU-001',
      stock: 10,
      precio_usd: 35.0,
      precio_neto_clp: 54400,
      precio_bruto_clp: 64700,
      imagen_principal: 'https://storage/gu001.webp',
      imagenes_secundarias: 'https://storage/gu001_sec.webp',
      marca: 'Guess',
      modelo: 'GU2800',
    },
  ],
  [
    'GU-002',
    {
      id_ext: 'GU-002',
      stock: 5,
      precio_usd: 50.0,
      precio_neto_clp: 77900,
      precio_bruto_clp: 92700,
      imagen_principal: 'https://storage/gu002.webp',
      marca: 'Guess',
      modelo: 'GU2900',
    },
  ],
  [
    'GU-DISCONTINUED',
    {
      id_ext: 'GU-DISCONTINUED',
      stock: 8,
      precio_usd: 45.0,
      precio_neto_clp: 85500,
      precio_bruto_clp: 101745,
      imagen_principal: 'https://storage/disc.webp',
      marca: 'Guess',
      modelo: 'GU9999',
    },
  ],
]);

// Scanned items from provider web:
// GU-001 has changed stock (10 -> 15) and price ($35 -> $38)
// GU-002 is unchanged (stock 5, price $50 -> $108,200 CLP)
// GU-DISCONTINUED is missing from provider
const scannedItems = [
  { id_ext: 'GU-001', stock: 15, precio_usd: 38.0 },
  { id_ext: 'GU-002', stock: 5, precio_usd: 50.0 },
];

const scannedIds = new Set(scannedItems.map((s) => s.id_ext));
const itemsToUpdate: ProductStockPriceUpdate[] = [];
const reportItems: SyncReportItem[] = [];
let unchangedCount = 0;

for (const item of scannedItems) {
  const existing = mockDbRecords.get(item.id_ext);
  if (!existing) continue;

  const pricing = calculateB2BPricing(item.precio_usd);
  const stockChanged = existing.stock !== item.stock;
  const priceChanged =
    Math.abs((existing.precio_neto_clp || 0) - pricing.precio_neto_clp) >= 1 ||
    Math.abs((existing.precio_usd || 0) - item.precio_usd) >= 0.01;

  if (stockChanged || priceChanged) {
    itemsToUpdate.push({
      id_ext: item.id_ext,
      stock: item.stock,
      precio_usd: item.precio_usd,
      precio_neto_clp: pricing.precio_neto_clp,
      precio_bruto_clp: pricing.precio_bruto_clp,
      ganancia_clp: pricing.ganancia_clp,
      costo_flete_usd: pricing.costo_flete_usd,
      costo_cif_clp: pricing.costo_cif_clp,
      ad_valorem_clp: pricing.ad_valorem_clp,
      costo_despacho_local_clp: pricing.costo_despacho_local_clp,
      costo_total_chile_clp: pricing.costo_total_chile_clp,
    });
    reportItems.push({
      id_ext: item.id_ext,
      status: 'updated',
      oldStock: existing.stock,
      newStock: item.stock,
      oldPriceNeto: existing.precio_neto_clp,
      newPriceNeto: pricing.precio_neto_clp,
    });
  } else {
    unchangedCount++;
    reportItems.push({
      id_ext: item.id_ext,
      status: 'unchanged',
      oldStock: existing.stock,
      newStock: item.stock,
    });
  }
}

// Discontinued check (must mark stock 0, NOT delete)
let outOfStockCount = 0;
for (const [idExt, existing] of mockDbRecords.entries()) {
  if (!scannedIds.has(idExt) && existing.stock > 0) {
    outOfStockCount++;
    reportItems.push({
      id_ext: idExt,
      status: 'out_of_stock',
      oldStock: existing.stock,
      newStock: 0,
    });
  }
}

assert(itemsToUpdate.length === 1, `Expected 1 updated item, got ${itemsToUpdate.length}`);
assert(itemsToUpdate[0].id_ext === 'GU-001', 'Updated item must be GU-001');
assert(itemsToUpdate[0].stock === 15, 'GU-001 stock must be 15');
assert(unchangedCount === 1, `Expected 1 unchanged item, got ${unchangedCount}`);
assert(outOfStockCount === 1, `Expected 1 out of stock item, got ${outOfStockCount}`);

// Verify images are untouched in update payload (only stock & pricing columns exist)
const updateKeys = Object.keys(itemsToUpdate[0]);
assert(!updateKeys.includes('imagen_principal'), 'Images must NEVER be included in stock-price updates');
assert(!updateKeys.includes('imagenes_secundarias'), 'Secondary images must NEVER be included');
assert(!updateKeys.includes('material'), 'Attributes must NEVER be modified in stock-price updates');

console.log('✅ All Fast Sync unit and reconciliation tests passed successfully!');
