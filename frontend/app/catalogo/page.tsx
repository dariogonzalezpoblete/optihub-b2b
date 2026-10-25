import { Suspense } from 'react';
import type { Metadata } from 'next';
import { supabase } from '@/lib/supabaseClient';
import CatalogoClient from '@/components/catalog/CatalogoClient';
import { normalizeText } from '@/lib/catalog/normalize';
import { isFillerBrand } from '@/lib/catalog/brandCategories';
import { MARCOS_FACET_PUBLIC_COLUMNS, MARCOS_PUBLIC_COLUMNS } from '@/lib/catalog/types';

// Renderizado dinámico inmediato para reflejar cambios de stock y nuevas marcas al instante
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BASE_URL = process.env.SITE_URL || 'https://optihub-b2b.vercel.app';

export const metadata: Metadata = {
  title: 'Catálogo Mayorista de Armazones y Gafas de Sol',
  description: 'Catálogo mayorista de armazones graduables y lentes de sol de primeras marcas para ópticas en Chile. Precios netos en CLP, stock en origen y compra mínima de 10 unidades combinables.',
  alternates: {
    canonical: `${BASE_URL}/catalogo`,
  },
  openGraph: {
    title: 'Catálogo Mayorista de Armazones y Gafas de Sol | OptiHub',
    description: 'Importación directa desde EE.UU. con stock verificado en origen en tiempo real. Precios netos en CLP y entrega en 10 a 15 días hábiles.',
    url: `${BASE_URL}/catalogo`,
    siteName: 'OptiHub B2B',
    locale: 'es_CL',
    type: 'website',
  },
};

function CatalogSkeleton() {
  return (
    <div className="min-h-screen bg-[#F7F6F2] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="h-28 bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-80 bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

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

  // 2. Consulta optimizada en una sola llamada de metadatos globales para facetas
  const { data: allFacetItems } = await supabase
    .from('marcos')
    .select(MARCOS_FACET_PUBLIC_COLUMNS)
    .limit(2500);

  const facetList = (allFacetItems || []).filter(
    (item) => !isFillerBrand(item.marca) && item.marca && item.marca.toLowerCase() !== 'select'
  );
  const allDbBrands = Array.from(new Set(facetList.map((r) => r.marca).filter((b) => b && b.toLowerCase() !== 'select')));
  const allDbGeneros = Array.from(new Set(facetList.map((r) => r.genero).filter((g) => g && g.toLowerCase() !== 'select')));
  const allDbMateriales = Array.from(new Set(facetList.map((r) => r.material).filter((m) => m && m.toLowerCase() !== 'select')));
  const allDbFormas = Array.from(new Set(facetList.map((r) => r.forma).filter((f) => f && f.toLowerCase() !== 'select')));

  // 3. Construcción de Query a Supabase (solo columnas públicas no sensibles; RLS filtra stock > 0 para anon)
  let query = supabase.from('marcos').select(MARCOS_PUBLIC_COLUMNS, { count: 'exact' });

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
  } else {
    // Ocultar marcas de relleno de bajo valor para proyectar máxima exclusividad
    query = query.not('marca', 'in', '("GAP","Gap","Chesterfield","Adensco","Bebe","Emozioni","Elasta")');
  }

  const colores = parseList(params.color);
  if (colores.length > 0) {
    const colorFilters = colores.map((c) => {
      if (c === 'negro') return 'color.ilike.%black%,color.ilike.%negro%';
      if (c === 'carey') return 'color.ilike.%havana%,color.ilike.%tortoise%,color.ilike.%carey%';
      if (c === 'dorado') return 'color.ilike.%gold%,color.ilike.%dorad%';
      if (c === 'plateado') return 'color.ilike.%silver%,color.ilike.%gunmetal%,color.ilike.%platead%';
      if (c === 'azul') return 'color.ilike.%blue%,color.ilike.%azul%,color.ilike.%navy%';
      if (c === 'marron') return 'color.ilike.%brown%,color.ilike.%marron%,color.ilike.%cafe%';
      if (c === 'gris') return 'color.ilike.%grey%,color.ilike.%gray%,color.ilike.%gris%';
      if (c === 'rosa') return 'color.ilike.%pink%,color.ilike.%rose%,color.ilike.%red%,color.ilike.%rojo%,color.ilike.%violet%';
      if (c === 'blanco') return 'color.ilike.%white%,color.ilike.%blanco%,color.ilike.%ivory%,color.ilike.%beige%';
      if (c === 'cristal') return 'color.ilike.%crystal%,color.ilike.%clear%,color.ilike.%transparent%';
      return `color.ilike.%${c}%`;
    }).join(',');
    if (colorFilters) {
      query = query.or(colorFilters);
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

  // 6. Ordenamiento en SSR (anon): solo por columnas públicas autorizadas
  switch (sort) {
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
    <Suspense fallback={<CatalogSkeleton />}>
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
