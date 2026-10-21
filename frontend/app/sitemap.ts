import { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabaseClient';

export const revalidate = 86400; // Revalidate sitemap once every 24h

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.SITE_URL || 'https://optihub-b2b.vercel.app';

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
  ];

  try {
    // 2. Query distinct brand + model combinations from Supabase marcos
    const { data, error } = await supabase
      .from('marcos')
      .select('marca, modelo, updated_at');

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
      const itemDate = item.updated_at ? new Date(item.updated_at) : new Date();

      if (!uniqueModelsMap.has(key)) {
        uniqueModelsMap.set(key, { marca: cleanBrand, modelo: cleanModel, updatedAt: itemDate });
      } else {
        const existing = uniqueModelsMap.get(key)!;
        if (itemDate > existing.updatedAt) {
          existing.updatedAt = itemDate;
        }
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
