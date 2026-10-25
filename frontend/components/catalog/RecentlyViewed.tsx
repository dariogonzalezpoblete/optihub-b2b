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
    <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#E5E4DF] mt-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#FAF9F6] border border-[#E5E4DF] flex items-center justify-center text-[#B89768]">
          <Clock className="w-5 h-5 stroke-[1.8]" />
        </div>
        <div>
          <h2 className="font-editorial text-2xl font-semibold text-[#111111] tracking-tight">Vistos Recientemente</h2>
          <p className="text-xs text-[#575551]">Retoma tu cotización B2B rápidamente</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {recentItems.map((item) => (
          <Link
            key={item.id_ext}
            href={`/producto/${encodeURIComponent(item.marca)}/${encodeURIComponent(item.modelo)}`}
            className="group bg-[#FFFFFF] border border-[#E5E4DF] hover:border-[#B89768] rounded-2xl p-4 transition duration-300 flex flex-col shadow-2xs hover:shadow-xs"
          >
            <div className="aspect-[4/3] bg-[#FAF9F6] rounded-xl mb-4 p-2 flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden relative border border-[#E5E4DF]">
              {item.imagen_principal ? (
                <Image unoptimized src={item.imagen_principal} alt={item.modelo} fill sizes="(max-width: 768px) 50vw, 20vw" className="object-contain p-2" />
              ) : (
                <span className="text-[10px] text-[#82807A]">Sin imagen</span>
              )}
            </div>
            <div className="mt-auto">
              <span className="text-[10px] font-bold text-[#B89768] uppercase tracking-widest block font-editorial">{item.marca}</span>
              <span className="font-bold text-[#111111] text-sm block mt-1 truncate">{item.modelo}</span>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#E5E4DF]">
                <span className="text-xs text-[#575551]">Ver Ficha</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#B89768] group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
