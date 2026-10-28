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
    <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#E6E2DD] mt-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 border border-[#E6E2DD] bg-[#FFFFFF] flex items-center justify-center text-[#9E8256]">
          <Clock className="w-4 h-4 stroke-[1.5]" />
        </div>
        <div>
          <h2 className="font-serif text-2xl font-normal text-[#0F0F0F] tracking-tight">
            Vistos Recientemente
          </h2>
          <p className="text-xs text-[#5C5A55] uppercase tracking-wider">
            Retoma tu cotización B2B rápidamente
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {recentItems.map((item) => (
          <Link
            key={item.id_ext}
            href={`/producto/${encodeURIComponent(item.marca)}/${encodeURIComponent(item.modelo)}`}
            className="group bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#0F0F0F] p-4 transition-all duration-300 flex flex-col justify-between"
          >
            <div className="aspect-[4/3] bg-[#F4F2ED] mb-3 p-2 flex items-center justify-center relative border border-[#E6E2DD] overflow-hidden">
              {item.imagen_principal ? (
                <Image
                  unoptimized
                  src={item.imagen_principal}
                  alt={item.modelo}
                  fill
                  sizes="(max-width: 768px) 50vw, 20vw"
                  className="object-contain p-2 mix-blend-multiply group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <span className="text-[10px] text-[#787670] uppercase">Sin imagen</span>
              )}
            </div>
            <div className="mt-auto">
              <span className="text-[10px] font-semibold text-[#0F0F0F] uppercase tracking-[0.18em] block">
                {item.marca}
              </span>
              <span className="font-serif text-base text-[#0F0F0F] block mt-0.5 truncate font-normal">
                {item.modelo}
              </span>
              <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-[#E6E2DD] text-[10px] uppercase tracking-wider text-[#5C5A55] group-hover:text-[#0F0F0F]">
                <span>Ver Ficha</span>
                <ArrowRight className="w-3 h-3 text-[#9E8256] group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
