import { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabaseClient';

export const revalidate = 86400; // Revalidate sitemap once every 24h

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://frontend-gules-three-41.vercel.app');

  // 1. Static Core Pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/catalogo`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/terminos-y-condiciones`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/politica-de-privacidad`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/politicas-importacion-y-garantia`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  try {
    // 2. Query distinct brand + model combinations from Supabase marcos
    // (solo columnas públicas no sensibles; RLS marcos_select_anon_public filtra stock > 0 para anon)
    const { data, error } = await supabase
      .from('marcos')
      .select('marca, modelo');

    if (error || !data) {
      return staticRoutes;
    }

    const uniqueModelsMap = new Map<string, { marca: string; modelo: string; updatedAt: Date }>();
    const uniqueBrandsSet = new Set<string>();

    for (const item of data) {
      if (!item.marca || !item.modelo) continue;
      const cleanBrand = item.marca.trim();
      const cleanModel = item.modelo.trim();
      uniqueBrandsSet.add(cleanBrand);

      const key = `${cleanBrand}:::${cleanModel}`;
      const itemDate = new Date();

      if (!uniqueModelsMap.has(key)) {
        uniqueModelsMap.set(key, { marca: cleanBrand, modelo: cleanModel, updatedAt: itemDate });
      }
    }

    // 3. Brand landing URLs
    const brandRoutes: MetadataRoute.Sitemap = Array.from(uniqueBrandsSet).map((brand) => ({
      url: `${baseUrl}/catalogo?marca=${encodeURIComponent(brand.toLowerCase())}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.85,
    }));

    // 4. Product individual URLs (one canonical URL per model)
    const productRoutes: MetadataRoute.Sitemap = Array.from(uniqueModelsMap.values()).map(
      ({ marca, modelo, updatedAt }) => ({
        url: `${baseUrl}/producto/${encodeURIComponent(marca)}/${encodeURIComponent(modelo)}`,
        lastModified: updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    );

    return [...staticRoutes, ...brandRoutes, ...productRoutes];
  } catch (err) {
    console.error('Error generating dynamic sitemap:', err);
    return staticRoutes;
  }
}
