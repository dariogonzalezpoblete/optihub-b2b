import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AIChatbox from '@/components/ui/AIChatbox';
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

export const metadata: Metadata = {
  title: 'OptiHub B2B | Maison de Distribución Mayorista de Armazones',
  description: 'Plataforma e-commerce B2B de Armazones y Gafas de Sol de Alta Gama',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${cormorant.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#F7F6F2] text-[#111111] font-sans antialiased selection:bg-[#B89768]/20 selection:text-[#111111]">
        <AuthProvider>
          {/* --- BANNER SUPERIOR EDITORIAL DE CONDICIONES COMERCIALES --- */}
          <div className="bg-[#111111] text-[#E5E4DF] text-xs font-medium py-2 px-4 text-center border-b border-[#242424] flex flex-wrap justify-center items-center gap-4 tracking-wide">
            <span className="flex items-center gap-1.5 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B89768]" />
              Mínimo 10 unidades combinables (cualquier marca)
            </span>
            <span className="hidden md:inline text-[#B89768] opacity-60">/</span>
            <span className="flex items-center gap-1.5 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B89768]" />
              Importación Directa USA (10 a 15 días hábiles)
            </span>
            <span className="hidden md:inline text-[#B89768] opacity-60">/</span>
            <span className="flex items-center gap-1.5 font-medium text-[#B89768]">
              Valores netos más IVA • Facturación electrónica SII
            </span>
          </div>

          {/* Barra de navegación principal */}
          <Navbar />
          <CartSync />

          {/* Contenido de las páginas */}
          {children}

          {/* Footer Institucional B2B */}
          <Footer />

          {/* AI Chatbox Flotante */}
          <AIChatbox />
        </AuthProvider>
      </body>
    </html>
  );
}
