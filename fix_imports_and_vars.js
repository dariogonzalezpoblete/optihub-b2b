const fs = require('fs');
let content = fs.readFileSync('frontend/app/catalogo/page.tsx', 'utf8');

// Fix import
if (!content.includes('import QuickViewModal')) {
    content = content.replace(
        'import ProductCard from \\'@/components/catalog/ProductCard\\';',
        'import ProductCard from \\'@/components/catalog/ProductCard\\';\\nimport QuickViewModal from \\'@/components/catalog/QuickViewModal\\';'
    );
}

// Fix variables
content = content.replace(/groupedMarcos/g, 'groupedResults');

fs.writeFileSync('frontend/app/catalogo/page.tsx', content, 'utf8');
console.log('Fixed catalogo imports and vars');

