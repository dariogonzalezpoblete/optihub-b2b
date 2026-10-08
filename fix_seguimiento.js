const fs = require('fs');
let code = fs.readFileSync('frontend/app/seguimiento/page.tsx', 'utf8');

code = code.split('\\`').join('`');
code = code.split('\\$').join('$');

fs.writeFileSync('frontend/app/seguimiento/page.tsx', code, 'utf8');
console.log('Fixed syntax error in seguimiento/page.tsx');
