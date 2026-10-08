const fs = require('fs');
let code = fs.readFileSync('frontend/app/page.tsx', 'utf8');

const importStatement = 'import RecentlyViewed from \\'@/components/catalog/RecentlyViewed\\';\\n';
if (!code.includes('RecentlyViewed')) {
    code = code.replace('import BrandDirectory from \\'@/components/brands/BrandDirectory\\';', 'import BrandDirectory from \\'@/components/brands/BrandDirectory\\';\\n' + importStatement);
}

const injectionPoint = '{/* 5. PILARES CORPORATIVOS Y GARANTÍAS B2B */}';
if (code.includes(injectionPoint)) {
    code = code.replace(injectionPoint, '<RecentlyViewed />\\n\\n      ' + injectionPoint);
    fs.writeFileSync('frontend/app/page.tsx', code, 'utf8');
    console.log('Injected RecentlyViewed into Home');
}
