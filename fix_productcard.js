const fs = require('fs');
let code = fs.readFileSync('frontend/components/catalog/ProductCard.tsx', 'utf8');

code = code.replace(
  'className=\w-9 h-9 rounded-lg border overflow-hidden',
  'className=\elative w-9 h-9 rounded-lg border overflow-hidden'
);

fs.writeFileSync('frontend/components/catalog/ProductCard.tsx', code, 'utf8');
console.log('Fixed ProductCard.');

