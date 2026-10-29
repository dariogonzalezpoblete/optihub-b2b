'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Lock, TrendingUp, ShoppingBag } from 'lucide-react';
import type { EnrichedMarco, FacetOption } from '@/lib/catalog/types';
import { getValidStock } from '@/store/useCartStore';
import { calculateRetailProjection } from '@/lib/catalog/brandCategories';

interface ProductCardProps {
  variants: EnrichedMarco[];
  isLoggedIn: boolean;
  idx: number;
  materialLabels: FacetOption[];
  onOpen?: (m: EnrichedMarco) => void;
  onQuickAdd?: (variants: EnrichedMarco[]) => void;
}

export default function ProductCard({ variants, isLoggedIn, idx, materialLabels, onQuickAdd }: ProductCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [variants]);

  const active = (variants && variants[selectedIndex]) || (variants && variants[0]) || ({} as EnrichedMarco);
  const activeStock = getValidStock(active?.stock);
  const materialLabel = materialLabels?.find((o) => o.key === active?._k?.material)?.label ?? active?.material;
  const hasValidPrice = isLoggedIn && typeof active?.precio_neto_clp === 'number' && active.precio_neto_clp > 0;
  const retail = calculateRetailProjection(active?.precio_neto_clp, active?.marca);

  const mainImgSrc = active?.imagen_principal && active.imagen_principal.trim()
    ? active.imagen_principal.trim()
    : '/placeholder.png';

  const productHref = `/producto/${encodeURIComponent(active?.marca || '')}/${encodeURIComponent(active?.modelo || '')}${active?.id_ext ? `?sku=${encodeURIComponent(active.id_ext)}` : ''}`;

  const calibreText = active?._dims?.calibre 
    ? `${active._dims.calibre}${active._dims.puente ? `□${active._dims.puente}` : ' mm'}`
    : null;

  return (
    <div
      className="card-product group bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#0F0F0F] transition-all duration-300 flex flex-col justify-between rounded-none"
      style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
    >
      {/* 1. ZONA DE IMAGEN */}
      <Link
        href={productHref}
        className="relative aspect-4/3 bg-[#F4F2ED] flex items-center justify-center p-6 overflow-hidden cursor-pointer block border-b border-[#E6E2DD]"
      >
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

        <div className="relative w-full h-full flex items-center justify-center">
          <Image
            src={mainImgSrc}
            alt={`${active?.marca || ''} ${active?.modelo || ''}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-contain p-4 mix-blend-multiply group-hover:scale-105 transition-transform duration-500 ease-out"
            priority={idx < 3}
          />
        </div>

        {/* Botón flotante para compra rápida por matriz si tiene variantes */}
        {onQuickAdd && (
          <div className="absolute bottom-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickAdd(variants);
              }}
              className="bg-[#0F0F0F] hover:bg-[#262626] text-white p-2.5 shadow-md flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold border border-[#0F0F0F] cursor-pointer"
              title="Abrir matriz rápida de compra"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#9E8256]" />
              <span className="hidden sm:inline">Matriz Rápida</span>
            </button>
          </div>
        )}
      </Link>

      {/* 2. ZONA DE INFORMACIÓN Y SELECCIÓN */}
      <div className="p-5 flex flex-col justify-between flex-1 gap-4">
        <div>
          <div className="flex justify-between items-baseline gap-2">
            <Link
              href={productHref}
              className="font-serif text-lg text-[#0F0F0F] group-hover:text-[#9E8256] transition-colors truncate block"
              title={active?.modelo}
            >
              {active?.modelo || 'Modelo'}
            </Link>
            <span className="text-[10px] font-mono text-[#787670] shrink-0 uppercase">
              {active?.id_ext}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[#5C5A55] truncate">
              {active?.color || active?.codigo_color || 'Estándar'}
            </span>
            <span className="text-[10px] text-[#D5D0C8]">/</span>
            <span className="text-[10px] uppercase tracking-wider text-[#787670] font-mono">
              COL {active?.codigo_color || 'N/A'}
            </span>
            {active?.material && (
              <span className="text-[10px] uppercase tracking-wider text-[#5C5A55]">
                {materialLabel}
              </span>
            )}
          </div>

          {/* SELECTOR RÁPIDO DE VARIANTES */}
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

        {/* MARGEN RETAIL SUGERIDO PARA ÓPTICAS VERIFICADAS */}
        {hasValidPrice && retail.pvpSugerido > 0 && (
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
          {hasValidPrice ? (
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
            {hasValidPrice && (
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
