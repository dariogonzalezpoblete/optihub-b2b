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

// 2. Standard brand (Guess: 45% margin) with $20.000 CLP minimum profit floor:
// GU00276 ($13.50 USD):
// FOB CLP = 13.50 * 950 = 12.825 CLP
// Costo Total Neto = 12.825 + 6.192 = 19.017 CLP
// Margin 45% = 8.558 CLP < $20.000 floor -> enforces $20.000 clean profit floor!
// precio_neto_clp = Math.round((19.017 + 20.000) / 100) * 100 = $39.000 CLP
const gu00276 = calculateB2BPricing(13.5, 'Guess');
assert(gu00276.costo_total_chile_clp === 19017, `GU00276 landed cost 19.017 (got ${gu00276.costo_total_chile_clp})`);
assert(gu00276.precio_neto_clp === 39000, `GU00276 $13.50 USD precio neto 39.000 (got ${gu00276.precio_neto_clp})`);
assert(gu00276.ganancia_clp === 20000, `GU00276 clean profit floor of 20.000 CLP (got ${gu00276.ganancia_clp})`);
assert(gu00276.iva_clp === Math.round(gu00276.precio_neto_clp * 0.19), 'IVA 19% calculation');

// GU00254 ($24.50 USD, Guess):
// FOB CLP = 24.50 * 950 = 23.275 CLP
// Costo Total Neto = 23.275 + 6.192 = 29.467 CLP
// Margin 45% = 13.260 CLP < $20.000 floor -> enforces $20.000 clean profit floor!
// precio_neto_clp = Math.round((29.467 + 20.000) / 100) * 100 = $49.500 CLP
const gu00254 = calculateB2BPricing(24.5, 'Guess');
assert(gu00254.costo_total_chile_clp === 29467, `GU00254 landed cost 29.467 (got ${gu00254.costo_total_chile_clp})`);
assert(gu00254.precio_neto_clp === 49500, `GU00254 $24.50 USD precio neto 49.500 (got ${gu00254.precio_neto_clp})`);
assert(gu00254.ganancia_clp === 20000, `GU00254 clean profit floor of 20.000 CLP (got ${gu00254.ganancia_clp})`);

// 3. Luxury brand (Tom Ford: 50% margin) - $100.00 USD:
// FOB CLP = 100.00 * 950 = 95.000 CLP
// Costo Total Neto = 95.000 + 6.192 = 101.192 CLP
// Margin 50% = 50.596 CLP > $20.000 floor
// precio_neto_clp = Math.round((101.192 * 1.50) / 100) * 100 = $151.800 CLP
const tomFord = calculateB2BPricing(100.0, 'Tom Ford');
assert(tomFord.costo_total_chile_clp === 101192, `Tom Ford landed cost 101.192 (got ${tomFord.costo_total_chile_clp})`);
assert(tomFord.precio_neto_clp === 151800, `Tom Ford $100 USD precio neto 151.800 (got ${tomFord.precio_neto_clp})`);

// 4. Explicit margin override (e.g. 35% margin on $50.00 USD):
// FOB CLP = 50.00 * 950 = 47.500 CLP
// Costo Total Neto = 47.500 + 6.192 = 53.692 CLP
// Margin 35% = 18.792 CLP < $20.000 floor -> enforces $20.000 minimum profit floor
// precio_neto_clp = Math.round((53.692 + 20.000) / 100) * 100 = $73.700 CLP
const overrideRes = calculateB2BPricing(50.0, undefined, { marginPercentage: 35 });
assert(overrideRes.costo_total_chile_clp === 53692, `Override landed cost 53.692 (got ${overrideRes.costo_total_chile_clp})`);
assert(overrideRes.precio_neto_clp === 73700, `Override $50 USD with 35% margin (got ${overrideRes.precio_neto_clp})`);

console.log('✅ All Gated Pricing tests passed successfully!');
