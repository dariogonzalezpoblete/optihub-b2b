import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.SITE_URL || 'https://optihub-b2b.vercel.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/catalogo', '/producto/'],
        disallow: [
          '/api/',
          '/carrito',
          '/checkout',
          '/mis-pedidos',
          '/perfil',
          '/actualizar-password',
          '/recuperar-password',
          '/registro',
          '/login',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: ['/', '/catalogo', '/producto/'],
        disallow: [
          '/api/',
          '/carrito',
          '/checkout',
          '/mis-pedidos',
          '/perfil',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
