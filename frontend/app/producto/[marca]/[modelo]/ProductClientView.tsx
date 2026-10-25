'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
  const { isLoggedIn } = useAuth();
  const cart = useCartStore((state) => state.cart);
  const addToCart = useCartStore((state) => state.addToCart);
  const addRecentItem = useRecentStore((state) => state.addRecentItem);

  const [b2bVariants, setB2bVariants] = useState<EnrichedMarco[]>(variants);
  const [activeVariant, setActiveVariant] = useState<EnrichedMarco>(baseProduct);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [stockWarning, setStockWarning] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const variantIdsKey = useMemo(() => {
    return (variants || []).map((v) => v.id_ext).filter(Boolean).sort().join(',');
  }, [variants]);

  useEffect(() => {
    setB2bVariants(variants);
    setActiveVariant(baseProduct);

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
  }, [variantIdsKey, isLoggedIn]);

  const currentImages = useMemo(() => {
    const list = [activeVariant.imagen_principal].filter(Boolean) as string[];
    if (activeVariant.imagenes_secundarias) {
      list.push(activeVariant.imagenes_secundarias);
    }
    return list;
  }, [activeVariant.imagen_principal, activeVariant.imagenes_secundarias]);

  const currentImageUrl = currentImages[activeImageIndex] || currentImages[0];

  useEffect(() => {
    if (baseProduct) {
      addRecentItem(baseProduct);
    }
  }, [baseProduct?.id_ext, addRecentItem]);

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
          <div className="aspect-[4/3] bg-[#FFFFFF] rounded-2xl border border-[#E5E4DF] flex items-center justify-center p-8 sm:p-12 relative overflow-hidden group shadow-sm">
            {currentImageUrl ? (
              <Image 
                unoptimized
                src={currentImageUrl} 
                alt={`${activeVariant.marca} ${activeVariant.modelo}`}
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-contain p-6 sm:p-10 transition-transform duration-500 group-hover:scale-105"
                priority
              />
            ) : (
              <div className="text-[#888888] text-xs">Sin fotografía disponible</div>
            )}
            
            <div className="absolute top-4 left-4 bg-[#F7F6F2] border border-[#E5E4DF] px-3 py-1 rounded-full text-[11px] font-medium text-[#111111]">
              {activeVariant.color || 'Color Único'}
            </div>
          </div>

          {/* Thumbnails si existen varias tomas */}
          {currentImages.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {currentImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative w-20 h-20 bg-[#FFFFFF] rounded-xl border overflow-hidden flex-shrink-0 transition-all ${
                    idx === activeImageIndex 
                      ? 'border-[#B89768] ring-2 ring-[#B89768]/20' 
                      : 'border-[#E5E4DF] opacity-70 hover:opacity-100'
                  }`}
                >
                  <Image unoptimized src={img} alt="Vista" fill sizes="80px" className="object-contain p-2" />
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
                {variants.length} {variants.length === 1 ? 'color' : 'colores'}
              </span>
            </div>
            
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
                  {b2bVariants.map((v) => {
                    const maxStock = getValidStock(v.stock);
                    const inCart = cart.find(item => getProductCartKey(item.producto) === v.id_ext)?.cantidad || 0;
                    const remainingStock = Math.max(0, maxStock - inCart);
                    const outOfStock = maxStock <= 0;
                    const isMaxInCart = !outOfStock && remainingStock <= 0;

                    return (
                      <div 
                        key={v.id_ext} 
                        className={`grid grid-cols-1 sm:grid-cols-12 gap-3 items-center bg-[#FFFFFF] p-3 rounded-xl border transition-all ${
                          outOfStock 
                            ? 'border-[#E5E4DF] opacity-50 bg-[#F9F9F8]' 
                            : isMaxInCart 
                            ? 'border-[#B89768]/60 bg-[#FDFBF7]' 
                            : 'border-[#E5E4DF] hover:border-[#B89768]/50'
                        }`}
                      >
                        <div className="col-span-1 sm:col-span-5 flex items-center gap-2.5">
                          {v.codigo_color && (
                            <div className="w-7 h-7 rounded-md bg-[#F7F6F2] border border-[#E5E4DF] flex items-center justify-center text-[10px] font-mono font-bold text-[#666666]">
                              {v.codigo_color}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-xs text-[#111111]">{v.color || 'Estándar'}</p>
                            <p className="text-[10px] text-[#888888] font-mono">SKU: {v.id_ext}</p>
                          </div>
                        </div>
                        
                        <div className="col-span-1 sm:col-span-3 text-left sm:text-center">
                          <span className="sm:hidden text-xs text-[#888888] mr-2">Precio:</span>
                          <span className="font-mono font-bold text-[#111111] text-sm">
                            {typeof v.precio_neto_clp === 'number' 
                              ? `$${v.precio_neto_clp.toLocaleString('es-CL')}` 
                              : 'Cotizar'}
                          </span>
                        </div>
                        
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
                        
                        <div className="col-span-1 sm:col-span-2 flex justify-start sm:justify-center">
                          <input 
                            type="number"
                            min="0"
                            max={remainingStock}
                            disabled={outOfStock || isMaxInCart}
                            value={quantities[v.id_ext] || ''}
                            placeholder="0"
                            onChange={(e) => handleQuantityChange(v.id_ext, e.target.value, maxStock, remainingStock)}
                            className="w-16 bg-[#FFFFFF] border border-[#D0CEBE] rounded-lg py-1 px-2 text-center text-[#111111] font-mono font-bold text-xs focus:outline-none focus:border-[#B89768] disabled:opacity-40"
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
