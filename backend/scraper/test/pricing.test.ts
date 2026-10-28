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

// 2. Tier 1 (Costo Chile <= $45.000 CLP -> Ganancia fija +$18.000 CLP)
// Price $15.00 USD -> Costo Chile ~ $25.661 CLP -> Ganancia $18.000 CLP -> Neto $44.000 CLP
const tier1 = calculateB2BPricing(15.0);
assert(tier1.costo_cif_clp === Math.round((15 + 8) * 950), 'CIF calculation');
assert(tier1.ganancia_clp >= 18000, `Tier 1 margin (got ${tier1.ganancia_clp})`);
assert(tier1.precio_neto_clp === 44000, `Tier 1 precio neto (got ${tier1.precio_neto_clp})`);
assert(tier1.iva_clp === Math.round(tier1.precio_neto_clp * 0.19), 'IVA 19% calculation');

// 3. Tier 2 (Costo Chile $45.001 - $70.000 CLP -> Ganancia fija +$28.000 CLP)
// Price $50.00 USD -> Costo Chile ~ $60.906 CLP -> Ganancia $28.000 CLP -> Neto $89.000 CLP
const tier2 = calculateB2BPricing(50.0);
assert(tier2.ganancia_clp >= 28000, `Tier 2 margin (got ${tier2.ganancia_clp})`);
assert(tier2.precio_neto_clp === 89000, `Tier 2 calculation (got ${tier2.precio_neto_clp})`);

// 4. Tier 3 (Costo Chile > $70.000 CLP -> Ganancia fija +$50.000 CLP)
// Price $100.00 USD -> Costo Chile ~ $111.256 CLP -> Ganancia $50.000 CLP -> Neto $161.000 CLP
const tier3 = calculateB2BPricing(100.0);
assert(tier3.precio_neto_clp > tier3.costo_total_chile_clp, 'Tier 3 must cover landed costs');
assert(tier3.ganancia_clp >= 49000, `Tier 3 margin bracket (got ${tier3.ganancia_clp})`);
assert(tier3.precio_neto_clp === 161000, `Tier 3 precio neto (got ${tier3.precio_neto_clp})`);

console.log('✅ All Gated Pricing tests passed successfully!');
