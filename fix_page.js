const fs = require('fs');
let code = fs.readFileSync('frontend/app/page.tsx', 'utf8');

code = code.replace(
  'href={\/catalogo?marca=\}',
  'href={/catalogo?}'
);

fs.writeFileSync('frontend/app/page.tsx', code, 'utf8');
console.log('Fixed link');
