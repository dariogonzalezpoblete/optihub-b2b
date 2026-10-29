'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Lock, TrendingUp } from 'lucide-react';
import type { EnrichedMarco, FacetOption } from '@/lib/catalog/types';
import { getValidStock } from '@/store/useCartStore';
import { calculateRetailProjection } from '@/lib/catalog/brandCategories';

interface ProductCardProps {
  variants: EnrichedMarco[];
  isLoggedIn: boolean;
  idx: number;
  materialLabels: FacetOption[];
  onOpen?: (m: EnrichedMarco) => void;
}

export default function ProductCard({ variants, isLoggedIn, idx, materialLabels }: ProductCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [variants]);

  const active = (variants && variants[selectedIndex]) || (variants && variants[0]) || ({} as EnrichedMarco);
  const activeStock = getValidStock(active?.stock);
  const materialLabel = materialLabels?.find((o) => o.key === active?._k?.material)?.label ?? active?.material;
  const retail = calculateRetailProjection(active?.precio_neto_clp, active?.marca);

  const mainImgSrc = active?.imagen_principal && active.imagen_principal.trim()
    ? active.imagen_principal.trim()
    : '/placeholder.png';

  // Segunda foto alternativa para hover si hay más de una variante o si hay otra toma
  const secondaryVariant = variants && variants.length > 1 ? variants.find((_, i) => i !== selectedIndex) : null;
  const secondaryImgSrc = secondaryVariant?.imagen_principal && secondaryVariant.imagen_principal.trim()
    ? secondaryVariant.imagen_principal.trim()
    : null;

  const productHref = `/producto/${encodeURIComponent(active?.marca || '')}/${encodeURIComponent(active?.modelo || '')}${active?.id_ext ? `?sku=${encodeURIComponent(active.id_ext)}` : ''}`;

  const calibreText = active?._dims?.calibre 
    ? `${active._dims.calibre}${active._dims.puente ? `□${active._dims.puente}` : ' mm'}`
    : null;

  return (
    <div
      className="card-product group bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#0F0F0F] transition-all duration-300 flex flex-col justify-between rounded-none"
      style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
    >
      {/* 1. ZONA DE IMAGEN (ASPECT-[4/3] SOBRE FONDO PIEDRA #F4F2ED CON MIX-BLEND-MULTIPLY) */}
      <Link
        href={productHref}
        className="relative aspect-[4/3] bg-[#F4F2ED] flex items-center justify-center p-6 overflow-hidden cursor-pointer block border-b border-[#E6E2DD]"
      >
        {/* Encabezado Superior Sobre la Imagen */}
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#0F0F0F] bg-[#FFFFFF]/90 border border-[#E6E2DD] px-2.5 py-0.5">
            {active?.marca || 'Marca'}
          </span>

          {calibreText && (
            <span className="text-[11px] font-mono text-[#5C5A55] bg-[#FFFFFF]/90 border border-[#E6E2DD] px-2 py-0.5 tabular-nums">
              {calibreText}
            </span>
          )}
        </div>

        {/* Imagen Principal */}
        <div className="relative w-full h-full">
          <Image
            unoptimized
            key={active?.id_ext || `prod-${idx}`}
            src={mainImgSrc}
            alt={`${active?.marca || ''} ${active?.modelo || ''} ${active?.color || ''}`.trim() || 'Armazón'}
            fill
            priority={idx < 6}
            sizes="(max-width: 768px) 100vw, 33vw"
            className={`object-contain p-4 mix-blend-multiply transition-all duration-500 ease-out group-hover:scale-[1.03] ${
              secondaryImgSrc ? 'group-hover:opacity-0' : ''
            }`}
          />

          {/* Segunda Foto Opcional en Hover */}
          {secondaryImgSrc && (
            <Image
              unoptimized
              src={secondaryImgSrc}
              alt={`${active?.marca || ''} ${active?.modelo || ''} alternate`}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-contain p-4 mix-blend-multiply transition-all duration-500 ease-out opacity-0 group-hover:opacity-100 group-hover:scale-[1.03]"
            />
          )}
        </div>
      </Link>

      {/* 2. ZONA DE INFORMACIÓN EDITORIAL */}
      <div className="p-6 space-y-4 flex-1 flex flex-col justify-between bg-[#FFFFFF]">
        <div>
          {/* Nombre de Modelo en Serif Grande */}
          <div className="flex justify-between items-baseline gap-2">
            <Link
              href={productHref}
              className="font-serif text-2xl font-normal text-[#0F0F0F] hover:text-[#9E8256] transition-colors line-clamp-1 tracking-tight"
            >
              {active?.modelo || 'Modelo'}
            </Link>
            <span className="text-xs text-[#5C5A55] font-mono shrink-0 tabular-nums">
              Col. {active?.codigo_color || 'N/A'}
            </span>
          </div>

          {/* Metadatos Técnicos (Ocultos en reposo, revelados al hover) */}
          <div className="h-5 mt-1.5 flex justify-between items-center text-xs text-[#5C5A55] font-mono transition-opacity duration-300 opacity-0 group-hover:opacity-100">
            <span className="text-[10px] text-[#787670]">
              SKU: {active?.id_ext || '-'}
            </span>
            {active?.material && (
              <span className="text-[10px] uppercase tracking-wider text-[#5C5A55]">
                {materialLabel}
              </span>
            )}
          </div>

          {/* SELECTOR RÁPIDO DE VARIANTES (SWATCHES RECTANGULARES MINIMALISTAS) */}
          {variants && variants.length > 1 && (
            <div className="mt-3 pt-3 border-t border-[#E6E2DD]">
              <p className="text-[10px] text-[#787670] mb-2 font-medium tracking-[0.14em] uppercase">
                {variants.length} Acabados Disponibles:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {variants.map((v, i) => {
                  const swatchSrc = v?.imagen_principal && v.imagen_principal.trim() ? v.imagen_principal.trim() : '/placeholder.png';
                  return (
                    <button
                      key={v?.id_ext || `swatch-${i}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setSelectedIndex(i);
                      }}
                      className={`relative w-8 h-8 border overflow-hidden bg-[#F4F2ED] transition-all flex items-center justify-center rounded-none cursor-pointer ${
                        i === selectedIndex
                          ? 'border-[#0F0F0F] ring-1 ring-[#0F0F0F]'
                          : 'border-[#E6E2DD] opacity-75 hover:opacity-100 hover:border-[#0F0F0F]'
                      }`}
                      title={`${v?.color || v?.codigo_color || 'Variante'} (SKU: ${v?.id_ext})`}
                    >
                      <img
                        src={swatchSrc}
                        alt={v?.codigo_color || v?.color || 'Color'}
                        loading="eager"
                        decoding="async"
                        className="w-full h-full object-contain p-0.5 mix-blend-multiply"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* MARGEN RETAIL SUGERIDO PARA ÓPTICAS LOGUEADAS */}
        {isLoggedIn && retail.pvpSugerido > 0 && (
          <div className="bg-[#FAF9F6] border border-[#E6E2DD] p-3 space-y-1 rounded-none text-xs">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-[#5C5A55]">PVP Sugerido en Óptica:</span>
              <span className="font-bold text-[#0F0F0F] font-mono tabular-nums">
                ${retail.pvpSugerido.toLocaleString('es-CL')}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-[#9E8256] font-medium">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Margen ~{retail.margenPorcentaje}%
              </span>
              <span className="font-mono text-[#0F0F0F] tabular-nums">
                +${retail.gananciaPorUnidad.toLocaleString('es-CL')}/un
              </span>
            </div>
          </div>
        )}

        {/* 3. PIE DE TARJETA ARQUITECTÓNICO (PRECIO NETO Y VER FICHA) */}
        <div className="pt-4 border-t border-[#E6E2DD] flex justify-between items-end">
          {isLoggedIn ? (
            <div>
              <span className="text-[9px] text-[#787670] block uppercase font-medium tracking-[0.16em] mb-0.5">
                PRECIO NETO B2B (+IVA)
              </span>
              <span className="text-[#0F0F0F] font-bold text-xl leading-none font-mono tabular-nums">
                ${active?.precio_neto_clp?.toLocaleString('es-CL')}{' '}
                <span className="text-xs font-normal text-[#787670]">CLP</span>
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#846C44] bg-[#F7F3EB] border border-[#9E8256]/30 px-2.5 py-1 rounded-none mb-1">
              <Lock className="w-3 h-3 text-[#9E8256]" />
              PRECIO B2B
            </span>
          )}

          <div className="flex flex-col items-end gap-1.5">
            {isLoggedIn && (
              <span className="text-[10px] font-mono text-[#5C5A55] bg-[#F4F2ED] border border-[#E6E2DD] px-2 py-0.5 tabular-nums rounded-none">
                {activeStock >= 50 ? '50+ un.' : `${activeStock} un.`}
              </span>
            )}
            <Link
              href={productHref}
              className="text-[11px] uppercase tracking-[0.16em] font-medium text-[#0F0F0F] hover:text-[#9E8256] transition-colors flex items-center gap-1"
            >
              <span>Ver Ficha</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
