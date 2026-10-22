import { Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import CatalogoClient from '@/components/catalog/CatalogoClient';
import { normalizeText } from '@/lib/catalog/normalize';

// Renderizado dinámico inmediato para reflejar cambios de stock y nuevas marcas al instante
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // 1. Parsing params de URL
  const page = Math.max(1, parseInt(params.page as string) || 1);
  const limitStr = parseInt(params.limit as string) || 48;
  const limit = Math.max(1, Math.min(limitStr, 120));
  const q = (params.q as string) || '';
  const sort = (params.sort as string) || 'relevancia';

  // 2. Consulta de metadatos globales de TODO el inventario con stock activo en Supabase
  // Esto asegura que TODOS los armazones y marcas cargadas alimenten el árbol de filtros dinámico
  const { data: allFacetItems } = await supabase
    .from('marcos')
    .select('id, id_ext, marca, modelo, genero, material, forma, tamano, stock')
    .gt('stock', 0);

  const facetList = allFacetItems || [];
  const allDbBrands = Array.from(new Set(facetList.map((r) => r.marca).filter(Boolean)));
  const allDbGeneros = Array.from(new Set(facetList.map((r) => r.genero).filter(Boolean)));
  const allDbMateriales = Array.from(new Set(facetList.map((r) => r.material).filter(Boolean)));
  const allDbFormas = Array.from(new Set(facetList.map((r) => r.forma).filter(Boolean)));

  // 3. Construcción de Query a Supabase
  let query = supabase.from('marcos').select('*', { count: 'exact' });

  // 4. Búsqueda por texto libre
  if (q) {
    const cleanQ = q.trim();
    query = query.or(`modelo.ilike.%${cleanQ}%,marca.ilike.%${cleanQ}%,id_ext.ilike.%${cleanQ}%`);
  }

  const parseList = (str: string | string[] | undefined) => {
    if (!str) return [];
    if (Array.isArray(str)) return str;
    return str.split(',').filter(Boolean);
  };

  // 5. Filtros con resolución insensible a mayúsculas, tildes y espacios
  const marcas = parseList(params.marca);
  if (marcas.length > 0) {
    const matched = allDbBrands.filter((dbBrand) =>
      marcas.some((m) => normalizeText(m) === normalizeText(dbBrand))
    );
    if (matched.length > 0) {
      query = query.in('marca', matched);
    }
  }

  const generos = parseList(params.genero);
  if (generos.length > 0) {
    const matched = allDbGeneros.filter((dbg) =>
      generos.some((g) => normalizeText(g) === normalizeText(dbg))
    );
    if (matched.length > 0) {
      query = query.in('genero', matched);
    }
  }

  const materiales = parseList(params.material);
  if (materiales.length > 0) {
    const matched = allDbMateriales.filter((dbm) =>
      materiales.some((m) => normalizeText(m) === normalizeText(dbm))
    );
    if (matched.length > 0) {
      query = query.in('material', matched);
    }
  }

  const formas = parseList(params.forma);
  if (formas.length > 0) {
    const matched = allDbFormas.filter((dbf) =>
      formas.some((f) => normalizeText(f) === normalizeText(dbf))
    );
    if (matched.length > 0) {
      query = query.in('forma', matched);
    }
  }

  // 6. Ordenamiento
  switch (sort) {
    case 'precio-asc':
      query = query.order('precio_neto_clp', { ascending: true });
      break;
    case 'precio-desc':
      query = query.order('precio_neto_clp', { ascending: false });
      break;
    case 'stock':
      query = query.order('stock', { ascending: false });
      break;
    case 'modelo':
      query = query.order('modelo', { ascending: true });
      break;
    default:
      query = query.order('id_ext', { ascending: true });
  }

  // 7. Paginación Server-Side
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  // 8. Ejecución
  const { data, count, error } = await query;
  
  if (error) {
    console.error('Error fetching catalog server-side:', error);
  }

  const total = count || 0;
  const marcos = data || [];
  const totalPages = Math.ceil(total / limit);

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Cargando catálogo OptiHub...</div>}>
      <CatalogoClient 
        initialMarcos={marcos} 
        totalCount={total} 
        currentPage={page}
        totalPages={totalPages}
        allFacetItems={facetList}
      />
    </Suspense>
  );
}
