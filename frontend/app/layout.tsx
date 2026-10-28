import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/context/AuthContext';
import CartSync from '@/components/CartSync';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

const BASE_URL = process.env.SITE_URL || 'https://optihub-b2b.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'OptiHub | Marcos ópticos al por mayor en Chile • Importación Directa',
    template: '%s | OptiHub B2B',
  },
  description: 'Distribución mayorista e importación directa de armazones oftálmicos y lentes de sol de alta gama desde EE.UU. para ópticas en Chile. Mínimo 10 unidades combinables y factura electrónica SII.',
  keywords: [
    'marcos opticos por mayor chile',
    'distribucion armazones opticas chile',
    'lentes de sol por mayor santiago',
    'importacion armazones estados unidos',
    'venta mayorista optica chile',
    'marcos oftálmicos al por mayor',
    'armazones de acetato y titanio importados para opticas',
    'compra minima 10 armazones',
    'factura electronica sii optica'
  ],
  authors: [{ name: 'OptiHub B2B' }],
  creator: 'OptiHub B2B',
  publisher: 'OptiHub B2B',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    title: 'OptiHub | Marcos ópticos al por mayor en Chile • Importación Directa',
    description: 'Catálogo mayorista de armazones de acetato, titanio y lentes de sol para ópticas en Chile. Precios netos en CLP, entrega en 10-15 días y factura SII.',
    url: BASE_URL,
    siteName: 'OptiHub B2B',
    locale: 'es_CL',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OptiHub | Marcos ópticos al por mayor en Chile',
    description: 'Importación directa mayorista de armazones para ópticas en Chile. Mínimo 10 unidades combinables.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${cormorant.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#FAF9F6] text-[#0F0F0F] font-sans antialiased selection:bg-[#9E8256]/20 selection:text-[#0F0F0F]">
        <AuthProvider>
          {/* Barra de navegación principal limpia */}
          <Navbar />
          <CartSync />

          {/* Contenido de las páginas */}
          <main className="min-h-screen">
            {children}
          </main>

          {/* Footer Institucional B2B Esencial */}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
