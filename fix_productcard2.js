const fs = require('fs');
let code = fs.readFileSync('frontend/components/catalog/ProductCard.tsx', 'utf8');

code = code.replace(
  'className=\w-8 h-8 rounded-full border-2 bg-slate-900 overflow-hidden',
  'className=\elative w-8 h-8 rounded-full border-2 bg-slate-900 overflow-hidden'
);

fs.writeFileSync('frontend/components/catalog/ProductCard.tsx', code, 'utf8');
console.log('Fixed ProductCard 2.');

