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
    // Replace <Image with <Image unoptimized
    // Make sure we don't duplicate it
    content = content.replace(/<Image(\s+)/g, '<Image unoptimized');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed ' + file);
  }
});

