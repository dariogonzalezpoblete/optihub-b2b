import { Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import CatalogoClient from '@/components/catalog/CatalogoClient';
import { AUTHORIZED_BRANDS } from '@/lib/catalog/filterEngine';

// Optamos por revalidar frecuentemente o dejar como dinámico dado que es un catálogo
export const revalidate = 60; // SSR cache 60s

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // 1. Parsing params de URL
  const page = Math.max(1, parseInt(params.page as string) || 1);
  const limitStr = parseInt(params.limit as string) || 48; // aprox 12-24 modelos agrupados
  const limit = Math.max(1, Math.min(limitStr, 120)); // Límite técnico
  const q = (params.q as string) || '';
  const sort = (params.sort as string) || 'relevancia';

  // 2. Construcción de Query a Supabase
  let query = supabase.from('marcos').select('*', { count: 'exact' });

  // 3. Filtros
  if (q) {
    // Permite encontrar "RB 2140" o código o marca
    const cleanQ = q.trim();
    query = query.or(`modelo.ilike.%${cleanQ}%,marca.ilike.%${cleanQ}%,id_ext.ilike.%${cleanQ}%`);
  }

  const parseList = (str: string | string[] | undefined) => {
    if (!str) return [];
    if (Array.isArray(str)) return str;
    return str.split(',').filter(Boolean);
  };

  const marcas = parseList(params.marca);
  if (marcas.length > 0) {
    const rawList = marcas.map((m) => m.trim());
    const lowerList = rawList.map((m) => m.toLowerCase());
    const titleList = rawList.map((m) => m.replace(/\b\w/g, (c) => c.toUpperCase()));
    const upperList = rawList.map((m) => m.toUpperCase());
    const matchedAuthorized = AUTHORIZED_BRANDS.filter((b) =>
      lowerList.includes(b.toLowerCase())
    );
    const combined = Array.from(new Set([...rawList, ...lowerList, ...titleList, ...upperList, ...matchedAuthorized]));
    query = query.in('marca', combined);
  }

  const generos = parseList(params.genero);
  if (generos.length > 0) query = query.in('genero', generos);

  const materiales = parseList(params.material);
  if (materiales.length > 0) query = query.in('material', materiales);

  const formas = parseList(params.forma);
  if (formas.length > 0) query = query.in('forma', formas);

  // 4. Ordenamiento
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
      query = query.order('id_ext', { ascending: true }); // relevancia
  }

  // 5. Paginación Server-Side real
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  // 6. Ejecución
  const { data, count, error } = await query;
  
  if (error) {
    console.error('Error fetching catalog server-side:', error);
  }

  const total = count || 0;
  const marcos = data || [];
  const totalPages = Math.ceil(total / limit);

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Cargando catálogo SSR OptiHub...</div>}>
      <CatalogoClient 
        initialMarcos={marcos} 
        totalCount={total} 
        currentPage={page}
        totalPages={totalPages}
      />
    </Suspense>
  );
}