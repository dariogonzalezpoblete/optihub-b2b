'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Sparkles, ShieldCheck, ArrowRight, Eye } from 'lucide-react';

const SPOTLIGHT_FRAMES = [
  {
    id: 'guess-1',
    marca: 'Guess',
    modelo: 'GUESS GU 2938',
    color: 'Havana / Gold',
    material: 'Acetato de celulosa',
    calibre: '54 mm',
    tipo: 'Oftálmico Femenino',
    image: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/GU2938-052-16ce3492.webp',
    fallback: '/placeholder.png',
  },
  {
    id: 'nike-1',
    marca: 'Nike',
    modelo: 'NIKE ELECTRIC DRIP',
    color: 'Black Tortoise / Grey',
    material: 'Propionato inyectado',
    calibre: '60 mm',
    tipo: 'Deportivo Solar',
    image: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/NIKEELECTRICDRIPIF1011X-010-9d95fd17.webp',
    fallback: '/placeholder.png',
  },
  {
    id: 'guess-2',
    marca: 'Guess',
    modelo: 'GUESS GF 5084',
    color: 'Shiny Rose Gold',
    material: 'Metal ligero',
    calibre: '56 mm',
    tipo: 'Diseño Aviador',
    image: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/GF5084-28B-b31fbcbe.webp',
    fallback: '/placeholder.png',
  },
];

export default function HeroSpotlight() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const current = SPOTLIGHT_FRAMES[selectedIndex];

  return (
    <div className="relative w-full h-full flex flex-col justify-between">
      
      {/* Contenedor Glassmorphism de la montura */}
      <div className="bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950/90 border border-slate-800/80 rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full shadow-2xl relative overflow-hidden group">
        
        {/* Glow de acento verde detrás del lente */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/15 blur-[90px] rounded-full pointer-events-none" />

        {/* Encabezado del spotlight */}
        <div className="flex justify-between items-start relative z-10">
          <div>
            <span className="badge-brand text-[10px] font-bold">
              {current.marca}
            </span>
            <h3 className="text-xl sm:text-2xl font-black text-white mt-1.5 tracking-tight">
              {current.modelo}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {current.color} • <span className="text-emerald-400">{current.calibre}</span>
            </p>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
            <Sparkles className="w-3 h-3" />
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
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-500 drop-shadow-[0_15px_25px_rgba(0,0,0,0.6)] animate-fade-in"
          />
        </div>

        {/* Selector interactivo de modelos en vitrina */}
        <div className="relative z-10 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Explorar destacados:
            </span>
            <span className="text-[11px] text-emerald-400 font-semibold">
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
                    ? 'border-emerald-500 bg-emerald-500/10 shadow-sm shadow-emerald-500/20'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-white'
                }`}
              >
                <span className="font-bold text-[11px] truncate block text-white">
                  {f.marca}
                </span>
                <span className="text-[9px] text-slate-400 truncate block">
                  {f.modelo.replace(f.marca, '').trim()}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 pt-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Certificado con estuche de fábrica</span>
            </div>

            <Link
              href="/catalogo"
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
            >
              Ver en catálogo <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
