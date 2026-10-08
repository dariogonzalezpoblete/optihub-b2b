import { Metadata } from 'next';
import { supabase } from '@/lib/supabaseClient';
import { notFound } from 'next/navigation';
import ProductClientView from './ProductClientView';
import { enrichMarcos } from '@/lib/catalog/filterEngine';
import type { Marco } from '@/lib/catalog/types';

// Opcional: Revalidación
export const revalidate = 3600; 

interface Props {
  params: Promise<{
    marca: string;
    modelo: string;
  }>;
}

// 1. DYNAMIC METADATA (SEO)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const decodedMarca = decodeURIComponent(resolvedParams.marca);
  const decodedModelo = decodeURIComponent(resolvedParams.modelo);

  const { data } = await supabase
    .from('marcos')
    .select('*')
    .ilike('marca', decodedMarca)
    .ilike('modelo', decodedModelo)
    .limit(1)
    .single();

  if (!data) {
    return {
      title: 'Producto no encontrado | OptiHub B2B',
    };
  }

  const title = `Armazones al por mayor ${data.marca} ${data.modelo} | OptiHub B2B`;
  const description = `Cotiza armazones ${data.marca} modelo ${data.modelo} al por mayor. Importación directa desde EE.UU. Compra mínima de 10 unidades combinables. Despacho a todo Chile.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: data.imagen_principal ? [{ url: data.imagen_principal }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: data.imagen_principal ? [data.imagen_principal] : [],
    }
  };
}

// 2. SERVER COMPONENT (Data Fetching & JSON-LD)
export default async function ProductPage({ params }: Props) {
  const resolvedParams = await params;
  const decodedMarca = decodeURIComponent(resolvedParams.marca);
  const decodedModelo = decodeURIComponent(resolvedParams.modelo);

  // Fetch all color variants for this specific model
  const { data: rawData, error } = await supabase
    .from('marcos')
    .select('*')
    .ilike('marca', decodedMarca)
    .ilike('modelo', decodedModelo);

  if (error || !rawData || rawData.length === 0) {
    notFound();
  }

  // Enriquecer datos (parsing dimensiones, etc.)
  const variants = enrichMarcos(rawData as Marco[]);
  const baseProduct = variants[0];

  // Generar JSON-LD (Schema Markup B2B)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": `${baseProduct.marca} ${baseProduct.modelo}`,
    "image": baseProduct.imagen_principal,
    "description": `Armazones ${baseProduct.marca} modelo ${baseProduct.modelo} para óptica. Compra mayorista B2B.`,
    "brand": {
      "@type": "Brand",
      "name": baseProduct.marca
    },
    "category": "Eyewear",
    "material": baseProduct.material,
    "offers": variants.map(v => ({
      "@type": "Offer",
      "url": `https://optihub-b2b.vercel.app/producto/${encodeURIComponent(v.marca)}/${encodeURIComponent(v.modelo)}`,
      "priceCurrency": "CLP",
      "price": v.precio_neto_clp,
      "availability": v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "itemCondition": "https://schema.org/NewCondition",
      "eligibleQuantity": {
        "@type": "QuantitativeValue",
        "value": 1,
        "unitCode": "C62" // Unit for piece/item
      }
    }))
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-slate-950 pt-24 pb-16">
        <ProductClientView variants={variants} baseProduct={baseProduct} />
      </div>
    </>
  );
}
