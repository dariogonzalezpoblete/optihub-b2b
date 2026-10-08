'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, Glasses, LogOut, Building2, Lock, Check, Sparkles } from 'lucide-react';
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
    <header className="sticky top-0 z-50 bg-slate-950/85 backdrop-blur-xl border-b border-slate-850/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        
        {/* LOGO CORPORATIVO */}
        <Link href="/" className="flex items-center gap-3.5 group flex-shrink-0">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/20 group-hover:scale-105 group-hover:shadow-emerald-500/30 transition-all duration-300">
            <Glasses className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight text-white uppercase block leading-none">
              OPTI<span className="text-emerald-400">HUB</span>
            </span>
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase block mt-1">
              B2B Wholesale
            </span>
          </div>
        </Link>

        {/* NAVEGACIÓN PRINCIPAL */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800/60">
          <Link
            href="/"
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              pathname === '/'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            Inicio
          </Link>
          <Link
            href="/catalogo"
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              pathname === '/catalogo'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm font-bold'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/40'
            }`}
          >
            Catálogo Mayorista
          </Link>
          <Link
            href="/#marcas"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all"
          >
            Marcas
          </Link>
        </nav>

        {/* CONTROLES DERECHA: PERFIL B2B + WIDGET DE CARRITO */}
        <div className="flex items-center gap-3">
          
          {/* PERFIL / ACCESO DE LA ÓPTICA */}
          {mounted && (
            <>
              {isLoggedIn ? (
                                <div className="flex items-center gap-2.5 bg-slate-900/70 border border-slate-800/80 rounded-2xl px-3 py-1.5 shadow-sm group hover:border-emerald-500/30 transition-all">
                  <Link href="/mis-pedidos" className="flex items-center gap-2.5" title="Ver Historial de Pedidos">
                    <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="hidden lg:flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-200 max-w-[120px] truncate leading-tight group-hover:text-emerald-400 transition-colors">
                        {nombreMostrar}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-medium leading-none">
                        Mis Pedidos
                      </span>
                    </div>
                  </Link>
                  <div className="w-px h-5 bg-slate-800 mx-1 hidden lg:block"></div>
                  <button
                    onClick={() => logout()}
                    title="Cerrar sesión"
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-900/70 hover:bg-slate-850 px-3.5 py-2.5 rounded-2xl border border-slate-800 hover:border-slate-700 transition shadow-sm"
                  >
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Ingreso Ópticas</span>
                    <span className="sm:hidden">Ingresar</span>
                  </Link>
                </div>
              )}
            </>
          )}

          {/* WIDGET DEL CARRITO B2B (REDISEÑADO, MODERNO Y ELEGANTE) */}
          <Link
            href="/carrito"
            prefetch={true}
            className="group relative flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-850 border border-slate-750 hover:border-emerald-500/40 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-emerald-500/5"
            title="Ir a mi orden mayorista B2B"
          >
            {/* Ícono de carrito con badge flotante estilizado */}
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-all duration-300 flex-shrink-0">
              <ShoppingBag className="w-4 h-4 stroke-[2.2] group-hover:scale-110 transition-transform duration-300" />
              
              {/* Badge de contador de unidades */}
              {mounted && totalUnits > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-emerald-500 text-slate-950 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-950 shadow-sm group-hover:bg-white group-hover:text-slate-950 transition-colors">
                  {totalUnits > 99 ? '99+' : totalUnits}
                </span>
              )}
            </div>

            {/* Información tipográfica y estado del MOQ */}
            <div className="flex flex-col text-left justify-center min-w-[100px] sm:min-w-[120px]">
              
              {/* Línea 1: Conteo numérico */}
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-sm font-black text-white group-hover:text-emerald-300 transition-colors">
                  {totalUnits}
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  / {moqTarget} armazones
                </span>
              </div>

              {/* Línea 2: Estado dinámico con micro-indicador */}
              <div className="flex items-center gap-1.5 mt-1 leading-none">
                {totalUnits === 0 ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Mín. 10 un.
                    </span>
                  </>
                ) : isMoqReached ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400 flex-shrink-0 animate-pulse" />
                    <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">
                      Mínimo Cumplido
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-[10px] font-bold text-amber-300/90 tracking-wide">
                      Faltan {moqTarget - totalUnits} un.
                    </span>
                  </>
                )}
              </div>

              {/* Micro barra de progreso visual integrada al widget */}
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isMoqReached
                      ? 'bg-gradient-to-r from-emerald-400 to-teal-300'
                      : 'bg-gradient-to-r from-amber-400 to-emerald-400'
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