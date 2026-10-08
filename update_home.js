const fs = require('fs');
let code = fs.readFileSync('frontend/app/page.tsx', 'utf8');

code = code.replace(/const CATEGORIAS_B2B = \\[[\\s\\S]*?\\];/, \const CATEGORIAS_B2B = [
  {
    titulo: 'Monturas Ópticas',
    descripcion: 'Marcos oftálmicos graduables para lentes de receta. Diseño, durabilidad y máxima rentabilidad B2B.',
    badge: 'Uso Clínico y Diario',
    url: '/catalogo?q=optico',
  },
  {
    titulo: 'Lentes de Sol',
    descripcion: 'Gafas solares con protección UV y estilos en tendencia. Modelos premium para tu vitrina.',
    badge: 'Protección Solar',
    url: '/catalogo?q=sol',
  }
];\);

code = code.replace('grid-cols-1 md:grid-cols-3 gap-6', 'grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto');

code = code.replace(/href={\\\\\/catalogo\\?marca=\\\\\\$\\{encodeURIComponent\\(cat\\.filtro\\)\\}\\}/g, 'href={cat.url}');

fs.writeFileSync('frontend/app/page.tsx', code, 'utf8');
console.log('Fixed CATEGORIAS_B2B');
