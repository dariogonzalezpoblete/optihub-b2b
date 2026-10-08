const fs = require('fs');
const files = [
  'frontend/components/catalog/ProductCard.tsx',
  'frontend/components/catalog/QuickViewModal.tsx',
  'frontend/components/catalog/RecentlyViewed.tsx',
  'frontend/app/producto/[marca]/[modelo]/ProductClientView.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/unoptimizedsrc/g, 'unoptimized src');
    content = content.replace(/unoptimizedkey/g, 'unoptimized key');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed ' + file);
  }
});

