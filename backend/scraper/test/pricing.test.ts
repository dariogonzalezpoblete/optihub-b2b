import { calculateB2BPricing } from '../src/services/pricing';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('Running B2B Pricing Engine tests...');

// 1. Zero / Negative
const zero = calculateB2BPricing(0);
assert(zero.precio_neto_clp === 0, 'Zero price should yield 0 CLP net');
assert(zero.precio_bruto_clp === 0, 'Zero price should yield 0 CLP gross');
assert(zero.iva_clp === 0, 'Zero price should yield 0 CLP IVA');

// 2. Tier 1 (< 20,000 CLP at 950 USD/CLP -> price < $21.05)
// Let price = $15.00
const tier1 = calculateB2BPricing(15.0);
// 15 * 2500 = 37,500 CLP net
assert(tier1.precio_neto_clp === 38000 || tier1.precio_neto_clp === 37000 || tier1.precio_neto_clp === 37500 || tier1.precio_neto_clp === 38000, 'Tier 1 calculation');
assert(tier1.costo_cif_clp === Math.round((15 + 8) * 950), 'CIF calculation');
assert(tier1.iva_clp === Math.round(tier1.precio_neto_clp * 0.19), 'IVA 19% calculation');
assert(tier1.ganancia_clp > 0, 'Profit must be positive');

// 3. Tier 2 (20,000 to 70,000 CLP -> $21.05 to $73.68)
// Let price = $50.00
const tier2 = calculateB2BPricing(50.0);
// 50 * 1900 = 95,000 CLP net
assert(tier2.precio_neto_clp === 95000, `Tier 2 calculation (got ${tier2.precio_neto_clp})`);
assert(tier2.costo_cif_clp === Math.round((50 + 8) * 950), 'CIF tier 2');
assert(tier2.iva_clp === Math.round(95000 * 0.19), 'IVA tier 2');

// 4. Tier 3 (70,000 to 120,000 CLP -> $73.68 to $126.31)
// Let price = $100.00
const tier3 = calculateB2BPricing(100.0);
assert(tier3.precio_neto_clp > tier3.costo_total_chile_clp, 'Tier 3 must cover landed costs');
assert(tier3.ganancia_clp >= 59000, 'Tier 3 margin bracket');

console.log('✅ All Gated Pricing tests passed successfully!');
