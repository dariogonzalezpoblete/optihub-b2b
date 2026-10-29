import { MetadataRoute } from 'next';

const getBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://frontend-gules-three-41.vercel.app';
};

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/catalogo',
          '/producto/',
          '/terminos-y-condiciones',
          '/politica-de-privacidad',
          '/politicas-importacion-y-garantia',
          '/icon.svg',
          '/og-image.png',
        ],
        disallow: [
          '/api/',
          '/admin/',
          '/carrito',
          '/checkout',
          '/checkout/',
          '/mis-pedidos',
          '/mis-pedidos/',
          '/perfil',
          '/actualizar-password',
          '/recuperar-password',
          '/registro',
          '/login',
          '/_next/',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: [
          '/',
          '/catalogo',
          '/producto/',
          '/terminos-y-condiciones',
          '/politica-de-privacidad',
          '/politicas-importacion-y-garantia',
          '/icon.svg',
          '/og-image.png',
        ],
        disallow: [
          '/api/',
          '/admin/',
          '/carrito',
          '/checkout',
          '/checkout/',
          '/mis-pedidos',
          '/mis-pedidos/',
          '/perfil',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
