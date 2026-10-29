'use client';

import React from 'react';
import Link from 'next/link';

export interface BrandItem {
  id: string;
  name: string;
  query: string;
  category: 'Alta Gama' | 'Bestseller' | 'Sport' | 'Clínico' | 'Gemas / Joyería';
  logo: React.ReactNode;
}

export const OFFICIAL_BRANDS: BrandItem[] = [
  {
    id: 'tom-ford',
    name: 'Tom Ford',
    query: 'Tom Ford',
    category: 'Alta Gama',
    logo: (
      <svg viewBox="0 0 140 28" className="h-6 w-auto fill-current" aria-label="Tom Ford logo">
        <text
          x="70"
          y="20"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="15"
          letterSpacing="0.22em"
        >
          TOM FORD
        </text>
      </svg>
    ),
  },
  {
    id: 'gucci',
    name: 'Gucci',
    query: 'Gucci',
    category: 'Alta Gama',
    logo: (
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 32 20" className="h-5 w-auto fill-current" aria-label="Gucci GG monogram">
          {/* Interlocking GG */}
          <path d="M11 2C6.03 2 2 5.58 2 10s4.03 8 9 8c2.97 0 5.6-1.28 7.15-3.26C16.6 12.76 14 11 11 11v3c-2.76 0-5-2.24-5-5s2.24-5 5-5c1.9 0 3.55 1.06 4.41 2.62.9-.62 1.95-1.07 3.09-1.3C16.63 3.32 13.98 2 11 2z" />
          <path d="M21 2c-1.9 0-3.55 1.06-4.41 2.62-.9.62-1.95 1.07-3.09 1.3C15.37 3.32 18.02 2 21 2c4.97 0 9 3.58 9 8s-4.03 8-9 8c-2.97 0-5.6-1.28-7.15-3.26C15.4 12.76 18 11 21 11v3c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
        </svg>
        <span className="font-serif font-bold text-sm tracking-[0.26em] uppercase">GUCCI</span>
      </div>
    ),
  },
  {
    id: 'prada',
    name: 'Prada',
    query: 'Prada',
    category: 'Alta Gama',
    logo: (
      <div className="flex items-center">
        <svg viewBox="0 0 100 24" className="h-5 w-auto fill-current" aria-label="Prada logo">
          <text
            x="50"
            y="18"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontWeight="900"
            fontSize="18"
            letterSpacing="0.28em"
          >
            PRADA
          </text>
        </svg>
      </div>
    ),
  },
  {
    id: 'burberry',
    name: 'Burberry',
    query: 'Burberry',
    category: 'Alta Gama',
    logo: (
      <div className="flex flex-col items-center">
        <span className="font-sans font-black text-xs sm:text-sm tracking-[0.26em] uppercase leading-none">
          BURBERRY
        </span>
        <span className="text-[7px] tracking-[0.28em] text-[#9E8256] font-medium uppercase mt-0.5">
          LONDON
        </span>
      </div>
    ),
  },
  {
    id: 'ferragamo',
    name: 'Salvatore Ferragamo',
    query: 'Ferragamo',
    category: 'Alta Gama',
    logo: (
      <div className="flex flex-col items-center">
        <span className="font-serif italic font-normal text-base tracking-[0.08em] leading-tight">
          Salvatore Ferragamo
        </span>
      </div>
    ),
  },
  {
    id: 'versace',
    name: 'Versace',
    query: 'Versace',
    category: 'Alta Gama',
    logo: (
      <div className="flex flex-col items-center">
        <span className="font-serif font-bold text-xs sm:text-sm tracking-[0.32em] uppercase leading-none">
          VERSACE
        </span>
        <div className="w-12 h-[1px] bg-[#9E8256] mt-1 opacity-70" />
      </div>
    ),
  },
  {
    id: 'saint-laurent',
    name: 'Saint Laurent',
    query: 'Saint Laurent',
    category: 'Alta Gama',
    logo: (
      <div className="flex items-center gap-2">
        <span className="font-sans font-bold text-xs sm:text-sm tracking-[0.24em] uppercase">
          SAINT LAURENT
        </span>
      </div>
    ),
  },
  {
    id: 'balenciaga',
    name: 'Balenciaga',
    query: 'Balenciaga',
    category: 'Alta Gama',
    logo: (
      <span className="font-sans font-black text-xs sm:text-sm tracking-[0.3em] uppercase">
        BALENCIAGA
      </span>
    ),
  },
  {
    id: 'zeiss',
    name: 'Zeiss',
    query: 'Zeiss',
    category: 'Clínico',
    logo: (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-[#005CA9] text-white flex items-center justify-center font-bold text-[9px] tracking-tight shadow-sm flex-shrink-0">
          Z
        </div>
        <span className="font-sans font-black text-sm tracking-[0.22em] uppercase">
          ZEISS
        </span>
      </div>
    ),
  },
  {
    id: 'guess',
    name: 'Guess',
    query: 'Guess',
    category: 'Bestseller',
    logo: (
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" aria-label="Guess triangle logo">
          <polygon points="12,22 1,3 23,3" fill="#E11D48" />
          <polygon points="12,19 3.5,4.5 20.5,4.5" fill="#FFFFFF" />
          <text x="12" y="11" textAnchor="middle" fill="#0F0F0F" fontSize="4.5" fontWeight="900" fontFamily="sans-serif">GUESS</text>
          <text x="12" y="17" textAnchor="middle" fill="#E11D48" fontSize="6.5" fontWeight="900" fontFamily="sans-serif">?</text>
        </svg>
        <span className="font-serif font-black text-sm tracking-[0.22em] uppercase">
          GUESS
        </span>
      </div>
    ),
  },
  {
    id: 'calvin-klein',
    name: 'Calvin Klein',
    query: 'Calvin Klein',
    category: 'Bestseller',
    logo: (
      <div className="flex items-center gap-1.5">
        <span className="font-sans font-extralight text-lg leading-none tracking-tighter">c</span>
        <span className="font-sans font-black text-lg leading-none -ml-1">K</span>
        <span className="font-sans font-medium text-xs tracking-[0.22em] uppercase ml-1.5">
          CALVIN KLEIN
        </span>
      </div>
    ),
  },
  {
    id: 'nike',
    name: 'Nike',
    query: 'Nike',
    category: 'Sport',
    logo: (
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 24 14" className="h-4 w-auto fill-current flex-shrink-0" aria-label="Nike Swoosh">
          <path d="M23.6 1.8c-.8.8-2.6 2.3-5.2 4.4-4.2 3.4-7.5 5.5-9.8 6.2-1.3.4-2.4.4-3.3 0-.9-.4-1.3-1-1.3-1.8 0-.9.6-2 1.8-3.4C7.2 5.8 9 4.6 11.2 3.6c1.6-.7 3.2-1.2 4.8-1.5-3.6.4-7 1.8-10.1 4.2-2.3 1.8-3.9 3.8-4.7 5.9-.6 1.6-.6 2.8 0 3.6.6.7 1.6 1 3 1 1.7 0 3.7-.6 6.1-1.8 3.5-1.7 7.7-4.8 12.6-9.2.3-.3.6-.6.7-1v-1z" />
        </svg>
        <span className="font-sans font-black text-xs sm:text-sm tracking-[0.22em] uppercase">
          NIKE
        </span>
      </div>
    ),
  },
  {
    id: 'adidas',
    name: 'Adidas',
    query: 'Adidas',
    category: 'Sport',
    logo: (
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 16" className="h-4 w-auto fill-current flex-shrink-0" aria-label="Adidas 3 stripes">
          <polygon points="1,14 4.5,14 10,4.5 6.5,4.5" />
          <polygon points="7,14 10.5,14 16,1 12.5,1" />
          <polygon points="13,14 16.5,14 20,8 16.5,8" />
        </svg>
        <span className="font-sans font-bold text-xs sm:text-sm tracking-[0.16em] lowercase">
          adidas
        </span>
      </div>
    ),
  },
  {
    id: 'tommy-hilfiger',
    name: 'Tommy Hilfiger',
    query: 'Tommy Hilfiger',
    category: 'Bestseller',
    logo: (
      <div className="flex items-center gap-2">
        <div className="w-5 h-3.5 border border-[#0F0F0F] flex overflow-hidden flex-shrink-0">
          <div className="w-1.5 bg-[#00174F]" />
          <div className="flex-1 flex flex-col">
            <div className="h-1/2 bg-white" />
            <div className="h-1/2 bg-[#CC1020]" />
          </div>
          <div className="w-1.5 bg-[#00174F]" />
        </div>
        <span className="font-sans font-bold text-[11px] sm:text-xs tracking-[0.2em] uppercase">
          TOMMY HILFIGER
        </span>
      </div>
    ),
  },
  {
    id: 'swarovski',
    name: 'Swarovski',
    query: 'Swarovski',
    category: 'Gemas / Joyería',
    logo: (
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current flex-shrink-0" aria-label="Swarovski Swan">
          <path d="M19.5 7.2c-.8-1.4-2.2-2.2-3.8-2.2-1.2 0-2.3.5-3.1 1.4-.4.4-.7.9-.8 1.4-.2.9.1 1.8.7 2.4l.2.2c-.6.3-1.2.7-1.7 1.2-1.2 1.2-1.9 2.7-2.1 4.3-.1.7 0 1.5.2 2.2-1.3-.8-2.2-2.1-2.5-3.7-.3-1.4.1-2.9 1-4.1.2-.3.4-.6.7-.8-.4-.2-.8-.2-1.2-.1-.7.2-1.3.7-1.7 1.3-.9 1.4-1.2 3.1-.9 4.7.4 2.2 1.8 4 3.8 4.9 1.1.5 2.3.7 3.5.7 2.2 0 4.3-.8 5.9-2.3 2-1.9 2.9-4.5 2.5-7.1-.1-.7-.3-1.4-.6-2.1l-.1-.2z" />
        </svg>
        <span className="font-serif font-bold text-xs sm:text-sm tracking-[0.24em] uppercase">
          SWAROVSKI
        </span>
      </div>
    ),
  },
  {
    id: 'hugo-boss',
    name: 'Hugo Boss',
    query: 'Hugo Boss',
    category: 'Bestseller',
    logo: (
      <div className="flex items-center gap-1.5">
        <span className="font-sans font-black text-sm tracking-[0.26em] uppercase">
          BOSS
        </span>
        <span className="text-[8px] text-[#5C5A55] uppercase font-bold tracking-[0.16em]">
          HUGO BOSS
        </span>
      </div>
    ),
  },
  {
    id: 'emporio-armani',
    name: 'Emporio Armani',
    query: 'Emporio Armani',
    category: 'Alta Gama',
    logo: (
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 18" className="h-4 w-auto fill-current flex-shrink-0" aria-label="Armani Eagle">
          <path d="M12 2L9 6h6L12 2zm-8 5l3 2H4l-1-2zm16 0l1 2h-3l2-2zm-14 3l4 2H6l-2-2zm12 0l2 2h-4l2-2zm-10 3l3 2H8l-2-2zm8 0l2 2h-3l1-2zm-5 1h2v3h-2v-3z" />
        </svg>
        <span className="font-serif font-bold text-[11px] sm:text-xs tracking-[0.22em] uppercase">
          EMPORIO ARMANI
        </span>
      </div>
    ),
  },
  {
    id: 'lacoste',
    name: 'Lacoste',
    query: 'Lacoste',
    category: 'Bestseller',
    logo: (
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 14" className="w-5 h-auto fill-emerald-700 flex-shrink-0" aria-label="Lacoste Crocodile">
          <path d="M21 4c-.7 0-1.4.3-1.9.8-.3-.5-.8-.8-1.4-.8-.4 0-.8.1-1.1.4C16.1 4.1 15.4 4 14.7 4c-1.5 0-2.8.6-3.8 1.5-.7-.4-1.5-.6-2.4-.6-1.8 0-3.3.9-4.2 2.3-.4-.2-.8-.3-1.3-.3-1.7 0-3 1.3-3 3 0 1.2.7 2.2 1.7 2.7.3.7.9 1.2 1.7 1.4.6.1 1.2.1 1.8 0 1.1-.3 2-1 2.5-2 .5.1 1 .2 1.5.2 2.1 0 3.9-1.2 4.8-2.9.5.3 1.1.4 1.7.4.8 0 1.5-.3 2.1-.8.5.5 1.2.8 1.9.8 1.7 0 3-1.3 3-3s-1.3-3.7-3-3.7z" />
        </svg>
        <span className="font-sans font-black text-xs tracking-[0.22em] uppercase">
          LACOSTE
        </span>
      </div>
    ),
  },
  {
    id: 'carrera',
    name: 'Carrera',
    query: 'Carrera',
    category: 'Sport',
    logo: (
      <div className="flex items-center gap-1.5">
        <span className="font-sans italic font-black text-xs sm:text-sm tracking-[0.2em] uppercase text-[#CC1020]">
          CARRERA
        </span>
      </div>
    ),
  },
  {
    id: 'chopard',
    name: 'Chopard',
    query: 'Chopard',
    category: 'Alta Gama',
    logo: (
      <span className="font-serif italic font-medium text-base tracking-widest text-[#9E8256]">
        Chopard
      </span>
    ),
  },
  {
    id: 'tous',
    name: 'Tous',
    query: 'Tous',
    category: 'Gemas / Joyería',
    logo: (
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 20 22" className="w-4 h-auto fill-current flex-shrink-0" aria-label="Tous Bear">
          <circle cx="5" cy="4" r="2.8" />
          <circle cx="15" cy="4" r="2.8" />
          <circle cx="10" cy="8" r="4.2" />
          <path d="M6 11h8c2 0 3.5 1.8 3.5 4v3.5c0 1.5-1.2 2.5-2.5 2.5h-10C3.7 21 2.5 20 2.5 18.5V15c0-2.2 1.5-4 3.5-4z" />
        </svg>
        <span className="font-sans font-black text-xs sm:text-sm tracking-[0.26em] uppercase">
          TOUS
        </span>
      </div>
    ),
  },
  {
    id: 'bolle',
    name: 'Bollé',
    query: 'Bolle',
    category: 'Sport',
    logo: (
      <div className="flex items-center gap-1.5">
        <span className="font-sans font-black text-sm tracking-wide lowercase">
          bollé
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#0F0F0F]" />
      </div>
    ),
  },
  {
    id: 'ic-berlin',
    name: 'IC! Berlin',
    query: 'IC Berlin',
    category: 'Clínico',
    logo: (
      <div className="flex items-center gap-1.5">
        <span className="font-sans font-light text-sm tracking-tighter lowercase">
          ic! berlin
        </span>
        <span className="text-[8px] uppercase tracking-wider text-[#9E8256] font-semibold border border-[#9E8256]/40 px-1 py-0.2 rounded-none">
          TITAN
        </span>
      </div>
    ),
  },
  {
    id: 'dolce-gabbana',
    name: 'Dolce & Gabbana',
    query: 'Dolce & Gabbana',
    category: 'Alta Gama',
    logo: (
      <div className="flex items-center gap-1.5">
        <span className="font-serif font-bold text-xs sm:text-sm tracking-[0.24em] uppercase">
          DOLCE & GABBANA
        </span>
      </div>
    ),
  },
];

export default function BrandLogosMarquee() {
  return (
    <section className="mt-12 sm:mt-16 border-y border-[#E6E2DD] bg-[#FFFFFF] relative overflow-hidden py-4 sm:py-5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          
          {/* Badge Fijo de Marcas Oficiales (Desktop y Tablet) */}
          <div className="flex-shrink-0 pr-6 sm:pr-8 border-r border-[#E6E2DD] z-20 bg-[#FFFFFF] flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9E8256] animate-pulse" aria-hidden="true" />
              <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-[#9E8256] font-semibold whitespace-nowrap">
                MARCAS OFICIALES
              </span>
            </div>
            <span className="hidden sm:block text-[8px] uppercase tracking-[0.2em] text-[#787670] mt-0.5">
              100% ORIGINAL USA
            </span>
          </div>

          {/* Área de Desplazamiento Infinito con Máscaras de Gradiente */}
          <div className="relative flex-1 overflow-hidden ml-4 sm:ml-6 group">
            {/* Máscaras de fundido lateral */}
            <div 
              className="absolute left-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-r from-[#FFFFFF] to-transparent z-10 pointer-events-none" 
              aria-hidden="true" 
            />
            <div 
              className="absolute right-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-l from-[#FFFFFF] to-transparent z-10 pointer-events-none" 
              aria-hidden="true" 
            />

            {/* Carrusel Dinámico Continuo (Marquee con Pausa en Hover) */}
            <div className="animate-brand-marquee flex items-center gap-8 sm:gap-12 py-1">
              {/* Primer set de marcas */}
              {OFFICIAL_BRANDS.map((brand) => (
                <Link
                  key={`brand-1-${brand.id}`}
                  href={`/catalogo?marca=${encodeURIComponent(brand.query)}`}
                  className="group/item flex-shrink-0 flex items-center justify-center px-4 py-2 rounded-none border border-transparent hover:border-[#E6E2DD] hover:bg-[#FAF9F6] transition-all duration-300 text-[#5C5A55] hover:text-[#0F0F0F]"
                  title={`Ver colección ${brand.name} en el catálogo`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="transition-transform duration-300 group-hover/item:scale-105">
                      {brand.logo}
                    </div>
                    <span className="text-[8px] uppercase tracking-[0.16em] text-[#787670] opacity-0 group-hover/item:opacity-100 transition-opacity duration-200">
                      {brand.category}
                    </span>
                  </div>
                </Link>
              ))}

              {/* Segundo set idéntico para loop infinito continuo sin saltos */}
              {OFFICIAL_BRANDS.map((brand) => (
                <Link
                  key={`brand-2-${brand.id}`}
                  href={`/catalogo?marca=${encodeURIComponent(brand.query)}`}
                  aria-hidden="true"
                  tabIndex={-1}
                  className="group/item flex-shrink-0 flex items-center justify-center px-4 py-2 rounded-none border border-transparent hover:border-[#E6E2DD] hover:bg-[#FAF9F6] transition-all duration-300 text-[#5C5A55] hover:text-[#0F0F0F]"
                  title={`Ver colección ${brand.name} en el catálogo`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="transition-transform duration-300 group-hover/item:scale-105">
                      {brand.logo}
                    </div>
                    <span className="text-[8px] uppercase tracking-[0.16em] text-[#787670] opacity-0 group-hover/item:opacity-100 transition-opacity duration-200">
                      {brand.category}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
