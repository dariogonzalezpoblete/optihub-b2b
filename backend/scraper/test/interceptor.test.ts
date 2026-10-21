import { NetworkInterceptor } from '../src/services/interceptor';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('Testing Network Interceptor & API Normalization...');

const interceptor = new NetworkInterceptor({ minStock: 5, targetBrand: 'Guess' });

// 1. Mock provider XHR / Fetch JSON payload
const mockPayload = {
  status: 'success',
  data: {
    items: [
      {
        id: '12345',
        sku: 'GU0294',
        brand: 'Guess',
        model: 'GU0294',
        color: 'Shiny Black',
        color_code: '001',
        wholesale_price: 45.0,
        stock: 25,
        gender: 'Unisex',
        material: 'Acetate',
        shape: 'Square',
        images: ['https://www.nywd.com/pictures/GU0294_001_front.jpg', 'https://www.nywd.com/pictures/GU0294_001_side.jpg'],
      },
      {
        id: '12346',
        sku: 'GU0295',
        brand: 'Guess',
        model: 'GU0295',
        color: 'Havana',
        color_code: '052',
        wholesale_price: 38.0,
        stock: 2, // Should be filtered out due to minStock <= 5
      },
    ],
  },
};

// Simulate normalization of items
const item1 = interceptor.normalizeItem(mockPayload.data.items[0], 'https://www.nywd.com/wholesale');
assert(item1 !== null, 'Item 1 should normalize cleanly');
assert(item1?.id_ext === 'GU0294-001', `Expected GU0294-001, got ${item1?.id_ext}`);
assert(item1?.marca === 'Guess', 'Brand matches');
assert(item1?.stock === 25, 'Stock matches');
assert(item1?.precio_usd === 45.0, 'USD price matches');
assert(item1?.precio_neto_clp > 0, 'Net B2B price calculated');
assert(item1?.precio_bruto_clp > item1?.precio_neto_clp, 'Gross price includes IVA');
assert(item1?.imagen_principal.includes('pictures/GU0294_001_front.jpg'), 'Main image cleaned');
assert(item1?.imagenes_secundarias.includes('pictures/GU0294_001_side.jpg'), 'Secondary image cleaned');

// Test low stock item
const item2 = interceptor.normalizeItem(mockPayload.data.items[1], 'https://www.nywd.com/wholesale');
assert(item2 !== null && item2.stock === 2, 'Item 2 stock is 2');

console.log('✅ Interceptor & Normalization tests passed successfully!');
