'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, Glasses, LogOut, Building2, Lock, Check } from 'lucide-react';
import { useCartStore } from '@/store/useCartStore';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Suscripción reactiva en tiempo real al estado del carrito en Zustand
  const cartUnits = useCartStore((state) =>
    state.cart.reduce((sum, item) => sum + (item.cantidad || 0), 0)
  );

  const { user, isLoggedIn, opticaData, logout } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hidratación segura para Next.js: durante SSR se muestra 0, en el cliente se sincroniza de inmediato
  const totalUnits = mounted ? cartUnits : 0;
  const moqTarget = 10;
  const isMoqReached = totalUnits >= moqTarget;
  const progressPercent = Math.min(100, Math.round((totalUnits / moqTarget) * 100));

  const nombreMostrar = opticaData?.nombre_optica || user?.email?.split('@')[0] || 'Mi Óptica';

  return (
    <header className="sticky top-0 z-50 bg-[#FFFFFF]/90 backdrop-blur-md border-b border-[#E5E4DF] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        
        {/* LOGO CORPORATIVO EDITORIAL */}
        <Link href="/" className="flex items-center gap-3.5 group flex-shrink-0">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-[#111111] text-[#FFFFFF] border border-[#242424] shadow-xs group-hover:border-[#B89768] group-hover:scale-105 transition-all duration-300">
            <Glasses className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <span className="font-editorial text-2xl font-bold tracking-wider text-[#111111] uppercase block leading-none">
              OPTI<span className="text-[#B89768]">HUB</span>
            </span>
            <span className="font-tech text-[9px] font-bold tracking-[0.2em] text-[#82807A] uppercase block mt-1">
              Maison B2B Wholesale
            </span>
          </div>
        </Link>

        {/* NAVEGACIÓN PRINCIPAL */}
        <nav className="hidden md:flex items-center gap-1 bg-[#FAF9F6] p-1.5 rounded-full border border-[#E5E4DF]">
          <Link
            href="/"
            className={`px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all ${
              pathname === '/'
                ? 'bg-[#111111] text-white shadow-2xs'
                : 'text-[#575551] hover:text-[#111111] hover:bg-[#FFFFFF]'
            }`}
          >
            Inicio
          </Link>
          <Link
            href="/catalogo"
            className={`px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all ${
              pathname === '/catalogo'
                ? 'bg-[#111111] text-white shadow-2xs font-bold'
                : 'text-[#575551] hover:text-[#111111] hover:bg-[#FFFFFF]'
            }`}
          >
            Catálogo Mayorista
          </Link>
        </nav>

        {/* CONTROLES DERECHA: PERFIL B2B + WIDGET DE CARRITO */}
        <div className="flex items-center gap-3">
          
          {/* PERFIL / ACCESO DE LA ÓPTICA */}
          {mounted && (
            <>
              {isLoggedIn ? (
                <div className="flex items-center gap-2.5 bg-[#FAF9F6] border border-[#E5E4DF] rounded-2xl px-3 py-1.5 shadow-2xs group hover:border-[#B89768] transition-all">
                  <Link href="/mis-pedidos" className="flex items-center gap-2.5" title="Ver Historial de Pedidos">
                    <div className="w-7 h-7 rounded-xl bg-[#FFFFFF] border border-[#E5E4DF] text-[#111111] flex items-center justify-center flex-shrink-0 group-hover:bg-[#111111] group-hover:text-white transition-colors">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="hidden lg:flex flex-col text-left">
                      <span className="text-xs font-bold text-[#111111] max-w-[120px] truncate leading-tight group-hover:text-[#B89768] transition-colors">
                        {nombreMostrar}
                      </span>
                      <span className="text-[10px] text-[#82807A] font-medium leading-none font-tech">
                        Mis Pedidos
                      </span>
                    </div>
                  </Link>
                  <div className="w-px h-5 bg-[#E5E4DF] mx-1 hidden lg:block"></div>
                  <button
                    onClick={() => logout()}
                    title="Cerrar sesión"
                    className="p-1.5 text-[#82807A] hover:text-[#C0392B] hover:bg-[#FDF4F4] rounded-lg transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#111111] hover:text-[#111111] bg-[#FAF9F6] hover:bg-[#FFFFFF] px-3.5 py-2.5 rounded-2xl border border-[#E5E4DF] hover:border-[#82807A] transition shadow-2xs"
                  >
                    <Lock className="w-3.5 h-3.5 text-[#B89768]" />
                    <span className="hidden sm:inline">Ingreso Ópticas</span>
                    <span className="sm:hidden">Ingresar</span>
                  </Link>
                </div>
              )}
            </>
          )}

          {/* WIDGET DEL CARRITO B2B EDITORIAL */}
          <Link
            href="/carrito"
            prefetch={true}
            className="group relative flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-[#FAF9F6] hover:bg-[#FFFFFF] border border-[#E5E4DF] hover:border-[#B89768] transition-all duration-300 shadow-2xs hover:shadow-xs"
            title="Ir a mi orden mayorista B2B"
          >
            {/* Ícono de carrito con badge flotante estilizado */}
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-[#111111] text-white transition-all duration-300 flex-shrink-0">
              <ShoppingBag className="w-4 h-4 stroke-[2] group-hover:scale-110 transition-transform duration-300" />
              
              {/* Badge de contador de unidades */}
              {mounted && totalUnits > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-[#B89768] text-[#111111] text-[10px] font-bold font-tech rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                  {totalUnits > 99 ? '99+' : totalUnits}
                </span>
              )}
            </div>

            {/* Información tipográfica y estado del MOQ */}
            <div className="flex flex-col text-left justify-center min-w-[100px] sm:min-w-[120px]">
              
              {/* Línea 1: Conteo numérico */}
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-sm font-bold text-[#111111] font-tech group-hover:text-[#B89768] transition-colors">
                  {totalUnits}
                </span>
                <span className="text-[11px] font-medium text-[#82807A]">
                  / {moqTarget} armazones
                </span>
              </div>

              {/* Línea 2: Estado dinámico con micro-indicador */}
              <div className="flex items-center gap-1.5 mt-1 leading-none">
                {totalUnits === 0 ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#82807A] flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-[#82807A] uppercase tracking-wider">
                      Mín. 10 un.
                    </span>
                  </>
                ) : isMoqReached ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B89768] shadow-xs flex-shrink-0" />
                    <span className="text-[10px] font-bold text-[#9E7D4F] uppercase tracking-wider">
                      Mínimo Cumplido
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B89768] flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-[#575551] font-tech">
                      Faltan {moqTarget - totalUnits} un.
                    </span>
                  </>
                )}
              </div>

              {/* Micro barra de progreso visual integrada al widget */}
              <div className="w-full h-1 bg-[#E5E4DF] rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isMoqReached
                      ? 'bg-gradient-to-r from-[#9E7D4F] to-[#B89768]'
                      : 'bg-[#B89768]'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

            </div>
          </Link>

        </div>

      </div>
    </header>
  );
}
