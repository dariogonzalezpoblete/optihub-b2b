const fs = require('fs');

const authorizedBrandsList = ['Abercrombie & Fitch', 'Adensco', 'Adidas', 'Anne Klein', 'Balenciaga', 'Banana Republic', 'Bebe', 'BMW', 'Bolle', 'Burberry', 'Calvin Klein', 'Calvin Klein Jeans', 'Canada Goose', 'Carrera', 'Charriol', 'Chesterfield', 'Chopard', 'Christian Lacroix', 'Coach', 'Cole Haan', 'Converse', 'Cutler and Gross', 'David Beckham', 'DIFF Eyewear', 'DKNY', 'Dolce & Gabbana', 'Draper James', 'Elasta', 'Emilio Pucci', 'Emozioni', 'Emporio Armani', 'Escada', 'Etro', 'Ferrari', 'FILA', 'Flexon', 'Fossil', 'Furla', 'GANT', 'GAP', 'Genesis', 'Gucci', 'Guess', 'Guess by Marciano', 'Guess Factory', 'Harley Davidson', 'HUGO', 'Hugo Boss', 'IC Berlin', 'Isabel Marant', 'J. Landon', 'Jimmy Choo', 'Joe optical', 'Jones New York', 'Joseph Abboud', 'Juicy Couture', 'Just Cavalli', 'Karl Lagerfeld', 'Kate Spade', 'Kenneth Cole New York', 'Kenneth Cole Reaction', 'Lacoste', 'Levis', 'Liz Claiborne', 'Longchamp', 'Lucky Brand', 'Marc Jacobs', 'Max & Co', 'Max Mara', 'McAllister', 'MCM', 'Michael Kors', 'Missoni', 'Miu Miu', 'Moschino', 'Moschino Love', 'Nautica', 'Nike', 'Nine West', 'Off White', 'ONeill', 'Palm Angels', 'Pepe Jeans', 'Persol', 'Philipp Plein', 'Polaroid Core', 'Police', 'Polo', 'Polo Ralph Lauren', 'Porsche', 'Prada', 'Prada Sport', 'Prive Revaux', 'Ralph Lauren', 'Roberto Cavalli', 'Rudy Project', 'Salt', 'Salvatore Ferragamo', 'Silhouette', 'Skechers', 'SPY', 'Spyder', 'Superdry', 'Swarovski', 'Tiffany', 'Timberland', 'Tom Ford', 'Tommy Hilfiger', 'Tory Burch', 'Tous', 'Under Armour', 'Versace', 'Victoria Beckham', 'Web', 'Yves Saint Laurent', 'Zeiss'];

// 1. Update filterEngine.ts
let fe = fs.readFileSync('frontend/lib/catalog/filterEngine.ts', 'utf8');

const enrichRegex = /export function enrichMarcos\\(list: Marco\\[\\]\\): EnrichedMarco\\[\\] \\{[\\s\\S]*?return list\\.map\\(\\(m\\) => \\{[\\s\\S]*?\\}\\);\\n\\}/;

const newEnrich = 'export const AUTHORIZED_BRANDS = ' + JSON.stringify(authorizedBrandsList) + ';\n\n' +
'export function enrichMarcos(list: Marco[]): EnrichedMarco[] {\n' +
'  // Filtrar estrictamente solo las marcas autorizadas\n' +
'  const filteredList = list.filter(m =>\n' +
'    AUTHORIZED_BRANDS.some(b => b.toLowerCase() === m.marca.toLowerCase())\n' +
'  );\n\n' +
'  return filteredList.map((m) => {\n' +
'    const dims = parseTamano(m.tamano);\n' +
'    return {\n' +
'      ...m,\n' +
'      _dims: dims,\n' +
'      _k: {\n' +
'        marca: normalizeText(m.marca),\n' +
'        genero: normalizeText(m.genero),\n' +
'        material: normalizeText(m.material),\n' +
'        forma: normalizeText(m.forma),\n' +
'        calibre: dims ? calibreRangeKey(dims.calibre) : \\'\\',\n' +
'      },\n' +
'      _search: [m.marca, m.modelo, m.id_ext, m.codigo_color, m.color, m.upc]\n' +
'        .map(normalizeText)\n' +
'        .join(\\'|\\'),\n' +
'    };\n' +
'  });\n' +
'}';

fe = fe.replace(enrichRegex, newEnrich);
fs.writeFileSync('frontend/lib/catalog/filterEngine.ts', fe, 'utf8');

// 2. Update BrandDirectory.tsx
let bd = fs.readFileSync('frontend/components/brands/BrandDirectory.tsx', 'utf8');
const bdRegex = /const ALL_BRANDS = \\[[\\s\\S]*?\\]\\.sort\\(\\);/;
bd = bd.replace(bdRegex, 'const ALL_BRANDS = ' + JSON.stringify(authorizedBrandsList) + '.sort();');
fs.writeFileSync('frontend/components/brands/BrandDirectory.tsx', bd, 'utf8');

// 3. Update BrandMarquee.tsx
const marqueeTopBrands = ['Balenciaga', 'Burberry', 'Chopard', 'Dolce & Gabbana', 'Emporio Armani', 'Gucci', 'Hugo Boss', 'Jimmy Choo', 'Marc Jacobs', 'Michael Kors', 'Prada', 'Salvatore Ferragamo', 'Tom Ford', 'Versace', 'Yves Saint Laurent', 'Zeiss'];
let bm = fs.readFileSync('frontend/components/brands/BrandMarquee.tsx', 'utf8');
const bmRegex = /const TOP_BRANDS = \\[[\\s\\S]*?\\];/;
bm = bm.replace(bmRegex, 'const TOP_BRANDS = ' + JSON.stringify(marqueeTopBrands) + ';');
fs.writeFileSync('frontend/components/brands/BrandMarquee.tsx', bm, 'utf8');

console.log('Brands strictly filtered and updated successfully.');
