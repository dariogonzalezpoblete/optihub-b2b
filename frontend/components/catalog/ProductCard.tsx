'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Lock, TrendingUp, Sparkles } from 'lucide-react';
import type { EnrichedMarco, FacetOption } from '@/lib/catalog/types';
import { getValidStock } from '@/store/useCartStore';
import { getRotationBadge, calculateRetailProjection } from '@/lib/catalog/brandCategories';

interface ProductCardProps {
  variants: EnrichedMarco[];
  isLoggedIn: boolean;
  onOpen: (m: EnrichedMarco) => void;
  idx: number;
  materialLabels: FacetOption[];
}

export default function ProductCard({ variants, isLoggedIn, onOpen, idx, materialLabels }: ProductCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setSelectedIndex(0);
    setImgLoaded(false);
  }, [variants]);

  const active = variants[selectedIndex] || variants[0];
  const activeStock = getValidStock(active.stock);
  const materialLabel = materialLabels.find((o) => o.key === active._k.material)?.label ?? active.material;
  const rotationBadge = getRotationBadge(active.marca);
  const retail = calculateRetailProjection(active.precio_neto_clp);

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
        {/* Skeleton Loader mientras carga la foto */}
        {!imgLoaded && (
          <div className="absolute inset-4 bg-slate-900 rounded-2xl animate-pulse flex items-center justify-center">
            <span className="text-[10px] text-slate-700 font-mono tracking-wider">CARGANDO FOTO...</span>
          </div>
        )}

        <Image 
          unoptimized 
          key={active.id_ext}
          src={active.imagen_principal || "/placeholder.png"} 
          alt={`${active.marca} ${active.modelo} ${active.color}`}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className={`object-contain p-4 group-hover:scale-105 transition-all duration-500 ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImgLoaded(true)}
        />
        
        {/* Badges Superiores: Marca y Calibre */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 items-start">
          <span className="badge-brand shadow-md">
            {active.marca}
          </span>

          {/* Badge de Rotación B2B */}
          {rotationBadge && (
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md ${rotationBadge.bg} ${rotationBadge.text}`}>
              <span>{rotationBadge.icon}</span>
              <span>{rotationBadge.label}</span>
            </span>
          )}
        </div>
        
        {active._dims && (
          <span className="absolute top-3 right-3 z-10 text-[10px] font-mono text-slate-300 bg-slate-900/90 border border-slate-700/80 px-2 py-1 rounded-md shadow-md backdrop-blur-sm">
            {active._dims.calibre}{active._dims.puente ? `□${active._dims.puente}` : ' mm'}
          </span>
        )}

        {/* Overlay sutil al hover */}
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
            <div className="mt-3">
              <p className="text-[10px] text-slate-500 mb-1.5 font-medium">{variants.length} colores disponibles:</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v, i) => (
                  <button
                    key={v.id_ext}
                    type="button"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setSelectedIndex(i); 
                      setImgLoaded(false);
                    }}
                    className={`relative w-9 h-9 rounded-lg border overflow-hidden bg-slate-950 transition-all ${
                      i === selectedIndex 
                        ? 'border-emerald-500 ring-1 ring-emerald-500/50 shadow-sm shadow-emerald-500/20' 
                        : 'border-slate-700 opacity-60 hover:opacity-100 hover:border-slate-500 hover:scale-105'
                    }`}
                    title={`${v.color || v.codigo_color} (SKU: ${v.id_ext})`}
                  >
                    <Image 
                      unoptimized 
                      src={v.imagen_principal || "/placeholder.png"} 
                      className="object-cover p-1" 
                      alt={v.codigo_color || "Color"} 
                      fill
                      sizes="32px"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CALCULADORA DE MARGEN RETAIL PARA ÓPTICAS LOGUEADAS */}
        {isLoggedIn && retail.pvpSugerido > 0 && (
          <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/90 space-y-1 my-1">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400">PVP Sugerido en Óptica:</span>
              <span className="font-bold text-slate-200 font-mono">${retail.pvpSugerido.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold text-emerald-400">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                Margen ~{retail.margenPorcentaje}%
              </span>
              <span>Ganas +${retail.gananciaPorUnidad.toLocaleString('es-CL')}/un</span>
            </div>
          </div>
        )}

        {/* PIE DE TARJETA: PRECIO Y STOCK B2B */}
        <div className="pt-3 border-t border-slate-800/80 flex justify-between items-end">
          {isLoggedIn ? (
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-widest mb-0.5">Neto B2B (+IVA)</span>
              <span className="text-emerald-400 font-black text-lg leading-none font-mono">
                ${active.precio_neto_clp?.toLocaleString('es-CL')} <span className="text-xs font-medium text-emerald-400/60">CLP</span>
              </span>
            </div>
          ) : (
            <span className="badge-b2b-locked mb-1">
              <Lock className="w-3 h-3" />
              Precio B2B
            </span>
          )}

          {isLoggedIn && (
            <div className="text-right">
              <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider mb-0.5">
                Stock en origen
              </span>
              <span className="badge-stock">
                {activeStock >= 50 ? '50+ un.' : `${activeStock} un.`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
