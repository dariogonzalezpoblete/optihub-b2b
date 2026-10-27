'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useCartStore, getValidStock, getProductCartKey } from '@/store/useCartStore';
import { useRecentStore } from '@/store/useRecentStore';
import {
  MARCOS_B2B_COMMERCIAL_OVERLAY_COLUMNS,
  type EnrichedMarco,
} from '@/lib/catalog/types';
import { 
  ArrowLeft, Lock, ShoppingBag, AlertCircle, Check, ShieldCheck, Truck, Sparkles
} from 'lucide-react';

interface Props {
  variants: EnrichedMarco[];
  baseProduct: EnrichedMarco;
}

export default function ProductClientView({ variants, baseProduct }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skuFromUrl = searchParams?.get('sku');
  const { isLoggedIn } = useAuth();
  const cart = useCartStore((state) => state.cart);
  const addToCart = useCartStore((state) => state.addToCart);
  const addRecentItem = useRecentStore((state) => state.addRecentItem);

  const [b2bVariants, setB2bVariants] = useState<EnrichedMarco[]>(variants);
  const [activeVariant, setActiveVariant] = useState<EnrichedMarco>(baseProduct);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [stockWarning, setStockWarning] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const variantIdsKey = useMemo(() => {
    return (variants || []).map((v) => v.id_ext).filter(Boolean).sort().join(',');
  }, [variants]);

  useEffect(() => {
    setB2bVariants(variants);
    const targetInitial = (skuFromUrl && variants?.find(v => v.id_ext === skuFromUrl)) || baseProduct;
    setActiveVariant(targetInitial);

    if (!isLoggedIn || !variants || variants.length === 0) {
      return;
    }

    const ids = Array.from(new Set(variants.map((v) => v.id_ext).filter(Boolean)));
    if (ids.length === 0) return;

    let cancelled = false;
    supabase
      .from('marcos')
      .select(MARCOS_B2B_COMMERCIAL_OVERLAY_COLUMNS)
      .in('id_ext', ids)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const b2bMap = new Map(
          (data as unknown as Array<{ id_ext: string; precio_neto_clp?: number; precio_bruto_clp?: number; stock?: number }>).map(
            (row) => [row.id_ext, row]
          )
        );
        setB2bVariants((prev) =>
          prev.map((v) => {
            const b2b = b2bMap.get(v.id_ext);
            return b2b ? { ...v, ...b2b } : v;
          })
        );
        setActiveVariant((prev) => {
          const b2b = b2bMap.get(prev.id_ext);
          return b2b ? { ...prev, ...b2b } : prev;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [variantIdsKey, isLoggedIn, baseProduct]);

  const handleSelectVariant = (variant: EnrichedMarco) => {
    if (variant.id_ext === activeVariant.id_ext) return;
    setActiveVariant(variant);
    setActiveImageIndex(0);
    setImgLoaded(false);
  };

  const currentImages = useMemo(() => {
    if (!activeVariant) return [];
    const list: string[] = [];
    if (activeVariant.imagen_principal && activeVariant.imagen_principal.trim()) {
      list.push(activeVariant.imagen_principal.trim());
    }
    if (activeVariant.imagenes_secundarias && activeVariant.imagenes_secundarias.trim()) {
      const parts = activeVariant.imagenes_secundarias
        .split(/[,;]/)
        .map(s => s.trim())
        .filter(Boolean);
      list.push(...parts);
    }
    return Array.from(new Set(list));
  }, [activeVariant?.imagen_principal, activeVariant?.imagenes_secundarias]);

  const currentImageUrl = currentImages[activeImageIndex] || currentImages[0] || activeVariant?.imagen_principal;

  useEffect(() => {
    if (baseProduct) {
      addRecentItem(baseProduct);
    }
  }, [baseProduct, addRecentItem]);

  const handleQuantityChange = (id_ext: string, val: string, maxStock: number, remainingStock: number) => {
    let num = parseInt(val, 10);
    if (isNaN(num) || num < 0) num = 0;
    if (num > remainingStock) {
      num = remainingStock;
      setStockWarning(`Stock máximo disponible: ${maxStock} ${maxStock === 1 ? 'unidad' : 'unidades'}.`);
    } else {
      setStockWarning('');
    }
    setQuantities(prev => ({ ...prev, [id_ext]: num }));
  };

  const getTotalSelected = () => {
    return Object.values(quantities).reduce((acc, curr) => acc + curr, 0);
  };

  const handleAddAllToCart = () => {
    if (!isLoggedIn) return;
    setIsAdding(true);
    setStockWarning('');
    setSuccessMsg('');
    
    let addedCount = 0;
    let warningMsg = '';

    Object.entries(quantities).forEach(([id_ext, qty]) => {
      if (qty > 0) {
        const variant = b2bVariants.find(v => v.id_ext === id_ext);
        if (variant) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _k, _search, _dims, ...base } = variant;
          const res = addToCart(base, qty);
          if (res.message) {
            warningMsg = res.message;
          }
          addedCount += res.added;
        }
      }
    });

    if (warningMsg) {
      setStockWarning(warningMsg);
    } else if (addedCount > 0) {
      setSuccessMsg(`✓ ${addedCount} unidades añadidas a su pedido mayorista.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    }

    setTimeout(() => {
      setIsAdding(false);
      setQuantities({});
    }, 600);
  };

  const dims = baseProduct._dims;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Barra de navegación superior sutil */}
      <div className="flex items-center justify-between pb-6 mb-8 border-b border-[#E5E4DF]">
        <button 
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#888888] hover:text-[#111111] transition uppercase tracking-wider"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al catálogo
        </button>
        <div className="text-xs text-[#888888] font-mono tracking-wider">
          {baseProduct.marca} • {baseProduct.modelo}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
        
        {/* Columna Izquierda: Galería de Imágenes & Ficha Técnica */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Contenedor Principal de Imagen con Transición Suave */}
          <div className="aspect-[4/3] bg-[#FFFFFF] rounded-2xl border border-[#E5E4DF] flex items-center justify-center p-8 sm:p-12 relative overflow-hidden group shadow-sm">
            {currentImageUrl ? (
              <Image 
                unoptimized
                key={`${activeVariant?.id_ext || 'main'}-${activeImageIndex}-${currentImageUrl}`}
                src={currentImageUrl} 
                alt={`${activeVariant?.marca || ''} ${activeVariant?.modelo || ''} ${activeVariant?.color || ''}`.trim() || 'Fotografía de producto'}
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-contain p-6 sm:p-10 transition-all duration-300 group-hover:scale-105"
                priority
                loading="eager"
              />
            ) : (
              <div className="text-[#888888] text-xs">Sin fotografía disponible</div>
            )}
            
            {/* Badge flotante de Color en la foto */}
            <div className="absolute top-4 left-4 z-10 bg-[#FAF9F6]/95 backdrop-blur-xs border border-[#E5E4DF] px-3.5 py-1.5 rounded-full text-[11px] font-medium text-[#111111] shadow-2xs">
              {activeVariant?.color || activeVariant?.codigo_color || 'Color Único'}
            </div>
          </div>

          {/* Thumbnails si existen varias tomas / ángulos (Eager Loading para carga instantánea) */}
          {currentImages.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
              {currentImages.map((img, idx) => (
                <button
                  key={`${activeVariant?.id_ext || 'angle'}-thumb-${idx}`}
                  type="button"
                  onClick={() => {
                    if (idx !== activeImageIndex) {
                      setActiveImageIndex(idx);
                    }
                  }}
                  className={`relative w-20 h-20 bg-[#FFFFFF] rounded-xl border overflow-hidden flex-shrink-0 transition-all flex items-center justify-center ${
                    idx === activeImageIndex 
                      ? 'border-[#B89768] ring-2 ring-[#B89768]/30 shadow-xs scale-102' 
                      : 'border-[#E5E4DF] opacity-70 hover:opacity-100 hover:border-[#82807A]'
                  }`}
                  title={`Vista ${idx + 1}`}
                >
                  <img 
                    src={img} 
                    alt={`Vista ${idx + 1}`} 
                    loading="eager"
                    decoding="async"
                    className="w-full h-full object-contain p-2"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Ficha Técnica: Calibres y Dimensiones en Monospace */}
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E4DF] p-6 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#B89768] mb-4">
              Especificaciones de Calibre y Montura
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-[#F7F6F2] rounded-xl p-3 text-center border border-[#E5E4DF]/60">
                <span className="text-[10px] uppercase tracking-wider text-[#888888] font-semibold block mb-1">Calibre</span>
                <span className="font-mono text-base font-bold text-[#111111]">{dims?.calibre || '-'} <span className="text-xs font-normal text-[#888888]">mm</span></span>
              </div>
              <div className="bg-[#F7F6F2] rounded-xl p-3 text-center border border-[#E5E4DF]/60">
                <span className="text-[10px] uppercase tracking-wider text-[#888888] font-semibold block mb-1">Puente</span>
                <span className="font-mono text-base font-bold text-[#111111]">{dims?.puente || '-'} <span className="text-xs font-normal text-[#888888]">mm</span></span>
              </div>
              <div className="bg-[#F7F6F2] rounded-xl p-3 text-center border border-[#E5E4DF]/60">
                <span className="text-[10px] uppercase tracking-wider text-[#888888] font-semibold block mb-1">Varilla</span>
                <span className="font-mono text-base font-bold text-[#111111]">{dims?.varilla || '-'} <span className="text-xs font-normal text-[#888888]">mm</span></span>
              </div>
              <div className="bg-[#F7F6F2] rounded-xl p-3 text-center border border-[#E5E4DF]/60">
                <span className="text-[10px] uppercase tracking-wider text-[#888888] font-semibold block mb-1">Material</span>
                <span className="text-xs font-semibold text-[#111111] truncate block" title={baseProduct.material}>{baseProduct.material || 'Acetato / Metal'}</span>
              </div>
            </div>

            {/* Garantías de importación */}
            <div className="mt-6 pt-5 border-t border-[#E5E4DF] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-[#666666]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#B89768] shrink-0" />
                <span>100% Original Garantizado</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#B89768] shrink-0" />
                <span>Despacho 10-15 Días Hábiles</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#B89768] shrink-0" />
                <span>Facturación Electrónica SII</span>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Información B2B & Matriz de Variantes */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E4DF] p-6 sm:p-8 shadow-sm">
            <span className="inline-block bg-[#F7F3EB] border border-[#B89768]/40 text-[#9E7D4F] text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-widest mb-3">
              {baseProduct.marca}
            </span>
            <h1 className="font-editorial font-serif text-3xl sm:text-4xl text-[#111111] font-semibold tracking-tight">
              {baseProduct.modelo}
            </h1>
            <p className="text-[#666666] text-xs sm:text-sm mt-3 leading-relaxed">
              Armazón óptico original importado directamente desde distribuidor oficial en EE.UU. para ópticas autorizadas en Chile.
            </p>
          </div>

          {/* Grilla B2B de Variantes */}
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E4DF] overflow-hidden shadow-sm flex flex-col">
            <div className="bg-[#FDFBF7] px-6 py-4 border-b border-[#E5E4DF] flex items-center justify-between">
              <h3 className="font-semibold text-xs tracking-wider uppercase text-[#111111] flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#B89768]" />
                Variantes y Stock Mayorista
              </h3>
              <span className="text-[11px] text-[#888888] font-mono">
                {b2bVariants.length} {b2bVariants.length === 1 ? 'color' : 'colores'}
              </span>
            </div>

            {/* SELECTOR RÁPIDO DE COLORES (SWATCHES ESTILO E-COMMERCE GRANDE) */}
            {b2bVariants.length > 1 && (
              <div className="p-5 sm:p-6 pb-4 border-b border-[#E5E4DF] bg-[#FAF9F6]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-[#111111] uppercase tracking-wider">
                    Color seleccionado:{' '}
                    <span className="font-bold text-[#B89768] normal-case">
                      {activeVariant.color || activeVariant.codigo_color || 'Estándar'}
                    </span>
                  </span>
                  <span className="text-[11px] text-[#888888] font-mono">
                    COL {activeVariant.codigo_color || 'N/A'} • SKU: {activeVariant.id_ext}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {b2bVariants.map((v, i) => {
                    const isSelected = v.id_ext === activeVariant?.id_ext;
                    const swatchSrc = v.imagen_principal && v.imagen_principal.trim() ? v.imagen_principal.trim() : '/placeholder.png';
                    return (
                      <button
                        key={`swatch-detail-${v.id_ext || i}`}
                        type="button"
                        onClick={() => handleSelectVariant(v)}
                        className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all text-left ${
                          isSelected
                            ? 'border-[#B89768] bg-[#FDFBF7] ring-1 ring-[#B89768]/50 shadow-xs scale-[1.02]'
                            : 'border-[#E5E4DF] bg-[#FFFFFF] hover:border-[#B89768]/50 hover:bg-[#FAF9F6]'
                        }`}
                        title={`${v.color || v.codigo_color || 'Variante'} (SKU: ${v.id_ext})`}
                      >
                        {/* Miniatura del color con carga prioritaria */}
                        <div className={`relative w-8 h-8 rounded-lg overflow-hidden bg-[#FAF9F6] border flex-shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-[#B89768]' : 'border-[#E5E4DF]'
                        }`}>
                          <img 
                            src={swatchSrc} 
                            alt={v.color || v.codigo_color || 'Variante'} 
                            loading="eager"
                            decoding="async"
                            className="w-full h-full object-contain p-0.5"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                            }}
                          />
                        </div>

                        <div>
                          <span className={`block text-xs font-bold leading-tight ${isSelected ? 'text-[#111111]' : 'text-[#555555]'}`}>
                            {v.color || v.codigo_color || 'Variante'}
                          </span>
                          <span className="block text-[10px] text-[#888888] font-mono leading-none mt-0.5">
                            {v.codigo_color ? `COL ${v.codigo_color}` : v.id_ext}
                          </span>
                        </div>

                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#B89768] ml-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {!isLoggedIn ? (
              <div className="p-8 sm:p-10 text-center flex-1 flex flex-col justify-center items-center">
                <div className="w-12 h-12 rounded-full bg-[#F7F6F2] border border-[#E5E4DF] flex items-center justify-center mb-4">
                  <Lock className="w-5 h-5 text-[#888888]" />
                </div>
                <h4 className="font-editorial font-serif text-xl text-[#111111] mb-2">
                  Precios y Stock B2B Reservados
                </h4>
                <p className="text-xs text-[#666666] max-w-sm mb-6 leading-relaxed">
                  Para visualizar precios netos por volumen y disponibilidad de importación en origen, inicie sesión con su cuenta de óptica registrada.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                  <Link 
                    href="/login" 
                    className="flex-1 bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] text-xs font-semibold py-3 px-4 rounded-xl transition text-center tracking-wide"
                  >
                    Iniciar Sesión
                  </Link>
                  <Link 
                    href="/registro" 
                    className="flex-1 bg-[#FFFFFF] hover:bg-[#F7F6F2] text-[#111111] text-xs font-semibold py-3 px-4 rounded-xl border border-[#E5E4DF] transition text-center tracking-wide"
                  >
                    Registrar Óptica
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6 flex flex-col flex-1">
                <div className="hidden sm:grid grid-cols-12 gap-3 text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-3 px-2">
                  <div className="col-span-5">Color / Acabado</div>
                  <div className="col-span-3 text-center">Precio Neto</div>
                  <div className="col-span-2 text-center">Stock</div>
                  <div className="col-span-2 text-center">Cantidad</div>
                </div>
                
                <div className="space-y-2.5 mb-6">
                  {b2bVariants.map((v, i) => {
                    const maxStock = getValidStock(v.stock);
                    const inCart = cart.find(item => getProductCartKey(item.producto) === v.id_ext)?.cantidad || 0;
                    const remainingStock = Math.max(0, maxStock - inCart);
                    const outOfStock = maxStock <= 0;
                    const isMaxInCart = !outOfStock && remainingStock <= 0;
                    const isSelected = v.id_ext === activeVariant?.id_ext;
                    const rowImgSrc = v.imagen_principal && v.imagen_principal.trim() ? v.imagen_principal.trim() : '/placeholder.png';

                    return (
                      <div 
                        key={v.id_ext || `row-${i}`} 
                        onClick={() => handleSelectVariant(v)}
                        className={`grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#B89768] bg-[#FDFBF7] ring-1 ring-[#B89768]/40 shadow-xs'
                            : outOfStock 
                            ? 'border-[#E5E4DF] opacity-50 bg-[#F9F9F8]' 
                            : isMaxInCart 
                            ? 'border-[#B89768]/40 bg-[#FAF9F6]' 
                            : 'border-[#E5E4DF] bg-[#FFFFFF] hover:border-[#B89768]/50 hover:bg-[#FAF9F6]'
                        }`}
                      >
                        {/* Miniatura + Color / Acabado */}
                        <div className="col-span-1 sm:col-span-5 flex items-center gap-3">
                          <div className={`relative w-10 h-10 rounded-lg overflow-hidden bg-[#FFFFFF] border flex-shrink-0 flex items-center justify-center ${
                            isSelected ? 'border-[#B89768]' : 'border-[#E5E4DF]'
                          }`}>
                            <img 
                              src={rowImgSrc} 
                              alt={v.color || v.codigo_color || 'Variante'} 
                              loading="eager"
                              decoding="async"
                              className="w-full h-full object-contain p-0.5"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                              }}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-xs text-[#111111] truncate">{v.color || 'Estándar'}</p>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-[#B89768] text-white px-1.5 py-0.2 rounded-full font-semibold uppercase tracking-wider shrink-0">
                                  <Check className="w-2.5 h-2.5" /> Viendo
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#888888] font-mono truncate">
                              {v.codigo_color ? `COL ${v.codigo_color} • ` : ''}SKU: {v.id_ext}
                            </p>
                          </div>
                        </div>
                        
                        {/* Precio Neto */}
                        <div className="col-span-1 sm:col-span-3 text-left sm:text-center">
                          <span className="sm:hidden text-xs text-[#888888] mr-2">Precio:</span>
                          <span className="font-mono font-bold text-[#111111] text-sm">
                            {typeof v.precio_neto_clp === 'number' 
                              ? `$${v.precio_neto_clp.toLocaleString('es-CL')}` 
                              : 'Cotizar'}
                          </span>
                        </div>
                        
                        {/* Stock */}
                        <div className="col-span-1 sm:col-span-2 text-left sm:text-center">
                          <span className="sm:hidden text-xs text-[#888888] mr-2">Stock en origen:</span>
                          {outOfStock ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                              Agotado
                            </span>
                          ) : isMaxInCart ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200" title={`Ya tiene ${inCart} en el carrito`}>
                              Máx ({maxStock})
                            </span>
                          ) : inCart > 0 ? (
                            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[#F4EFE6] text-[#9E7D4F] border border-[#B89768]/30">
                              {remainingStock} un.
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[#F7F6F2] text-[#111111] border border-[#E5E4DF]">
                              {maxStock >= 50 ? '50+ un.' : `${maxStock} un.`}
                            </span>
                          )}
                        </div>
                        
                        {/* Cantidad Input: stopPropagation para no cambiar de variante al escribir */}
                        <div 
                          className="col-span-1 sm:col-span-2 flex justify-start sm:justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input 
                            type="number"
                            min="0"
                            max={remainingStock}
                            disabled={outOfStock || isMaxInCart}
                            value={quantities[v.id_ext] || ''}
                            placeholder="0"
                            onChange={(e) => handleQuantityChange(v.id_ext, e.target.value, maxStock, remainingStock)}
                            className="w-16 bg-[#FFFFFF] border border-[#D0CEBE] rounded-lg py-1 px-2 text-center text-[#111111] font-mono font-bold text-xs focus:outline-none focus:border-[#B89768] disabled:opacity-40 shadow-2xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {stockWarning && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>{stockWarning}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <div className="mt-auto pt-5 border-t border-[#E5E4DF] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[#888888] font-semibold uppercase tracking-wider mb-0.5">Total Seleccionado</p>
                    <p className="font-mono text-xl font-bold text-[#111111]">{getTotalSelected()} <span className="text-xs font-normal text-[#888888]">unidades</span></p>
                  </div>
                  
                  <button 
                    onClick={handleAddAllToCart}
                    disabled={getTotalSelected() === 0 || isAdding}
                    className="bg-[#111111] hover:bg-[#222222] disabled:bg-[#E5E4DF] disabled:text-[#888888] text-[#FFFFFF] text-xs font-semibold uppercase tracking-wider px-6 py-3.5 rounded-xl transition shadow-md disabled:shadow-none flex items-center gap-2"
                  >
                    {isAdding ? (
                      'Añadiendo...'
                    ) : (
                      <>
                        <ShoppingBag className="w-4 h-4 text-[#B89768]" />
                        Añadir al Pedido
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
