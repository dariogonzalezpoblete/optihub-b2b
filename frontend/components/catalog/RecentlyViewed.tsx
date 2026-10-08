'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRecentStore } from '@/store/useRecentStore';
import { Clock, ArrowRight } from 'lucide-react';

export default function RecentlyViewed() {
  const { recentItems } = useRecentStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || recentItems.length === 0) return null;

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60 mt-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight">Vistos Recientemente</h2>
          <p className="text-xs text-slate-400">Retoma tu cotización B2B rápidamente</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {recentItems.map((item) => (
          <Link
            key={item.id_ext}
            href={`/producto/${encodeURIComponent(item.marca)}/${encodeURIComponent(item.modelo)}`}
            className="group bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 transition duration-300 flex flex-col"
          >
            <div className="aspect-[4/3] bg-slate-950 rounded-xl mb-4 p-2 flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden relative">
              {item.imagen_principal ? (
                <Image unoptimized src={item.imagen_principal} alt={item.modelo} fill sizes="(max-width: 768px) 50vw, 20vw" className="object-contain p-2" />
              ) : (
                <span className="text-[10px] text-slate-600">Sin imagen</span>
              )}
            </div>
            <div className="mt-auto">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block">{item.marca}</span>
              <span className="font-bold text-white text-sm block mt-1 truncate">{item.modelo}</span>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-800">
                <span className="text-xs text-slate-400">Ver Ficha</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
