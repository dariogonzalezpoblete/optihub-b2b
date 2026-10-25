'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Lock, TrendingUp } from 'lucide-react';
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
      className="card-product group animate-slide-up flex flex-col justify-between bg-[#FFFFFF] border border-[#E5E4DF] hover:border-[#B89768] transition-all duration-300"
      style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
    >
      {/* ZONA DE IMAGEN Y BADGES EDITORIALES */}
      <div 
        className="relative h-60 bg-[#FFFFFF] flex items-center justify-center p-6 overflow-hidden cursor-pointer"
        onClick={() => onOpen(active)}
      >
        {/* Skeleton Loader mientras carga la foto */}
        {!imgLoaded && (
          <div className="absolute inset-4 bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl animate-pulse flex items-center justify-center">
            <span className="text-[10px] text-[#82807A] font-tech tracking-wider uppercase">Cargando Armazón...</span>
          </div>
        )}

        <Image 
          unoptimized 
          key={active.id_ext}
          src={active.imagen_principal || "/placeholder.png"} 
          alt={`${active.marca} ${active.modelo} ${active.color}`}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className={`object-contain p-4 group-hover:scale-105 transition-all duration-500 ease-out ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImgLoaded(true)}
        />
        
        {/* Badges Superiores: Marca con Tipografía Editorial y Rotación */}
        <div className="absolute top-3.5 left-3.5 z-10 flex flex-col gap-1.5 items-start">
          <span className="badge-brand">
            {active.marca}
          </span>

          {/* Badge de Rotación B2B */}
          {rotationBadge && (
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full border border-[#E5E4DF] bg-[#FFFFFF]/90 text-[#575551] shadow-xs backdrop-blur-sm">
              <span>{rotationBadge.icon}</span>
              <span>{rotationBadge.label}</span>
            </span>
          )}
        </div>
        
        {/* Calibre Técnico Monospaciado */}
        {active._dims && (
          <span className="absolute top-3.5 right-3.5 z-10 text-[10px] font-tech text-[#575551] bg-[#FFFFFF]/95 border border-[#E5E4DF] px-2 py-0.5 rounded-md shadow-xs backdrop-blur-sm">
            {active._dims.calibre}{active._dims.puente ? `□${active._dims.puente}` : ' mm'}
          </span>
        )}

        {/* Halo sutil al hover */}
        <div className="absolute inset-0 bg-[#B89768]/0 group-hover:bg-[#B89768]/[0.02] transition duration-300 pointer-events-none" />
      </div>

      {/* ZONA DE INFORMACIÓN Y FICHA TÉCNICA */}
      <div className="p-5 space-y-3.5 flex-1 flex flex-col justify-between bg-[#FFFFFF] z-10 relative border-t border-[#E5E4DF]">
        <div>
          <div className="flex justify-between items-start gap-2">
            <h3 
              className="font-editorial text-xl font-semibold text-[#111111] leading-snug hover:text-[#B89768] transition-colors line-clamp-2 cursor-pointer tracking-tight"
              onClick={() => onOpen(active)}
            >
              {active.modelo}
            </h3>
            <span className="text-[10px] text-[#575551] font-tech flex-shrink-0 bg-[#FAF9F6] px-2 py-0.5 rounded border border-[#E5E4DF]">
              COL {active.codigo_color || 'N/A'}
            </span>
          </div>
          
          <div className="flex justify-between items-center mt-2">
            <p className="text-[11px] text-[#82807A] font-tech">
              SKU: <span className="text-[#111111] font-medium">{active.id_ext}</span>
            </p>
            {active.material && (
              <p className="text-[10px] text-[#575551] uppercase tracking-wider font-medium">{materialLabel}</p>
            )}
          </div>

          {/* SELECTOR RÁPIDO DE VARIANTES (SWATCHES EDITORIALES) */}
          {variants.length > 1 && (
            <div className="mt-3.5 pt-3 border-t border-[#EFECE6]">
              <p className="text-[10px] text-[#82807A] mb-2 font-medium tracking-wide uppercase">
                {variants.length} Acabados Disponibles:
              </p>
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
                    className={`relative w-8 h-8 rounded-lg border overflow-hidden bg-[#FFFFFF] transition-all ${
                      i === selectedIndex 
                        ? 'border-[#B89768] ring-1 ring-[#B89768] shadow-xs scale-105' 
                        : 'border-[#E5E4DF] opacity-70 hover:opacity-100 hover:border-[#82807A]'
                    }`}
                    title={`${v.color || v.codigo_color} (SKU: ${v.id_ext})`}
                  >
                    <Image 
                      unoptimized 
                      src={v.imagen_principal || "/placeholder.png"} 
                      className="object-cover p-0.5" 
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
          <div className="bg-[#FAF9F6] rounded-xl p-3 border border-[#E5E4DF] space-y-1 my-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-[#575551]">PVP Sugerido en Óptica:</span>
              <span className="font-bold text-[#111111] font-tech">${retail.pvpSugerido.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between items-center text-[11px] font-semibold text-[#9E7D4F]">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#B89768]" />
                Margen ~{retail.margenPorcentaje}%
              </span>
              <span className="font-tech text-xs text-[#111111]">Ganas +${retail.gananciaPorUnidad.toLocaleString('es-CL')}/un</span>
            </div>
          </div>
        )}

        {/* PIE DE TARJETA: PRECIO NETO Y STOCK B2B */}
        <div className="pt-3 border-t border-[#E5E4DF] flex justify-between items-end">
          {isLoggedIn ? (
            <div>
              <span className="text-[9px] text-[#82807A] block uppercase font-bold tracking-widest mb-0.5">
                Precio Neto B2B (+IVA)
              </span>
              <span className="text-[#111111] font-bold text-xl leading-none font-tech">
                ${active.precio_neto_clp?.toLocaleString('es-CL')} <span className="text-xs font-normal text-[#82807A]">CLP</span>
              </span>
            </div>
          ) : (
            <span className="badge-b2b-locked mb-1">
              <Lock className="w-3 h-3 text-[#B89768]" />
              Precio B2B Reservado
            </span>
          )}

          {isLoggedIn && (
            <div className="text-right">
              <span className="text-[9px] text-[#82807A] block uppercase font-bold tracking-wider mb-0.5">
                Stock Origen
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
