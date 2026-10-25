'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';

const SPOTLIGHT_FRAMES = [
  {
    id: 'guess-1',
    marca: 'Guess',
    modelo: 'GUESS GU00119',
    color: 'Rose Gold / Gradient Smoke',
    material: 'Metal ligero de alta resistencia',
    calibre: '58 mm',
    tipo: 'Diseño Aviador Premium',
    image: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/GU00119-32B-7ebfb6c1.webp',
  },
  {
    id: 'guess-2',
    marca: 'Guess',
    modelo: 'GUESS GU00104',
    color: 'Dark Havana / Brown Gradient',
    material: 'Acetato de celulosa pulido',
    calibre: '52 mm',
    tipo: 'Oftálmico Femenino',
    image: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/GU00104-52F-4c9bc1bc.webp',
  },
  {
    id: 'nike-1',
    marca: 'Nike',
    modelo: 'NIKE 6045',
    color: 'Navy Matte / Royal Blue',
    material: 'Propionato inyectado ultra liviano',
    calibre: '54 mm',
    tipo: 'Deportivo Clínico',
    image: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/NIKE6045-410-d39201b5.webp',
  },
];

export default function HeroSpotlight() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const current = SPOTLIGHT_FRAMES[selectedIndex];

  return (
    <div className="relative w-full h-full flex flex-col justify-between">
      
      {/* Contenedor Editorial de la montura */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full shadow-xs relative overflow-hidden group">
        
        {/* Glow sutil champagne detrás del lente */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#B89768]/8 blur-[90px] rounded-full pointer-events-none" />

        {/* Encabezado del spotlight */}
        <div className="flex justify-between items-start relative z-10">
          <div>
            <span className="badge-brand">
              {current.marca}
            </span>
            <h3 className="font-editorial text-2xl font-semibold text-[#111111] mt-2 tracking-tight">
              {current.modelo}
            </h3>
            <p className="text-xs text-[#575551] mt-0.5">
              {current.color} • <span className="font-tech text-[#111111] font-semibold">{current.calibre}</span>
            </p>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F7F3EB] border border-[#B89768]/30 text-[#9E7D4F] text-[10px] font-bold uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-[#B89768]" />
            <span>Trending B2B</span>
          </div>
        </div>

        {/* Imagen central de la montura con animación al cambiar */}
        <div className="relative aspect-[16/10] my-4 flex items-center justify-center relative z-10">
          <Image
            key={current.id}
            unoptimized
            src={current.image}
            alt={`${current.marca} ${current.modelo}`}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-500 drop-shadow-[0_12px_20px_rgba(17,17,17,0.06)] animate-fade-in"
          />
        </div>

        {/* Selector interactivo de modelos en vitrina */}
        <div className="relative z-10 pt-4 border-t border-[#E5E4DF]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#82807A]">
              Explorar destacados:
            </span>
            <span className="text-[11px] text-[#B89768] font-semibold">
              {current.tipo}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {SPOTLIGHT_FRAMES.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedIndex(i)}
                className={`py-2 px-2 rounded-xl text-left border transition-all text-xs flex flex-col justify-between ${
                  i === selectedIndex
                    ? 'border-[#B89768] bg-[#F7F3EB] shadow-2xs'
                    : 'border-[#E5E4DF] bg-[#FAF9F6] text-[#575551] hover:border-[#82807A] hover:bg-[#FFFFFF]'
                }`}
              >
                <span className="font-editorial font-bold text-[12px] truncate block text-[#111111]">
                  {f.marca}
                </span>
                <span className="text-[9px] font-tech text-[#82807A] truncate block">
                  {f.modelo.replace(f.marca, '').trim()}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 pt-3 flex items-center justify-between border-t border-[#EFECE6]">
            <div className="flex items-center gap-1.5 text-[11px] text-[#575551]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#B89768]" />
              <span>Estuche oficial de marca</span>
            </div>

            <Link
              href="/catalogo"
              className="text-xs font-bold text-[#111111] hover:text-[#B89768] flex items-center gap-1 transition tracking-wide uppercase"
            >
              Catálogo <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
