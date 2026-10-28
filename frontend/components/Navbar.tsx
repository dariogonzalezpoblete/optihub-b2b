'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, LogOut, ShieldCheck } from 'lucide-react';
import { useCartStore } from '@/store/useCartStore';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  const cartUnits = useCartStore((state) =>
    state.cart.reduce((sum, item) => sum + (item.cantidad || 0), 0)
  );

  const { user, isLoggedIn, opticaData, logout } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalUnits = mounted ? cartUnits : 0;
  const nombreMostrar = opticaData?.nombre_optica || user?.email?.split('@')[0] || 'Mi Cuenta';

  const isInicio = pathname === '/';
  const isCatalogo = pathname.startsWith('/catalogo');

  return (
    <header className="sticky top-0 z-50 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#E6E2DD] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-6">
        
        {/* LOGOTIPO TIPOGRÁFICO PURO (MAISON EDITORIAL) */}
        <Link href="/" className="flex flex-col group flex-shrink-0">
          <span className="font-serif text-2xl tracking-[0.22em] uppercase text-[#0F0F0F] font-normal group-hover:text-[#9E8256] transition-colors leading-tight">
            OPTIHUB
          </span>
          <span className="text-[9px] tracking-[0.25em] text-[#5C5A55] uppercase font-sans mt-0.5">
            MAYORISTA ÓPTICO · USA
          </span>
        </Link>

        {/* NAVEGACIÓN CENTRAL Y ÁREA DE USUARIO */}
        <nav className="flex items-center gap-6 sm:gap-8">
          {/* Enlaces de Texto Plano con Hairline Inferior */}
          <Link
            href="/"
            className={`relative py-1 text-[11px] uppercase tracking-[0.18em] transition-colors ${
              isInicio ? 'text-[#0F0F0F] font-medium' : 'text-[#5C5A55] hover:text-[#0F0F0F]'
            }`}
          >
            Inicio
            <span
              className={`absolute bottom-0 left-0 right-0 h-[1px] bg-[#0F0F0F] transition-opacity duration-200 ${
                isInicio ? 'opacity-100' : 'opacity-0 hover:opacity-100'
              }`}
            />
          </Link>

          <Link
            href="/catalogo"
            className={`relative py-1 text-[11px] uppercase tracking-[0.18em] transition-colors ${
              isCatalogo ? 'text-[#0F0F0F] font-medium' : 'text-[#5C5A55] hover:text-[#0F0F0F]'
            }`}
          >
            Catálogo
            <span
              className={`absolute bottom-0 left-0 right-0 h-[1px] bg-[#0F0F0F] transition-opacity duration-200 ${
                isCatalogo ? 'opacity-100' : 'opacity-0 hover:opacity-100'
              }`}
            />
          </Link>

          {/* ÁREA DE USUARIO B2B Y ADMIN */}
          {mounted && (
            <div className="flex items-center gap-4">
              {isLoggedIn ? (
                <div className="flex items-center gap-3">
                  {/* Badge Admin Sobrio de Bordes Rectos */}
                  {user?.email &&
                    ['multifocuslimitada@gmail.com', 'dario.joda.2007@gmail.com', 'admin@optihub.cl', 'contacto@optihub.cl'].includes(
                      user.email.toLowerCase().trim()
                    ) && (
                      <Link
                        href="/admin"
                        className="inline-flex items-center gap-1.5 border border-[#9E8256] text-[#9E8256] text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-none hover:bg-[#9E8256]/10 transition-colors"
                        title="Panel de Administración"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-[#9E8256]" />
                        <span>Admin</span>
                      </Link>
                    )}

                  {/* Óptica logueada y divisor vertical */}
                  <div className="flex items-center gap-3">
                    <Link
                      href="/mis-pedidos"
                      className="text-[11px] uppercase tracking-[0.16em] text-[#0F0F0F] hover:text-[#9E8256] transition-colors max-w-[120px] sm:max-w-[180px] truncate font-medium"
                      title={nombreMostrar}
                    >
                      {nombreMostrar}
                    </Link>

                    {/* Divisor vertical arquitectónico */}
                    <span className="h-4 w-[1px] bg-[#E6E2DD]" aria-hidden="true" />

                    <button
                      onClick={() => logout()}
                      title="Cerrar sesión"
                      className="text-[10px] uppercase tracking-[0.16em] text-[#5C5A55] hover:text-[#0F0F0F] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3 text-[#5C5A55]" />
                      <span className="hidden sm:inline">Salir</span>
                    </button>
                  </div>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="text-[11px] uppercase tracking-[0.18em] text-[#5C5A55] hover:text-[#0F0F0F] transition-colors"
                >
                  Acceso Ópticas
                </Link>
              )}
            </div>
          )}

          {/* BOTÓN DE PEDIDO / CARRO ARQUITECTÓNICO */}
          <Link
            href="/carrito"
            className="bg-[#0F0F0F] text-white px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] rounded-none hover:bg-[#262626] transition-colors flex items-center gap-2 shrink-0 border border-[#0F0F0F]"
            title="Ver Pedido Mayorista"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#9E8256]" />
            <span>
              {totalUnits > 0 ? `PEDIDO B2B (${totalUnits})` : 'PEDIDO B2B'}
            </span>
          </Link>
        </nav>

      </div>
    </header>
  );
}
