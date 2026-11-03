import { Suspense } from 'react';
import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { supabase } from '@/lib/supabaseClient';
import CatalogoClient from '@/components/catalog/CatalogoClient';
import { calibreRangeKey, extractColorGroup, normalizeText, parseTamano } from '@/lib/catalog/normalize';
import { isOpticalProduct, isSunProduct } from '@/lib/catalog/filterEngine';
import { MARCOS_FACET_PUBLIC_COLUMNS, MARCOS_PUBLIC_COLUMNS } from '@/lib/catalog/types';

interface CachedCatalogFacets {
  facetList: any[];
  allDbBrands: string[];
  allDbColores: string[];
  allDbGeneros: string[];
  allDbMateriales: string[];
  allDbFormas: string[];
  allDbTamanos: string[];
}

/**
 * Consulta agregada de metadatos globales para facetas, optimizada mediante
 * Next.js Data Cache (unstable_cache) con revalidación horaria (3600s).
 * Evita escanear y transferir miles de filas a memoria en cada petición SSR dinámica.
 */
export const getCachedCatalogFacets = unstable_cache(
  async (): Promise<CachedCatalogFacets> => {
    const PAGE_SIZE = 1000;
    const { count: totalFacetCount } = await supabase
      .from('marcos')
      .select('id_ext', { count: 'exact', head: true });

    const countToUse = typeof totalFacetCount === 'number' && totalFacetCount > 0 ? totalFacetCount : 4000;
    const totalPagesFacet = Math.max(1, Math.ceil(countToUse / PAGE_SIZE));
    const facetRequests = [];
    for (let p = 0; p < totalPagesFacet; p++) {
      const from = p * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      facetRequests.push(
        supabase
          .from('marcos')
          .select(MARCOS_FACET_PUBLIC_COLUMNS)
          .range(from, to)
      );
    }
    const facetResponses = await Promise.all(facetRequests);
    const allFacetItems: any[] = [];
    for (const res of facetResponses) {
      if (res.data) {
        allFacetItems.push(...res.data);
      }
    }

    const facetList = (allFacetItems || []).filter(
      (item) => item.marca && item.marca.toLowerCase() !== 'select'
    );
    const allDbBrands = Array.from(new Set(facetList.map((r) => r.marca).filter((b: string) => b && b.toLowerCase() !== 'select')));
    const allDbColores = Array.from(new Set(facetList.map((r) => r.color).filter((c: string) => Boolean(c))));
    const allDbGeneros = Array.from(new Set(facetList.map((r) => r.genero).filter((g: string) => g && g.toLowerCase() !== 'select')));
    const allDbMateriales = Array.from(new Set(facetList.map((r) => r.material).filter((m: string) => m && m.toLowerCase() !== 'select')));
    const allDbFormas = Array.from(new Set(facetList.map((r) => r.forma).filter((f: string) => f && f.toLowerCase() !== 'select')));
    const allDbTamanos = Array.from(new Set(facetList.map((r) => r.tamano).filter((t: string) => Boolean(t))));

    return {
      facetList,
      allDbBrands,
      allDbColores,
      allDbGeneros,
      allDbMateriales,
      allDbFormas,
      allDbTamanos,
    };
  },
  ['catalog-global-facets-v2'],
  {
    revalidate: 3600, // 1 hora de revalidación
    tags: ['catalog-facets'],
  }
);

// Renderizado dinámico inmediato para reflejar cambios de stock y nuevas marcas al instante
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://frontend-gules-three-41.vercel.app');

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
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Catálogo Mayorista OptiHub B2B',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Catálogo Mayorista de Armazones y Gafas de Sol | OptiHub',
    description: 'Importación directa desde EE.UU. Precios netos en CLP y entrega en 10 a 15 días hábiles.',
    images: [`${BASE_URL}/og-image.png`],
  },
};

function CatalogSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="h-28 bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-80 bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl" />
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
  const rawTipo = ((params.tipo as string) || (params.categoria as string) || '').toLowerCase();
  const tipo = rawTipo === 'optico' || rawTipo === 'oftalmico' || rawTipo === 'opticos' || rawTipo === 'oftalmicos'
    ? 'optico'
    : rawTipo === 'sol' || rawTipo === 'solares'
    ? 'sol'
    : '';

  // 2. Consulta de facetas optimizada mediante Next.js Data Cache (unstable_cache - 1 hora)
  const {
    facetList,
    allDbBrands,
    allDbColores,
    allDbGeneros,
    allDbMateriales,
    allDbFormas,
    allDbTamanos,
  } = await getCachedCatalogFacets();

  // 3. Construcción de Query a Supabase (solo columnas públicas no sensibles; RLS filtra stock > 0 para anon)
  let query = supabase.from('marcos').select(MARCOS_PUBLIC_COLUMNS, { count: 'exact' });

  // 4. Búsqueda por texto libre
  if (q) {
    const cleanQ = q.trim();
    query = query.or(`modelo.ilike.%${cleanQ}%,marca.ilike.%${cleanQ}%,id_ext.ilike.%${cleanQ}%,color.ilike.%${cleanQ}%`);
  }

  const parseList = (str: string | string[] | undefined) => {
    if (!str) return [];
    if (Array.isArray(str)) return str.map(normalizeText).filter(Boolean);
    return str.split(',').map(normalizeText).filter(Boolean);
  };

  // 5. Filtros sincronizados 1:1 con filterEngine.ts (insensibles a mayúsculas, tildes y símbolos)
  const marcas = parseList(params.marca);
  if (marcas.length > 0) {
    const matched = allDbBrands.filter((dbBrand) =>
      marcas.includes(normalizeText(dbBrand))
    );
    query = query.in('marca', matched.length > 0 ? matched : ['__NO_MATCH__']);
  }

  const colores = parseList(params.color);
  if (colores.length > 0 || tipo === 'optico' || tipo === 'sol') {
    const matchedColores = allDbColores.filter((dbc) => {
      if (colores.length > 0 && !colores.includes(extractColorGroup(dbc))) {
        return false;
      }
      if (tipo === 'optico' && !isOpticalProduct({ color: dbc })) {
        return false;
      }
      if (tipo === 'sol' && !isSunProduct({ color: dbc })) {
        return false;
      }
      return true;
    });
    query = query.in('color', matchedColores.length > 0 ? matchedColores : ['__NO_MATCH__']);
  }

  const generos = parseList(params.genero);
  if (generos.length > 0) {
    const matched = allDbGeneros.filter((dbg) =>
      generos.includes(normalizeText(dbg))
    );
    query = query.in('genero', matched.length > 0 ? matched : ['__NO_MATCH__']);
  }

  const materiales = parseList(params.material);
  if (materiales.length > 0) {
    const matched = allDbMateriales.filter((dbm) =>
      materiales.includes(normalizeText(dbm))
    );
    query = query.in('material', matched.length > 0 ? matched : ['__NO_MATCH__']);
  }

  const formas = parseList(params.forma);
  if (formas.length > 0) {
    const matched = allDbFormas.filter((dbf) =>
      formas.includes(normalizeText(dbf))
    );
    query = query.in('forma', matched.length > 0 ? matched : ['__NO_MATCH__']);
  }

  const calibres = parseList(params.calibre);
  if (calibres.length > 0) {
    const matchedTamanos = allDbTamanos.filter((dbt) => {
      const dims = parseTamano(dbt);
      if (!dims) return false;
      return calibres.includes(calibreRangeKey(dims.calibre));
    });
    query = query.in('tamano', matchedTamanos.length > 0 ? matchedTamanos : ['__NO_MATCH__']);
  }

  // 6. Ordenamiento en SSR (anon): solo por columnas públicas autorizadas
  switch (sort) {
    case 'modelo':
      query = query.order('marca', { ascending: true }).order('modelo', { ascending: true });
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
