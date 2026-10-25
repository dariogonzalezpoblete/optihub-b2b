'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useCartStore, getValidStock, getProductCartKey } from '@/store/useCartStore';
import type { EnrichedMarco } from '@/lib/catalog/types';
import { X, Lock, ShoppingBag, Ruler, AlertCircle, TrendingUp, ShieldCheck, Truck } from 'lucide-react';
import { getRotationBadge, calculateRetailProjection } from '@/lib/catalog/brandCategories';

interface Props {
  variants: EnrichedMarco[];
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickViewModal({ variants, isOpen, onClose }: Props) {
  const { isLoggedIn } = useAuth();
  const cart = useCartStore((state) => state.cart);
  const addToCart = useCartStore((state) => state.addToCart);

  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const activeVariant = variants.find(v => v.id_ext === activeVariantId) || variants[0];
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [stockWarning, setStockWarning] = useState<string>('');

  // Initialize
  useEffect(() => {
    if (isOpen && variants.length > 0) {
      setActiveVariantId(variants[0].id_ext);
      setActiveImageIndex(0);
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
  }, [isOpen, variants]);

  if (!isOpen || variants.length === 0) return null;

  const baseProduct = variants[0];
  const dims = baseProduct._dims;

  const currentImages = [activeVariant.imagen_principal].filter(Boolean) as string[];
  if (activeVariant.imagenes_secundarias) {
    currentImages.push(activeVariant.imagenes_secundarias);
  }
  const currentImageUrl = currentImages[activeImageIndex] || currentImages[0];

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
      
      <div className="relative bg-[#FFFFFF] border border-[#E5E4DF] shadow-2xl rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row animate-slide-up text-[#111111]">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 bg-[#FAF9F6] hover:bg-[#FFFFFF] border border-[#E5E4DF] rounded-full flex items-center justify-center text-[#575551] transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Galería Rápida */}
        <div className="w-full md:w-5/12 bg-[#FAF9F6] p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#E5E4DF]">
          <div className="flex flex-col items-center w-full">
            {/* Imagen Principal */}
            <div className="aspect-[4/3] w-full flex items-center justify-center mb-6 relative group bg-[#FFFFFF] rounded-2xl border border-[#E5E4DF] p-4">
              {currentImageUrl ? (
                <Image unoptimized src={currentImageUrl} 
                  alt="Product" 
                  fill
                  sizes="(max-width: 768px) 100vw, 40vw"
                  className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="text-[#82807A] text-sm">Sin imagen</div>
              )}
            </div>

            {/* Selector de Miniaturas */}
            {currentImages.length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto max-w-full pb-2">
                {currentImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-14 h-14 rounded-xl border overflow-hidden flex-shrink-0 transition-all bg-[#FFFFFF] ${
                      idx === activeImageIndex 
                        ? 'border-[#B89768] ring-2 ring-[#B89768]/20 shadow-xs' 
                        : 'border-[#E5E4DF] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <Image unoptimized src={img} alt="Thumbnail" fill sizes="56px" className="object-cover p-1" />
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
              <Link href={`/producto/${encodeURIComponent(baseProduct.marca)}/${encodeURIComponent(baseProduct.modelo)}`} className="text-[#111111] hover:text-[#B89768] hover:underline font-bold">
                Ficha completa →
              </Link>
            </div>
          </div>
        </div>

        {/* Información y Compra */}
        <div className="w-full md:w-7/12 flex flex-col max-h-[90vh] overflow-y-auto bg-[#FFFFFF]">
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

            {/* Calculadora de Margen Retail en Modal */}
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
                <div className="space-y-2 mb-6 max-h-[30vh] overflow-y-auto scrollbar-thin pr-2">
                  {variants.map(v => {
                    const maxStock = getValidStock(v.stock);
                    const inCart = cart.find(item => getProductCartKey(item.producto) === v.id_ext)?.cantidad || 0;
                    const remainingStock = Math.max(0, maxStock - inCart);
                    const isOut = maxStock <= 0;
                    const isMaxInCart = !isOut && remainingStock <= 0;

                    return (
                      <div key={v.id_ext} className={`flex items-center justify-between p-3 bg-[#FAF9F6] rounded-xl border ${isOut ? 'border-[#E5E4DF] opacity-50' : isMaxInCart ? 'border-[#B89768]/50' : 'border-[#E5E4DF]'}`}>
                        <div className="flex-1">
                          <p className="font-bold text-[#111111] text-sm">{v.color || v.codigo_color}</p>
                          <p className="text-[10px] text-[#82807A] font-tech">SKU: {v.id_ext}</p>
                        </div>
                        <div className="text-right mr-4 w-28">
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
                        <div>
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
