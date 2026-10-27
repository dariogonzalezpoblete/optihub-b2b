'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useCartStore, getValidStock, getProductCartKey } from '@/store/useCartStore';
import type { EnrichedMarco } from '@/lib/catalog/types';
import { X, Lock, ShoppingBag, Ruler, AlertCircle, TrendingUp, ShieldCheck, Truck, Check } from 'lucide-react';
import { getRotationBadge, calculateRetailProjection } from '@/lib/catalog/brandCategories';

interface Props {
  variants: EnrichedMarco[];
  isOpen: boolean;
  onClose: () => void;
  initialVariantId?: string | null;
}

export default function QuickViewModal({ variants, isOpen, onClose, initialVariantId }: Props) {
  const { isLoggedIn } = useAuth();
  const cart = useCartStore((state) => state.cart);
  const addToCart = useCartStore((state) => state.addToCart);

  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const activeVariant = variants.find(v => v.id_ext === activeVariantId) || variants[0];
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [stockWarning, setStockWarning] = useState<string>('');

  // Initialize variant and reset state on modal open
  useEffect(() => {
    if (isOpen && variants.length > 0) {
      const initialId = initialVariantId && variants.some(v => v.id_ext === initialVariantId)
        ? initialVariantId
        : variants[0].id_ext;
      setActiveVariantId(initialId);
      setActiveImageIndex(0);
      setImgLoaded(false);
      setQuantities({});
      setStockWarning('');
      document.body.style.overflow = 'hidden'; // Lock scroll
    } else {
      document.body.style.overflow = '';
      setStockWarning('');
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, variants, initialVariantId]);

  if (!isOpen || variants.length === 0) return null;

  const baseProduct = variants[0];
  const dims = baseProduct._dims;

  const handleSelectVariant = (id: string) => {
    if (id === activeVariantId) return;
    setActiveVariantId(id);
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
  }, [activeVariant]);

  const currentImageUrl = currentImages[activeImageIndex] || currentImages[0] || activeVariant?.imagen_principal;

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
    
    let addedCount = 0;
    let warningMsg = '';

    Object.entries(quantities).forEach(([id_ext, qty]) => {
      if (qty > 0) {
        const variant = variants.find(v => v.id_ext === id_ext);
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
    }

    setTimeout(() => {
      setIsAdding(false);
      if (!warningMsg) {
        onClose();
      }
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-[#111111]/70 backdrop-blur-xs"
        onClick={onClose}
      />
      
      <div className="relative bg-[#FFFFFF] border border-[#E5E4DF] shadow-2xl rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col md:flex-row animate-slide-up text-[#111111]">
        <button 
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute top-4 right-4 z-20 w-9 h-9 bg-[#FAF9F6] hover:bg-[#FFFFFF] border border-[#E5E4DF] rounded-full flex items-center justify-center text-[#575551] transition shadow-xs"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Galería Rápida (Columna Izquierda) */}
        <div className="w-full md:w-5/12 bg-[#FAF9F6] p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#E5E4DF] overflow-y-auto">
          <div className="flex flex-col items-center w-full">
            {/* Imagen Principal con Transición Suave */}
            <div className="aspect-[4/3] w-full flex items-center justify-center mb-4 relative group bg-[#FFFFFF] rounded-2xl border border-[#E5E4DF] p-4 overflow-hidden shadow-2xs">
              {!imgLoaded && currentImageUrl && (
                <div className="absolute inset-4 bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl animate-pulse flex items-center justify-center z-0">
                  <span className="text-[10px] text-[#82807A] font-tech uppercase tracking-wider">Cargando foto...</span>
                </div>
              )}

              {currentImageUrl ? (
                <Image 
                  unoptimized 
                  key={`${activeVariant.id_ext}-${activeImageIndex}-${currentImageUrl}`}
                  src={currentImageUrl} 
                  alt={`${activeVariant.marca} ${activeVariant.modelo} ${activeVariant.color || ''}`} 
                  fill
                  priority
                  loading="eager"
                  sizes="(max-width: 768px) 100vw, 40vw"
                  className={`object-contain p-4 transition-all duration-300 group-hover:scale-105 ${
                    imgLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  onLoad={() => setImgLoaded(true)}
                />
              ) : (
                <div className="text-[#82807A] text-xs">Sin fotografía disponible</div>
              )}

              {/* Badge flotante de Color en la foto */}
              <div className="absolute top-3 left-3 z-10 bg-[#FAF9F6]/95 backdrop-blur-xs border border-[#E5E4DF] px-3 py-1 rounded-full text-[11px] font-medium text-[#111111] shadow-2xs">
                {activeVariant.color || activeVariant.codigo_color || 'Color Único'}
              </div>
            </div>

            {/* Selector de Miniaturas de Ángulos / Vistas (Eager Loading para carga instantánea) */}
            {currentImages.length > 1 && (
              <div className="flex gap-2 mb-3 overflow-x-auto max-w-full pb-1 scrollbar-thin">
                {currentImages.map((img, idx) => (
                  <button
                    key={`${activeVariant.id_ext}-view-${idx}`}
                    type="button"
                    onClick={() => {
                      if (idx !== activeImageIndex) {
                        setActiveImageIndex(idx);
                        setImgLoaded(false);
                      }
                    }}
                    className={`relative w-14 h-14 rounded-xl border overflow-hidden flex-shrink-0 transition-all bg-[#FFFFFF] ${
                      idx === activeImageIndex 
                        ? 'border-[#B89768] ring-2 ring-[#B89768]/30 shadow-xs scale-102' 
                        : 'border-[#E5E4DF] opacity-70 hover:opacity-100 hover:border-[#82807A]'
                    }`}
                    title={`Vista ${idx + 1}`}
                  >
                    <Image 
                      unoptimized 
                      priority
                      loading="eager"
                      src={img} 
                      alt={`Vista ${idx + 1}`} 
                      fill 
                      sizes="56px" 
                      className="object-contain p-1" 
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-[#E5E4DF] space-y-2.5">
            <div className="flex items-center gap-2 text-[11px] text-[#9E7D4F] font-medium bg-[#F7F3EB] border border-[#B89768]/30 p-2.5 rounded-xl">
              <ShieldCheck className="w-4 h-4 shrink-0 text-[#B89768]" />
              <span>100% Original: Con estuche de marca, paño y Factura SII</span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#575551]">
              <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-[#82807A]" /> Entrega: 10 a 15 días hábiles</span>
              <Link 
                href={`/producto/${encodeURIComponent(baseProduct.marca)}/${encodeURIComponent(baseProduct.modelo)}`} 
                className="text-[#111111] hover:text-[#B89768] hover:underline font-bold"
              >
                Ficha completa →
              </Link>
            </div>
          </div>
        </div>

        {/* Información y Matriz de Variantes (Columna Derecha) */}
        <div className="w-full md:w-7/12 flex flex-col max-h-[92vh] overflow-y-auto bg-[#FFFFFF]">
          <div className="p-6 md:p-8 border-b border-[#E5E4DF]">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="badge-brand">
                {baseProduct.marca}
              </span>
              {getRotationBadge(baseProduct.marca) && (
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full border border-[#E5E4DF] bg-[#FAF9F6] text-[#575551]">
                  <span>{getRotationBadge(baseProduct.marca)?.icon}</span>
                  <span>{getRotationBadge(baseProduct.marca)?.label}</span>
                </span>
              )}
            </div>

            <h2 className="font-editorial text-3xl font-semibold text-[#111111] mt-2">{baseProduct.modelo}</h2>
            <p className="text-[#575551] text-xs mt-1">Material: {baseProduct.material || 'Estándar'} • Género: {baseProduct.genero || 'Unisex'}</p>

            {/* Calculadora de Margen Retail en Modal para la variante activa */}
            {isLoggedIn && activeVariant.precio_neto_clp && (
              <div className="mt-4 bg-[#FAF9F6] rounded-2xl p-3.5 border border-[#E5E4DF] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-[#82807A] block text-[10px] uppercase font-bold tracking-wider">Costo Mayorista</span>
                  <span className="text-[#111111] font-bold text-base font-tech">
                    ${activeVariant.precio_neto_clp.toLocaleString('es-CL')} CLP Neto
                  </span>
                </div>
                <div>
                  <span className="text-[#82807A] block text-[10px] uppercase font-bold tracking-wider">PVP Sugerido Óptica</span>
                  <span className="text-[#111111] font-bold font-tech">
                    ${calculateRetailProjection(activeVariant.precio_neto_clp).pvpSugerido.toLocaleString('es-CL')} CLP
                  </span>
                </div>
                <div className="bg-[#F7F3EB] border border-[#B89768]/30 px-3 py-1.5 rounded-xl text-[#9E7D4F] font-bold text-[11px] flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#B89768]" />
                  <span>Margen ~{calculateRetailProjection(activeVariant.precio_neto_clp).margenPorcentaje}% (+${calculateRetailProjection(activeVariant.precio_neto_clp).gananciaPorUnidad.toLocaleString('es-CL')}/un)</span>
                </div>
              </div>
            )}

            {/* Dimensiones */}
            {dims && (
              <div className="flex items-center gap-4 mt-3 bg-[#FAF9F6] p-2.5 rounded-xl border border-[#E5E4DF] text-xs">
                <Ruler className="w-4 h-4 text-[#82807A]" />
                <span className="text-[#575551]">Calibre: <strong className="text-[#111111] font-tech">{dims.calibre} mm</strong></span>
                <span className="text-[#575551]">Puente: <strong className="text-[#111111] font-tech">{dims.puente} mm</strong></span>
                <span className="text-[#575551]">Varilla: <strong className="text-[#111111] font-tech">{dims.varilla} mm</strong></span>
              </div>
            )}
          </div>

          <div className="p-6 md:p-8 flex-1 bg-[#FFFFFF] flex flex-col">
            {/* SELECTOR RÁPIDO DE COLORES (SWATCHES ESTILO E-COMMERCE GRANDE) */}
            {variants.length > 1 && (
              <div className="mb-6 pb-5 border-b border-[#E5E4DF]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-[#111111] uppercase tracking-wider">
                    Color seleccionado:{' '}
                    <span className="font-bold text-[#B89768] normal-case">
                      {activeVariant.color || activeVariant.codigo_color || 'Estándar'}
                    </span>
                  </span>
                  <span className="text-[11px] text-[#82807A] font-tech">
                    {variants.length} acabados
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isSelected = v.id_ext === activeVariant.id_ext;
                    return (
                      <button
                        key={`swatch-${v.id_ext}`}
                        type="button"
                        onClick={() => handleSelectVariant(v.id_ext)}
                        className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all text-left ${
                          isSelected
                            ? 'border-[#B89768] bg-[#FDFBF7] ring-1 ring-[#B89768]/50 shadow-xs scale-[1.02]'
                            : 'border-[#E5E4DF] bg-[#FAF9F6] hover:border-[#B89768]/50 hover:bg-[#FFFFFF]'
                        }`}
                        title={`${v.color || v.codigo_color} (SKU: ${v.id_ext})`}
                      >
                        {/* Miniatura del color con carga prioritaria */}
                        <div className={`relative w-8 h-8 rounded-lg overflow-hidden bg-[#FFFFFF] border flex-shrink-0 ${
                          isSelected ? 'border-[#B89768]' : 'border-[#E5E4DF]'
                        }`}>
                          {v.imagen_principal ? (
                            <Image
                              unoptimized
                              priority
                              loading="eager"
                              src={v.imagen_principal}
                              alt={v.color || v.codigo_color || 'Variante'}
                              fill
                              sizes="32px"
                              className="object-contain p-0.5"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] font-mono font-bold text-[#82807A]">
                              {v.codigo_color || 'N/A'}
                            </div>
                          )}
                        </div>

                        <div className="pr-1">
                          <span className={`block text-xs font-bold leading-tight ${isSelected ? 'text-[#111111]' : 'text-[#575551]'}`}>
                            {v.color || v.codigo_color}
                          </span>
                          <span className="block text-[10px] text-[#82807A] font-tech leading-none mt-0.5">
                            {v.codigo_color ? `COL ${v.codigo_color}` : v.id_ext}
                          </span>
                        </div>

                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#B89768] ml-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <h3 className="font-editorial text-lg font-semibold text-[#111111] mb-4 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#B89768]" />
              Pedido Mayorista B2B (Stock en Origen)
            </h3>

            {!isLoggedIn ? (
               <div className="bg-[#FAF9F6] p-6 rounded-2xl border border-[#E5E4DF] text-center">
                 <Lock className="w-8 h-8 text-[#B89768] mx-auto mb-3" />
                 <p className="text-sm text-[#575551] mb-4">Inicia sesión para ver precios netos y disponibilidad en origen en tiempo real.</p>
                 <Link href="/login" className="btn-primary text-xs">Iniciar Sesión</Link>
               </div>
            ) : (
              <div className="flex flex-col flex-1">
                <div className="space-y-2.5 mb-6 max-h-[30vh] overflow-y-auto scrollbar-thin pr-2">
                  {variants.map(v => {
                    const maxStock = getValidStock(v.stock);
                    const inCart = cart.find(item => getProductCartKey(item.producto) === v.id_ext)?.cantidad || 0;
                    const remainingStock = Math.max(0, maxStock - inCart);
                    const isOut = maxStock <= 0;
                    const isMaxInCart = !isOut && remainingStock <= 0;
                    const isSelected = v.id_ext === activeVariant.id_ext;

                    return (
                      <div 
                        key={v.id_ext} 
                        onClick={() => handleSelectVariant(v.id_ext)}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-[#B89768] bg-[#FDFBF7] ring-1 ring-[#B89768]/40 shadow-xs' 
                            : isOut 
                            ? 'border-[#E5E4DF] bg-[#FAF9F6] opacity-50' 
                            : isMaxInCart 
                            ? 'border-[#B89768]/30 bg-[#FAF9F6]' 
                            : 'border-[#E5E4DF] bg-[#FAF9F6] hover:border-[#B89768]/50 hover:bg-[#FFFFFF]'
                        }`}
                      >
                        {/* Miniatura de la variante y textos */}
                        <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                          <div className={`relative w-10 h-10 rounded-lg overflow-hidden bg-[#FFFFFF] border flex-shrink-0 ${
                            isSelected ? 'border-[#B89768]' : 'border-[#E5E4DF]'
                          }`}>
                            {v.imagen_principal ? (
                              <Image
                                unoptimized
                                priority
                                loading="eager"
                                src={v.imagen_principal}
                                alt={v.color || v.codigo_color || 'Variante'}
                                fill
                                sizes="40px"
                                className="object-contain p-0.5"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[9px] font-mono font-bold text-[#82807A]">
                                {v.codigo_color || 'N/A'}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-[#111111] text-sm truncate">{v.color || v.codigo_color}</p>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-[#B89768] text-white px-1.5 py-0.2 rounded-full font-semibold uppercase tracking-wider shrink-0">
                                  <Check className="w-2.5 h-2.5" /> Viendo
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#82807A] font-tech truncate">SKU: {v.id_ext}</p>
                          </div>
                        </div>

                        {/* Precio y Disponibilidad */}
                        <div className="text-right mr-3 shrink-0 w-28">
                          <p className="font-bold text-[#111111] font-tech">${v.precio_neto_clp?.toLocaleString('es-CL')}</p>
                          {isOut ? (
                            <p className="text-[10px] text-[#A83232] font-semibold">Agotado en origen</p>
                          ) : isMaxInCart ? (
                            <p className="text-[10px] text-[#9E7D4F] font-semibold">Máx. en carrito ({maxStock})</p>
                          ) : inCart > 0 ? (
                            <p className="text-[10px] text-[#575551] font-tech">Disp: {remainingStock} ({inCart} en carrito)</p>
                          ) : (
                            <p className="text-[10px] text-[#82807A] font-tech">Stock: {maxStock >= 50 ? '50+' : maxStock}</p>
                          )}
                        </div>

                        {/* Input de Cantidad: stopPropagation para no disparar el cambio de variante al teclear */}
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                          <input 
                            type="number" 
                            min="0" 
                            max={remainingStock} 
                            disabled={isOut || isMaxInCart}
                            value={quantities[v.id_ext] || ''} 
                            placeholder="0"
                            onChange={(e) => handleQuantityChange(v.id_ext, e.target.value, maxStock, remainingStock)}
                            className="w-16 bg-[#FFFFFF] border border-[#E5E4DF] rounded-lg py-1.5 text-center text-[#111111] font-bold text-sm focus:border-[#B89768] outline-none disabled:opacity-50 shadow-2xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {stockWarning && (
                  <div className="mb-4 p-3 bg-[#FBF8F1] border border-[#EADBBE] rounded-xl text-[#8C6A2E] text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-[#B89768]" />
                    <span>{stockWarning}</span>
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-[#E5E4DF] pt-4">
                  <div>
                    <span className="text-[10px] text-[#82807A] uppercase tracking-wider block font-bold">Total Unidades</span>
                    <span className="text-xl font-bold text-[#111111] font-tech">{getTotalSelected()}</span>
                  </div>
                  <button 
                    onClick={handleAddAllToCart}
                    disabled={getTotalSelected() === 0 || isAdding}
                    className="btn-primary"
                  >
                    {isAdding ? 'Agregando...' : 'Añadir al Pedido'}
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
