'use client';

import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import type { EnrichedMarco, FacetOption } from '@/lib/catalog/types';

interface ProductCardProps {
  variants: EnrichedMarco[];
  isLoggedIn: boolean;
  onOpen: (m: EnrichedMarco) => void;
  idx: number;
  materialLabels: FacetOption[];
}

export default function ProductCard({ variants, isLoggedIn, onOpen, idx, materialLabels }: ProductCardProps) {
  // Estado para manejar qué variante (color) está activa en la tarjeta
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Si cambian los resultados (ej. por una búsqueda), reiniciamos al primer elemento
  useEffect(() => {
    setSelectedIndex(0);
  }, [variants]);

  const active = variants[selectedIndex] || variants[0];
  const inStock = active.stock > 0;
  const materialLabel = materialLabels.find((o) => o.key === active._k.material)?.label ?? active.material;

  return (
    <div 
      className="card-product group animate-slide-up flex flex-col justify-between"
      style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
    >
      {/* ZONA DE IMAGEN Y BADGES */}
      <div 
        className="relative h-56 bg-slate-950 flex items-center justify-center p-4 overflow-hidden cursor-pointer"
        onClick={() => onOpen(active)}
      >
        <img 
          key={active.id_ext} // Forzar re-render de la animación al cambiar variante
          src={active.imagen_principal || "/placeholder.png"} 
          alt={`${active.marca} ${active.modelo} ${active.color}`}
          loading="lazy"
          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-500 animate-fade-in"
        />
        
        {/* Badges Superiores */}
        <span className="badge-brand absolute top-3 left-3 z-10 shadow-md">
          {active.marca}
        </span>
        
        {active._dims && (
          <span className="absolute top-3 right-3 z-10 text-[10px] font-mono text-slate-300 bg-slate-900/90 border border-slate-700/80 px-2 py-1 rounded-md shadow-md backdrop-blur-sm">
            {active._dims.calibre}{active._dims.puente ? `□${active._dims.puente}` : ' mm'}
          </span>
        )}

        {/* Badge de Disponibilidad (Inferior) */}
        <span className={`absolute bottom-3 left-3 z-10 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border backdrop-blur-md shadow-lg transition-colors ${
          inStock 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        }`}>
          {inStock ? 'En stock' : 'Importación directa'}
        </span>

        {/* Overlay sutil al hover (B2B Glow) */}
        <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition duration-300 rounded-t-2xl pointer-events-none" />
      </div>

      {/* ZONA DE INFORMACIÓN Y CONTROLES */}
      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between bg-slate-900 z-10 relative border-t border-slate-800/50">
        <div>
          <div className="flex justify-between items-start gap-2">
            <h3 
              className="font-bold text-white text-base leading-tight hover:text-emerald-400 transition-colors line-clamp-2 cursor-pointer"
              onClick={() => onOpen(active)}
            >
              {active.modelo}
            </h3>
            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
              {active.codigo_color}
            </span>
          </div>
          
          <div className="flex justify-between items-center mt-1.5">
            <p className="text-[11px] text-slate-500 font-mono">SKU: <span className="text-slate-400">{active.id_ext}</span></p>
            {active.material && (
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{materialLabel}</p>
            )}
          </div>

          {/* SELECTOR RÁPIDO DE VARIANTES (SWATCHES) */}
          {variants.length > 1 && (
            <div className="mt-4">
              <p className="text-[10px] text-slate-500 mb-2 font-medium">{variants.length} colores disponibles:</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v, i) => (
                  <button
                    key={v.id_ext}
                    type="button"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setSelectedIndex(i); 
                    }}
                    className={`w-9 h-9 rounded-lg border overflow-hidden bg-slate-950 transition-all ${
                      i === selectedIndex 
                        ? 'border-emerald-500 ring-1 ring-emerald-500/50 shadow-sm shadow-emerald-500/20' 
                        : 'border-slate-700 opacity-60 hover:opacity-100 hover:border-slate-500 hover:scale-105'
                    }`}
                    title={`${v.color || v.codigo_color} (SKU: ${v.id_ext})`}
                  >
                    <img 
                      src={v.imagen_principal || "/placeholder.png"} 
                      className="w-full h-full object-cover p-1" 
                      alt={v.codigo_color} 
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PIE DE TARJETA: PRECIO Y STOCK B2B */}
        <div className="pt-4 mt-2 border-t border-slate-800/80 flex justify-between items-end">
          {isLoggedIn ? (
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-widest mb-0.5">Neto B2B</span>
              <span className="text-emerald-400 font-black text-lg leading-none">
                ${active.precio_neto_clp?.toLocaleString('es-CL')} <span className="text-xs font-medium text-emerald-400/60">CLP</span>
              </span>
            </div>
          ) : (
            <span className="badge-b2b-locked mb-1">
              <Lock className="w-3 h-3" />
              Precio B2B
            </span>
          )}

          <div className="text-right">
            <span className="badge-stock">
              {active.stock} un.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
