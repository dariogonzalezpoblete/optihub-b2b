'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, LogOut, User, ShieldCheck } from 'lucide-react';
import { OptiHubEmblem } from '@/components/ui/OptiHubLogo';
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

  return (
    <header className="sticky top-0 z-50 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E4DF] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        
        {/* LOGO CORPORATIVO CON EMBLEMA MINIMALISTA */}
        <Link href="/" className="flex items-center gap-3 sm:gap-3.5 group flex-shrink-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#FAF9F6] border border-[#E5E4DF] flex items-center justify-center p-2 shadow-2xs group-hover:border-[#B89768] group-hover:bg-[#FDFBF7] transition-all">
            <OptiHubEmblem className="w-full h-full" />
          </div>
          <div className="flex flex-col">
            <span className="font-editorial text-2xl sm:text-3xl font-semibold tracking-tight text-[#111111] leading-none">
              Opti<span className="text-[#B89768]">Hub</span>
            </span>
            <span className="font-sans text-[9px] sm:text-[10px] font-semibold tracking-wider text-[#82807A] uppercase mt-1">
              Importación Mayorista Óptica
            </span>
          </div>
        </Link>

        {/* NAVEGACIÓN PRINCIPAL */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            className={`px-3.5 sm:px-4 py-2 rounded-full text-xs font-medium tracking-wide transition-colors ${
              pathname === '/'
                ? 'text-[#111111] font-semibold bg-[#FAF9F6] border border-[#E5E4DF]'
                : 'text-[#575551] hover:text-[#111111]'
            }`}
          >
            Inicio
          </Link>
          <Link
            href="/catalogo"
            className={`px-3.5 sm:px-4 py-2 rounded-full text-xs font-medium tracking-wide transition-colors ${
              pathname === '/catalogo'
                ? 'text-[#111111] font-semibold bg-[#FAF9F6] border border-[#E5E4DF]'
                : 'text-[#575551] hover:text-[#111111]'
            }`}
          >
            Catálogo
          </Link>

          {/* INICIAR SESIÓN / MI CUENTA */}
          {mounted && (
            <>
              {isLoggedIn ? (
                <div className="flex items-center gap-1.5 pl-1 sm:pl-2">
                  {user?.email && ['multifocuslimitada@gmail.com', 'dario.joda.2007@gmail.com', 'admin@optihub.cl', 'contacto@optihub.cl'].includes(user.email.toLowerCase().trim()) && (
                    <Link
                      href="/admin"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-colors border ${
                        pathname.startsWith('/admin')
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                          : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                      }`}
                      title="Panel Maestro de Administración"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                      <span>Admin</span>
                    </Link>
                  )}
                  <Link
                    href="/mis-pedidos"
                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-xs font-medium transition-colors border ${
                      pathname.startsWith('/mis-pedidos')
                        ? 'bg-[#111111] text-white border-[#111111]'
                        : 'bg-[#FAF9F6] text-[#111111] border-[#E5E4DF] hover:border-[#82807A]'
                    }`}
                    title="Mi Cuenta y Pedidos"
                  >
                    <User className="w-3.5 h-3.5 text-[#B89768]" />
                    <span className="max-w-[100px] sm:max-w-[140px] truncate">{nombreMostrar}</span>
                  </Link>
                  <button
                    onClick={() => logout()}
                    title="Cerrar sesión"
                    className="p-2 text-[#82807A] hover:text-[#C0392B] rounded-full hover:bg-[#FAF9F6] transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="px-3 sm:px-4 py-2 rounded-full text-xs font-medium text-[#575551] hover:text-[#111111] transition-colors"
                >
                  Iniciar Sesión
                </Link>
              )}
            </>
          )}

          {/* CARRO */}
          <Link
            href="/carrito"
            className="flex items-center gap-2 pl-2 sm:pl-3 ml-1 border-l border-[#E5E4DF]"
            title="Ver Carro"
          >
            <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-[#111111] text-white hover:bg-[#242424] transition-colors">
              <ShoppingBag className="w-4 h-4 stroke-[1.8]" />
              {totalUnits > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#B89768] text-[#111111] text-[10px] font-bold font-tech rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                  {totalUnits > 99 ? '99+' : totalUnits}
                </span>
              )}
            </div>
            <span className="hidden sm:inline text-xs font-medium text-[#111111]">
              Carro
            </span>
          </Link>
        </nav>

      </div>
    </header>
  );
}
