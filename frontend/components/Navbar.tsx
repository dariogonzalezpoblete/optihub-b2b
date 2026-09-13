'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingBag, Glasses } from 'lucide-react';

interface NavbarProps {
  itemCount?: number;
}

export default function Navbar({ itemCount = 0 }: NavbarProps) {
  const moqTarget = 10;
  const isMoqReached = itemCount >= moqTarget;

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="p-2.5 bg-emerald-500 rounded-xl text-slate-950 group-hover:bg-emerald-400 transition-colors">
            <Glasses className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-black tracking-wider text-white uppercase block leading-none">
              OPTI<span className="text-emerald-400">HUB</span>
            </span>
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              B2B Wholesale
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8 font-semibold text-slate-300">
          <Link href="/" className="hover:text-emerald-400 transition-colors">
            Inicio
          </Link>
          <Link href="/catalogo" className="hover:text-emerald-400 transition-colors">
            Catálogo
          </Link>
          <Link href="/#marcas" className="hover:text-emerald-400 transition-colors">
            Marcas
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <div className="relative flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700">
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
            <div className="flex flex-col text-right">
              <span className="text-xs font-bold text-slate-200">
                {itemCount} / {moqTarget} Unidades
              </span>
              <span className={`text-[10px] font-extrabold uppercase ${isMoqReached ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isMoqReached ? 'Mínimo Cumplido' : `Faltan ${moqTarget - itemCount}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}