'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

export interface SpotlightItem {
  id_ext: string;
  marca: string;
  modelo: string;
  codigo_color?: string;
  imagen_principal: string;
  categoriaTag: string;
  material?: string;
  segmento: 'altagama' | 'sport' | 'bestseller';
  subtitulo: string;
}

// Modelos verificados con stock e imágenes de alta definición en el catálogo real
const DEFAULT_SPOTLIGHT_ITEMS: SpotlightItem[] = [
  {
    id_ext: 'GG1319O-001',
    marca: 'Gucci',
    modelo: 'GG1319O',
    codigo_color: '001',
    imagen_principal: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/GG1319O-001-9d541048.webp',
    categoriaTag: 'ALTA GAMA · EXCLUSIVO',
    segmento: 'altagama',
    material: 'Acetato de Alta Densidad',
    subtitulo: 'Lujo Italiano Contemporáneo',
  },
  {
    id_ext: 'NIKE7026-610',
    marca: 'Nike',
    modelo: 'NIKE 7026',
    codigo_color: '610',
    imagen_principal: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/NIKE7026-610-33d3c913.webp',
    categoriaTag: 'LÍNEA SPORT · PERFORMANCE',
    segmento: 'sport',
    material: 'Polímero Ligero Inyectado',
    subtitulo: 'Ergonomía & Alto Rendimiento',
  },
  {
    id_ext: '0BE4434-412587',
    marca: 'Burberry',
    modelo: '0BE4434',
    codigo_color: '412587',
    imagen_principal: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/0BE4434-412587-23da6c28.webp',
    categoriaTag: 'ALTA GAMA · MAISON BRITÁNICA',
    segmento: 'altagama',
    material: 'Acetato Artesanal Pulido',
    subtitulo: 'Elegancia Clásica de Londres',
  },
  {
    id_ext: 'NIKE7125-404',
    marca: 'Nike',
    modelo: 'Nike 7125',
    codigo_color: '404',
    imagen_principal: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/NIKE7125-404-b964788a.webp',
    categoriaTag: 'LÍNEA SPORT · ULTRA RESISTENTE',
    segmento: 'sport',
    material: 'Flexon & Polímero Activo',
    subtitulo: 'Resistencia Dinámica Diaria',
  },
  {
    id_ext: 'GU9092-B84',
    marca: 'Guess',
    modelo: 'GU 9092',
    codigo_color: 'B84',
    imagen_principal: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/GU9092-B84-1e0e3334.webp',
    categoriaTag: 'BEST SELLER · ALTA ROTACIÓN',
    segmento: 'bestseller',
    material: 'Metal & Terminales de Acetato',
    subtitulo: 'Top Ventas Ópticas en Chile',
  },
  {
    id_ext: 'GU00105-53Z',
    marca: 'Guess',
    modelo: 'GU00105',
    codigo_color: '53Z',
    imagen_principal: 'https://yrdjnkbrvynmnzyrxlfx.supabase.co/storage/v1/object/public/marcos-imagenes/GU00105-53Z-97182cb1.webp',
    categoriaTag: 'BEST SELLER · ROTACIÓN RÁPIDA',
    segmento: 'bestseller',
    material: 'Inyección de Resina Pulida',
    subtitulo: 'Comercial & Margen Garantizado',
  },
];

interface HeroSpotlightProps {
  className?: string;
}

export default function HeroSpotlight({ className = '' }: HeroSpotlightProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentItem = DEFAULT_SPOTLIGHT_ITEMS[currentIndex];
  const total = DEFAULT_SPOTLIGHT_ITEMS.length;

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  const selectSegment = (seg: 'altagama' | 'sport' | 'bestseller') => {
    const idx = DEFAULT_SPOTLIGHT_ITEMS.findIndex((it) => it.segmento === seg);
    if (idx !== -1) setCurrentIndex(idx);
  };

  // Rotación automática cada 4.8 segundos, pausada al hacer hover
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, 4800);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, total]);

  const productUrl = `/producto/${encodeURIComponent(currentItem.marca)}/${encodeURIComponent(currentItem.modelo)}?sku=${encodeURIComponent(currentItem.id_ext)}`;

  return (
    <div
      className={`bg-[#F4F2ED] p-6 sm:p-10 flex flex-col justify-between relative overflow-hidden group select-none ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Vitrina dinámica de modelos destacados"
    >
      {/* 1. Header de la Vitrina: Pestañas de Segmentos y Controles */}
      <div className="z-10 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          {/* Badge de Categoría Dinámica */}
          <span className="text-[9px] uppercase tracking-[0.22em] text-[#0F0F0F] border border-[#E6E2DD] bg-[#FFFFFF] px-3 py-1 font-mono font-medium">
            {currentItem.categoriaTag}
          </span>

          {/* Origen EE.UU. & Lote */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#9E8256] uppercase tracking-wider">
              ORIGEN EE.UU.
            </span>
            <span className="text-[#E6E2DD]">/</span>
            <span className="text-[10px] font-mono text-[#5C5A55]">
              {String(currentIndex + 1).padStart(2, '0')}·{String(total).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Pestañas de Segmentos de Colección */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E6E2DD]/60">
          <div className="flex items-center gap-1">
            <button
              onClick={() => selectSegment('altagama')}
              className={`text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border transition-colors rounded-none font-mono ${
                currentItem.segmento === 'altagama'
                  ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                  : 'bg-white/80 text-[#5C5A55] border-[#E6E2DD] hover:text-[#0F0F0F]'
              }`}
            >
              Alta Gama
            </button>
            <button
              onClick={() => selectSegment('sport')}
              className={`text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border transition-colors rounded-none font-mono ${
                currentItem.segmento === 'sport'
                  ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                  : 'bg-white/80 text-[#5C5A55] border-[#E6E2DD] hover:text-[#0F0F0F]'
              }`}
            >
              Sport
            </button>
            <button
              onClick={() => selectSegment('bestseller')}
              className={`text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border transition-colors rounded-none font-mono ${
                currentItem.segmento === 'bestseller'
                  ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                  : 'bg-white/80 text-[#5C5A55] border-[#E6E2DD] hover:text-[#0F0F0F]'
              }`}
            >
              Best Sellers
            </button>
          </div>

          {/* Barras de Progreso de la Vitrina */}
          <div className="flex items-center gap-1">
            {DEFAULT_SPOTLIGHT_ITEMS.map((item, idx) => {
              const isActive = idx === currentIndex;
              return (
                <button
                  key={item.id_ext}
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Ver modelo ${item.marca} ${item.modelo}`}
                  className={`h-1 transition-all duration-300 rounded-none ${
                    isActive
                      ? 'w-5 bg-[#0F0F0F]'
                      : 'w-2 bg-[#E6E2DD] hover:bg-[#5C5A55]'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Área Central: Enlace con Fotografía del Armazón e Imagen con mix-blend-multiply */}
      <Link
        href={productUrl}
        className="relative my-auto py-6 sm:py-8 flex flex-col items-center justify-center group/card cursor-pointer focus:outline-none"
      >
        <div className="relative w-full aspect-[16/10] sm:aspect-[4/3] max-w-sm flex items-center justify-center">
          {/* Keyed image container para cross-fade sutil al rotar */}
          <div
            key={currentItem.id_ext}
            className="relative w-full h-full transition-opacity duration-500 animate-fade-in"
          >
            <Image
              unoptimized
              src={currentItem.imagen_principal}
              alt={`Armazón ${currentItem.marca} ${currentItem.modelo}`}
              fill
              priority
              className="object-contain mix-blend-multiply filter contrast-[1.05] group-hover/card:scale-105 transition-transform duration-500 ease-out"
              sizes="(max-width: 1024px) 100vw, 35vw"
            />
          </div>
        </div>

        <span className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#9E8256] font-medium opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center gap-1.5">
          <span>VER FICHA COMPLETA</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </Link>

      {/* 3. Metadato Inferior del Marco con Navegación Rectangular */}
      <div className="z-10 pt-4 border-t border-[#E6E2DD] flex justify-between items-end gap-4">
        <Link href={productUrl} className="group/text block">
          <p className="text-[9px] uppercase tracking-[0.22em] text-[#5C5A55] font-medium">
            {currentItem.marca} · {currentItem.subtitulo}
          </p>
          <p className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal leading-tight group-hover/text:text-[#9E8256] transition-colors">
            {currentItem.modelo}
          </p>
          <p className="text-[10px] text-[#5C5A55] tracking-wider mt-0.5 font-mono">
            COL. {currentItem.codigo_color} {currentItem.material ? `· ${currentItem.material}` : ''}
          </p>
        </Link>

        {/* Botones de Navegación Manual Cuadrados */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={prevSlide}
            aria-label="Modelo anterior"
            className="w-8 h-8 border border-[#E6E2DD] bg-[#FFFFFF] hover:bg-[#0F0F0F] hover:text-white hover:border-[#0F0F0F] text-[#0F0F0F] flex items-center justify-center transition-colors rounded-none"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextSlide}
            aria-label="Modelo siguiente"
            className="w-8 h-8 border border-[#E6E2DD] bg-[#FFFFFF] hover:bg-[#0F0F0F] hover:text-white hover:border-[#0F0F0F] text-[#0F0F0F] flex items-center justify-center transition-colors rounded-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
