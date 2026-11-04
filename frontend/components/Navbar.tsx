'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, LogOut, ShieldCheck, Menu, X, User, Package } from 'lucide-react';
import { useCartStore } from '@/store/useCartStore';
import { useAuth } from '@/context/AuthContext';
import { MarcosDeMarcaEmblem } from '@/components/ui/OptiHubLogo';

export default function Navbar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const cartUnits = useCartStore((state) =>
    state.cart.reduce((sum, item) => sum + (item.cantidad || 0), 0)
  );

  const { user, isLoggedIn, opticaData, logout } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const totalUnits = mounted ? cartUnits : 0;
  const nombreMostrar = opticaData?.nombre_optica || user?.email?.split('@')[0] || 'Mi Cuenta';

  const isInicio = pathname === '/';
  const isCatalogo = pathname.startsWith('/catalogo');
  const isAdmin =
    mounted &&
    isLoggedIn &&
    user?.email &&
    [
      'multifocuslimitada@gmail.com',
      'dario.joda.2007@gmail.com',
      'admin@optihub.cl',
      'contacto@optihub.cl',
      'admin@marcosdemarca.cl',
      'contacto@marcosdemarca.cl',
    ].includes(
      user.email.toLowerCase().trim()
    );

  return (
    <header className="sticky top-0 z-50 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#E6E2DD] transition-all">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-6">
        
        {/* LOGOTIPO E ISOTIPO MARCOS DE MARCA */}
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3.5 group flex-shrink-0">
          <MarcosDeMarcaEmblem className="w-7 h-7 sm:w-9 sm:h-9 shrink-0" theme="brass" />
          <div className="flex flex-col">
            <span className="font-sans text-sm sm:text-lg tracking-[0.2em] sm:tracking-[0.24em] uppercase text-[#263E55] font-medium group-hover:text-[#9E8256] transition-colors leading-tight">
              MARCOS DE MARCA
            </span>
            <span className="text-[7px] sm:text-[8.5px] tracking-[0.2em] sm:tracking-[0.26em] text-[#5C5A55] uppercase font-sans mt-0.5">
              DISTRIBUCIÓN MAYORISTA ÓPTICA
            </span>
          </div>
        </Link>

        {/* NAVEGACIÓN DESKTOP / TABLET */}
        <nav className="flex items-center gap-3 sm:gap-6 lg:gap-8">
          <Link
            href="/"
            className={`hidden md:inline-block relative py-1 text-[11px] uppercase tracking-[0.18em] transition-colors ${
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
            className={`relative py-1 text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.18em] transition-colors ${
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

          {/* ÁREA DE USUARIO B2B Y ADMIN (DESKTOP) */}
          {mounted && (
            <div className="hidden md:flex items-center gap-4">
              {isLoggedIn ? (
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="inline-flex items-center gap-1.5 border border-[#9E8256] text-[#9E8256] text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-none hover:bg-[#9E8256]/10 transition-colors"
                      title="Panel de Administración"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#9E8256]" />
                      <span>Admin</span>
                    </Link>
                  )}

                  <div className="flex items-center gap-3">
                    <Link
                      href="/mis-pedidos"
                      className="text-[11px] uppercase tracking-[0.16em] text-[#0F0F0F] hover:text-[#9E8256] transition-colors max-w-[140px] lg:max-w-[180px] truncate font-medium"
                      title={nombreMostrar}
                    >
                      {nombreMostrar}
                    </Link>

                    <span className="h-4 w-[1px] bg-[#E6E2DD]" aria-hidden="true" />

                    <Link
                      href="/perfil"
                      className="text-[10px] uppercase tracking-[0.16em] text-[#5C5A55] hover:text-[#0F0F0F] transition-colors"
                      title="Mi Perfil de Facturación B2B"
                    >
                      Perfil
                    </Link>

                    <span className="h-4 w-[1px] bg-[#E6E2DD]" aria-hidden="true" />

                    <button
                      onClick={() => logout()}
                      title="Cerrar sesión"
                      className="text-[10px] uppercase tracking-[0.16em] text-[#5C5A55] hover:text-[#0F0F0F] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3 text-[#5C5A55]" />
                      <span>Salir</span>
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
            className="bg-[#0F0F0F] text-white px-3 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-[11px] uppercase tracking-[0.14em] sm:tracking-[0.16em] rounded-none hover:bg-[#262626] transition-colors flex items-center gap-1.5 sm:gap-2 shrink-0 border border-[#0F0F0F]"
            title="Ver Pedido Mayorista"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#9E8256] shrink-0" />
            <span className="whitespace-nowrap">
              {totalUnits > 0 ? `PEDIDO (${totalUnits})` : 'PEDIDO B2B'}
            </span>
          </Link>

          {/* BOTÓN MENÚ MÓVIL (< 768px) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden w-9 h-9 border border-[#E6E2DD] bg-[#FFFFFF] text-[#0F0F0F] flex items-center justify-center shrink-0 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </nav>
      </div>

      {/* PANEL DESPLEGABLE MÓVIL (< 768px) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#E6E2DD] bg-[#FFFFFF] px-4 py-5 space-y-4 shadow-lg">
          <div className="flex flex-col space-y-2.5 text-xs uppercase tracking-[0.16em]">
            <Link
              href="/"
              className={`py-2 border-b border-[#E6E2DD]/60 ${
                isInicio ? 'text-[#0F0F0F] font-semibold' : 'text-[#5C5A55]'
              }`}
            >
              Inicio
            </Link>
            <Link
              href="/catalogo"
              className={`py-2 border-b border-[#E6E2DD]/60 ${
                isCatalogo ? 'text-[#0F0F0F] font-semibold' : 'text-[#5C5A55]'
              }`}
            >
              Catálogo Mayorista
            </Link>
            {mounted && isLoggedIn ? (
              <>
                <Link
                  href="/mis-pedidos"
                  className="py-2 border-b border-[#E6E2DD]/60 text-[#0F0F0F] flex items-center gap-2"
                >
                  <Package className="w-3.5 h-3.5 text-[#9E8256]" />
                  <span>Mis Pedidos ({nombreMostrar})</span>
                </Link>
                <Link
                  href="/perfil"
                  className="py-2 border-b border-[#E6E2DD]/60 text-[#0F0F0F] flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-[#9E8256]" />
                  <span>Mi Perfil de Facturación B2B</span>
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="py-2 border-b border-[#E6E2DD]/60 text-[#9E8256] font-semibold flex items-center gap-2"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#9E8256]" />
                    <span>Panel de Administración</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => logout()}
                  className="py-2 text-left text-[#9E3838] uppercase tracking-[0.16em] flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar Sesión</span>
                </button>
              </>
            ) : (
              <div className="pt-2 grid grid-cols-2 gap-3">
                <Link
                  href="/login"
                  className="bg-[#0F0F0F] text-white py-3 text-center text-[10px] uppercase tracking-[0.18em] font-medium border border-[#0F0F0F]"
                >
                  Acceso Ópticas
                </Link>
                <Link
                  href="/registro"
                  className="bg-[#FAF9F6] text-[#0F0F0F] py-3 text-center text-[10px] uppercase tracking-[0.18em] font-medium border border-[#0F0F0F]"
                >
                  Registrar Óptica
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
