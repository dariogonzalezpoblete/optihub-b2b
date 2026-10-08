'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';

const ALL_BRANDS = [
  "Abercrombie & Fitch", "Adidas", "Balenciaga", "Burberry", "Bvlgari", "Carrera", "Cartier", 
  "Celine", "Chanel", "Chopard", "Coach", "Dior", "Dolce & Gabbana", "Emporio Armani", 
  "Ermenegildo Zegna", "Fendi", "Giorgio Armani", "Gucci", "Guess", "Hugo Boss", 
  "Jimmy Choo", "Lacoste", "Loewe", "Marc Jacobs", "Max Mara", "Michael Kors", 
  "Miu Miu", "Oakley", "Persol", "Prada", "Ralph Lauren", "Ray-Ban", "Salvatore Ferragamo", 
  "Swarovski", "Tom Ford", "Tommy Hilfiger", "Tory Burch", "Valentino", "Versace", 
  "Yves Saint Laurent", "Zeiss"
].sort();

export default function BrandDirectory() {
  const [searchTerm, setSearchTerm] = useState('');

  // Agrupar por letra inicial
  const groupedBrands = useMemo(() => {
    const filtered = ALL_BRANDS.filter(b => b.toLowerCase().includes(searchTerm.toLowerCase()));
    const groups: Record<string, string[]> = {};
    
    filtered.forEach(brand => {
      const firstLetter = brand.charAt(0).toUpperCase();
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(brand);
    });
    
    return groups;
  }, [searchTerm]);

  const letters = Object.keys(groupedBrands).sort();

  return (
    <section id="marcas" className="py-24 bg-slate-950 relative border-t border-slate-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase mb-4">
              Directorio de <span className="text-emerald-400">Marcas</span>
            </h2>
            <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
              Explora nuestro portafolio completo de marcas exclusivas y diseñadores internacionales. Haz clic en cualquier marca para filtrar su catálogo completo.
            </p>
          </div>
          
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Buscar marca..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-slate-800 rounded-2xl leading-5 bg-slate-900/50 text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-colors"
            />
          </div>
        </div>

        {letters.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/20 rounded-3xl border border-slate-800/50">
            <p className="text-slate-500">No se encontraron marcas con "{searchTerm}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12">
            {letters.map((letter) => (
              <div key={letter} className="relative">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-800/60 pb-2">
                  <span className="text-3xl font-black text-slate-800">{letter}</span>
                </div>
                <ul className="space-y-3">
                  {groupedBrands[letter].map((brand) => (
                    <li key={brand}>
                      <Link 
                        href={`/catalogo?marca=${encodeURIComponent(brand.toLowerCase())}`}
                        className="group flex items-center justify-between py-1 text-sm font-medium text-slate-300 hover:text-emerald-400 transition-colors"
                      >
                        {brand}
                        <span className="text-slate-700 group-hover:text-emerald-500/50 transition-colors opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 duration-300">
                          &rarr;
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
