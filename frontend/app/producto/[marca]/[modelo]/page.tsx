import { Suspense } from 'react';
import { Metadata } from 'next';
import { supabase } from '@/lib/supabaseClient';
import { notFound } from 'next/navigation';
import ProductClientView from './ProductClientView';
import RelatedProducts from '@/components/catalog/RelatedProducts';
import { enrichMarcos } from '@/lib/catalog/filterEngine';
import { MARCOS_PUBLIC_COLUMNS, type Marco } from '@/lib/catalog/types';

// Incremental Static Regeneration (revalida cada hora para indexación veloz)
export const revalidate = 3600;

interface Props {
  params: Promise<{
    marca: string;
    modelo: string;
  }>;
}

const BASE_URL = process.env.SITE_URL || 'https://optihub-b2b.vercel.app';

// 1. DYNAMIC METADATA (Google SEO & Canonical)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const decodedMarca = decodeURIComponent(resolvedParams.marca);
  const decodedModelo = decodeURIComponent(resolvedParams.modelo);

  const { data } = await supabase
    .from('marcos')
    .select('marca, modelo, imagen_principal')
    .ilike('marca', decodedMarca)
    .ilike('modelo', decodedModelo)
    .limit(1)
    .single();

  if (!data) {
    return {
      title: 'Producto no encontrado | OptiHub B2B',
      robots: { index: false, follow: false },
    };
  }

  const title = `Armazones ${data.marca} ${data.modelo} al por mayor | OptiHub B2B`;
  const description = `Importación mayorista de armazones ${data.marca} ${data.modelo} para ópticas en Chile. Stock verificado en origen (EE.UU.), entrega en 10-15 días y factura electrónica SII.`;
  const canonicalUrl = `${BASE_URL}/producto/${encodeURIComponent(data.marca)}/${encodeURIComponent(data.modelo)}`;

  return {
    title,
    description,
    keywords: [
      data.marca,
      data.modelo,
      `lentes ${data.marca}`,
      `armazones ${data.marca}`,
      'lentes ópticos mayorista',
      'distribución óptica chile',
      'importación armazones usa',
    ],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      locale: 'es_CL',
      images: data.imagen_principal
        ? [
            {
              url: data.imagen_principal,
              width: 1000,
              height: 1000,
              alt: `${data.marca} ${data.modelo}`,
            },
          ]
        : [],
      type: 'website',
      siteName: 'OptiHub B2B',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: data.imagen_principal ? [data.imagen_principal] : [],
    },
  };
}

// 2. SERVER COMPONENT (Data Fetching, Rich Schemas & Crawl Interlinking)
export default async function ProductPage({ params }: Props) {
  const resolvedParams = await params;
  const decodedMarca = decodeURIComponent(resolvedParams.marca);
  const decodedModelo = decodeURIComponent(resolvedParams.modelo);

  // Consulta paralela: Variantes del producto actual (solo campos públicos no sensibles) y Modelos relacionados de la misma marca
  const [productRes, relatedRes] = await Promise.all([
    supabase
      .from('marcos')
      .select(MARCOS_PUBLIC_COLUMNS)
      .ilike('marca', decodedMarca)
      .ilike('modelo', decodedModelo),
    supabase
      .from('marcos')
      .select('id_ext, marca, modelo, codigo_color, imagen_principal, material, forma')
      .ilike('marca', decodedMarca)
      .not('modelo', 'ilike', decodedModelo)
      .limit(16),
  ]);

  if (productRes.error || !productRes.data || productRes.data.length === 0) {
    notFound();
  }

  // Deduplicar modelos relacionados (un solo ítem por modelo)
  const relatedModelsMap = new Map<string, Marco>();
  if (relatedRes.data) {
    for (const rel of relatedRes.data) {
      if (rel.modelo && !relatedModelsMap.has(rel.modelo)) {
        relatedModelsMap.set(rel.modelo, rel as unknown as Marco);
      }
      if (relatedModelsMap.size >= 4) break;
    }
  }
  const relatedItems = Array.from(relatedModelsMap.values());

  // Enriquecer datos de variantes actuales
  const variants = enrichMarcos(productRes.data as Marco[]);
  const baseProduct = variants[0];

  // Recolectar todas las imágenes disponibles
  const allImages = Array.from(
    new Set(
      variants
        .flatMap((v) => [v.imagen_principal, v.imagenes_secundarias])
        .filter((img): img is string => typeof img === 'string' && img.length > 5)
    )
  );

  const productUrl = `${BASE_URL}/producto/${encodeURIComponent(baseProduct.marca)}/${encodeURIComponent(baseProduct.modelo)}`;

  // Google Rich Result Schema: Product + Offers (PreOrder)
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${baseProduct.marca} ${baseProduct.modelo}`,
    image: allImages.length > 0 ? allImages : [baseProduct.imagen_principal],
    description: `Armazón óptico original ${baseProduct.marca} modelo ${baseProduct.modelo}. Compra mayorista B2B por importación directa para ópticas.`,
    sku: baseProduct.id_ext,
    ...(baseProduct.upc ? { gtin12: baseProduct.upc, upc: baseProduct.upc } : {}),
    brand: {
      '@type': 'Brand',
      name: baseProduct.marca,
    },
    category: 'Eyewear > Optical Frames',
    material: baseProduct.material || 'Acetato / Metal',
    offers: variants.map((v) => ({
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'CLP',
      availability: 'https://schema.org/PreOrder', // Estándar oficial Google para productos bajo importación
      itemCondition: 'https://schema.org/NewCondition',
      sku: v.id_ext,
      eligibleQuantity: {
        '@type': 'QuantitativeValue',
        value: 1,
        unitCode: 'C62',
      },
    })),
  };

  // Google BreadcrumbList Schema
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: `${BASE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Catálogo Mayorista',
        item: `${BASE_URL}/catalogo`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: baseProduct.marca,
        item: `${BASE_URL}/catalogo?marca=${encodeURIComponent(baseProduct.marca.toLowerCase())}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: baseProduct.modelo,
        item: productUrl,
      },
    ],
  };

  return (
    <>
      {/* Schemas JSON-LD para Google Search Console y Rich Results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="min-h-screen bg-[#F7F6F2] text-[#111111] pt-6 pb-20">
        <Suspense fallback={<div className="min-h-[400px]" />}><ProductClientView variants={variants} baseProduct={baseProduct} /></Suspense>

        {/* Interlinking interno para escalabilidad de Googlebot */}
        <RelatedProducts
          brand={baseProduct.marca}
          currentModel={baseProduct.modelo}
          items={relatedItems}
        />
      </div>
    </>
  );
}
