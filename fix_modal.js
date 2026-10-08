const fs = require('fs');
let content = fs.readFileSync('frontend/app/catalogo/page.tsx', 'utf8');

if (!content.includes('QuickViewModal')) {
    content = content.replace(
        'import ProductCard from \'@/components/catalog/ProductCard\';',
        'import ProductCard from \'@/components/catalog/ProductCard\';\nimport QuickViewModal from \'@/components/catalog/QuickViewModal\';'
    );
}

const startTag = '{/* Modal de Detalle de Producto */}';
const endTag = '{/* Drawer de filtros (mobile) */}';

const startIdx = content.indexOf(startTag);
const endIdx = content.indexOf(endTag);

if (startIdx !== -1 && endIdx !== -1) {
    const replacement = '{/* Modal de Vista Rapida (Quick View) */}\n' +
          '          <QuickViewModal \n' +
          '            variants={selectedProduct ? groupedMarcos.find(g => g[0].modelo === selectedProduct.modelo && g[0].marca === selectedProduct.marca) || [selectedProduct] : []}\n' +
          '            isOpen={!!selectedProduct} \n' +
          '            onClose={() => setSelectedProduct(null)} \n' +
          '          />\n\n' +
          '      </div>\n\n      ';
    content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
    fs.writeFileSync('frontend/app/catalogo/page.tsx', content, 'utf8');
    console.log('Replaced successfully');
} else {
    console.log('Could not find tags');
}

