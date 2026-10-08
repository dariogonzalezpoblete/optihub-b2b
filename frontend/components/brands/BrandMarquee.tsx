'use client';

import React from 'react';
import Link from 'next/link';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';

const TOP_BRANDS = [
  "Tom Ford", "Ray-Ban", "Gucci", "Prada", "Oakley", 
  "Zeiss", "Hugo Boss", "Balenciaga", "Versace", "Cartier", 
  "Dior", "Chanel", "Celine"
];

export default function BrandMarquee() {
  return (
    <div className="w-full bg-slate-950 border-y border-slate-800/60 py-10 relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 text-center">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">
          Partners Oficiales y Marcas de Lujo
        </h3>
      </div>

      <Swiper
        modules={[Autoplay]}
        spaceBetween={40}
        slidesPerView="auto"
        loop={true}
        speed={4000}
        autoplay={{
          delay: 0,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        className="brand-marquee-swiper !px-4"
        allowTouchMove={true}
      >
        {TOP_BRANDS.map((marca, idx) => (
          <SwiperSlide key={`${marca}-${idx}`} className="!w-auto">
            <Link 
              href={`/catalogo?marca=${encodeURIComponent(marca)}`}
              className="group flex items-center justify-center h-20 px-8 rounded-2xl bg-slate-900/40 border border-slate-800/50 hover:bg-slate-900 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-500 backdrop-blur-sm cursor-pointer"
            >
              <span className="text-2xl font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors duration-300">
                {marca}
              </span>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>
      
      {/* Añadir estilos para que el marquee sea completamente lineal en CSS global si es necesario, 
          aunque speed=4000 y delay=0 logran un buen efecto con Swiper. */}
    </div>
  );
}
