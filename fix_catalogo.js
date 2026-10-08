const fs = require('fs');

let code = fs.readFileSync('frontend/app/catalogo/page.tsx', 'utf8');

// Replace the old modal with QuickViewModal component
const importModal = 'import QuickViewModal from \'@/components/catalog/QuickViewModal\';\n';
if (!code.includes('QuickViewModal')) {
    code = code.replace('import ProductCard from \'@/components/catalog/ProductCard\';', importModal + 'import ProductCard from \'@/components/catalog/ProductCard\';');
}

// Replace the actual modal rendering
const oldModalStart = code.indexOf('{/* Modal de Detalle de Producto */}');
const oldModalEnd = code.indexOf('</div>\n    </div>\n  );\n}\n');

if (oldModalStart !== -1 && oldModalEnd !== -1) {
    const newModalRender = {/* Modal de Vista Rápida (Quick View) */}
          {selectedProduct && (
            <QuickViewModal 
              variants={groupedMarcos.find(group => group[0].id_ext === selectedProduct.id_ext) || [selectedProduct]}
              isOpen={!!selectedProduct} 
              onClose={() => setSelectedProduct(null)} 
            />
          )};
    
    code = code.substring(0, oldModalStart) + newModalRender + '\n' + code.substring(oldModalEnd);
}

fs.writeFileSync('frontend/app/catalogo/page.tsx', code, 'utf8');
console.log('Catalogo page updated with QuickViewModal');
