import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import { AuthProvider } from '@/context/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OptiHub B2B | Distribución Mayorista de Marcos',
  description: 'Plataforma e-commerce B2B de Marcos y Gafas de Sol',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased`}>
        <AuthProvider>
          {/* --- BANNER SUPERIOR DE CONDICIONES COMERCIALES --- */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white text-xs sm:text-sm font-medium py-2 px-4 text-center shadow-md flex flex-wrap justify-center items-center gap-4">
              <span className="flex items-center gap-1.5">
                  📦 Mínimo 10 unidades combinables (cualquier marca)
              </span>
              <span className="hidden md:inline text-emerald-300">•</span>
              <span className="flex items-center gap-1.5">
                  ✈️ Importación Directa USA (Entrega en 10 a 15 días hábiles)
              </span>
              <span className="hidden md:inline text-emerald-300">•</span>
              <span className="flex items-center gap-1.5 font-semibold text-emerald-100">
                  💵 Todos los valores son más IVA
              </span>
          </div>

          {/* Barra de navegación principal */}
          <Navbar />
          
          {/* Contenido de las páginas */}
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}