const fs = require('fs');
let content = fs.readFileSync('frontend/app/catalogo/page.tsx', 'utf8');

if (!content.includes('import QuickViewModal')) {
    content = content.replace(
        'import ProductCard from \\'@/components/catalog/ProductCard\\';',
        'import ProductCard from \\'@/components/catalog/ProductCard\\';\\nimport QuickViewModal from \\'@/components/catalog/QuickViewModal\\';'
    );
}

// Also fix 'groupedMarcos'. In page.tsx it was probably 'Object.values(marcosGrupos)' or similar?
// Let's check how 'groupedMarcos' is defined.

