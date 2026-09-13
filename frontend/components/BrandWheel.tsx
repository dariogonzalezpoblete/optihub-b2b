'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Navigation } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/navigation';

interface Marca {
  nombre: string;
  tagline: string;
}

const marcas: Marca[] = [
  { nombre: 'nike', tagline: 'Performance & Sport' },
  { nombre: 'bolle', tagline: 'Eyewear de Alta Gama' },
  { nombre: 'oakley', tagline: 'Tecnología Óptica' },
  { nombre: 'ray-ban', tagline: 'Diseño Icónico' },
];

export default function BrandWheel() {
  const router = useRouter();

  const handleBrandClick = (marcaNombre: string) => {
    router.push(`/catalogo?marca=${marcaNombre.toLowerCase()}`);
  };

  return (
    <section className="py-12 bg-slate-900 text-white rounded-3xl my-8 px-6 shadow-2xl">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-emerald-400 uppercase">
            Nuestras Marcas Exclusivas
          </h2>
          <p className="mt-2 text-slate-400 text-lg">
            Selecciona una marca para explorar el catálogo mayorista
          </p>
        </div>

        <Swiper
          modules={[Autoplay, Navigation]}
          spaceBetween={30}
          slidesPerView={1}
          autoplay={{ delay: 3500, disableOnInteraction: false }}
          breakpoints={{
            640: { slidesPerView: 2 },
            1024: { slidesPerView: 3 },
          }}
          className="py-4"
        >
          {marcas.map((m) => (
            <SwiperSlide key={m.nombre}>
              <div
                onClick={() => handleBrandClick(m.nombre)}
                className="group relative cursor-pointer overflow-hidden rounded-2xl bg-slate-800/80 p-8 text-center border border-slate-700/50 transition-all duration-300 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-1"
              >
                <div className="h-24 flex items-center justify-center mb-4">
                  <span className="text-4xl font-black uppercase tracking-widest text-slate-200 group-hover:text-emerald-400 transition-colors">
                    {m.nombre}
                  </span>
                </div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  {m.tagline}
                </p>
                <div className="mt-4 inline-flex items-center text-sm font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver colección →
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}