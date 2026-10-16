'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useCartStore, getValidStock, getProductCartKey } from '@/store/useCartStore';
import type { EnrichedMarco } from '@/lib/catalog/types';
import { X, Lock, ShoppingBag, Ruler, AlertCircle } from 'lucide-react';

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
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-slate-900 border border-slate-800 shadow-2xl rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row animate-slide-up">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-slate-800/80 hover:bg-slate-700 rounded-full flex items-center justify-center text-slate-300 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Galería Rápida */}
        <div className="w-full md:w-5/12 bg-slate-950 p-6 flex flex-col justify-between border-r border-slate-800/80">
          <div className="flex flex-col items-center w-full">
            {/* Imagen Principal */}
            <div className="aspect-[4/3] w-full flex items-center justify-center mb-6 relative group">
              {currentImageUrl ? (
                <Image unoptimized src={currentImageUrl} 
                  alt="Product" 
                  fill
                  sizes="(max-width: 768px) 100vw, 40vw"
                  className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="text-slate-600 text-sm">Sin imagen</div>
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
                    className={`relative w-14 h-14 rounded-xl border overflow-hidden flex-shrink-0 transition-all ${
                      idx === activeImageIndex 
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20' 
                        : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <Image unoptimized src={img} alt="Thumbnail" fill sizes="56px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Envío mayorista consolidado</span>
            <Link href={`/producto/${encodeURIComponent(baseProduct.marca)}/${encodeURIComponent(baseProduct.modelo)}`} className="text-emerald-400 hover:underline font-bold">
              Ver ficha completa →
            </Link>
          </div>
        </div>

        {/* Información y Compra */}
        <div className="w-full md:w-7/12 flex flex-col max-h-[90vh] overflow-y-auto">
          <div className="p-6 md:p-8 border-b border-slate-800">
            <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-400 mb-1 block">
              {baseProduct.marca}
            </span>
            <h2 className="text-2xl font-black text-white">{baseProduct.modelo}</h2>
            <p className="text-slate-400 text-xs mt-1">Material: {baseProduct.material || 'Estándar'} • Género: {baseProduct.genero || 'Unisex'}</p>

            {/* Dimensiones */}
            {dims && (
              <div className="flex items-center gap-4 mt-4 bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs">
                <Ruler className="w-4 h-4 text-slate-500" />
                <span className="text-slate-400">Calibre: <strong className="text-slate-200">{dims.calibre} mm</strong></span>
                <span className="text-slate-400">Puente: <strong className="text-slate-200">{dims.puente} mm</strong></span>
                <span className="text-slate-400">Varilla: <strong className="text-slate-200">{dims.varilla} mm</strong></span>
              </div>
            )}
          </div>

          <div className="p-6 md:p-8 flex-1 bg-slate-900/50 flex flex-col">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              Grilla B2B de Stock
            </h3>

            {!isLoggedIn ? (
               <div className="bg-slate-950 p-6 rounded-2xl border border-amber-500/30 text-center">
                 <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                 <p className="text-sm text-slate-300 mb-4">Inicia sesión para ver precios netos y stock mayorista en tiempo real.</p>
                 <Link href="/login" className="bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-sm">Iniciar Sesión</Link>
               </div>
            ) : (
              <div className="flex flex-col flex-1">
                <div className="space-y-2 mb-6 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                  {variants.map(v => {
                    const maxStock = getValidStock(v.stock);
                    const inCart = cart.find(item => getProductCartKey(item.producto) === v.id_ext)?.cantidad || 0;
                    const remainingStock = Math.max(0, maxStock - inCart);
                    const isOut = maxStock <= 0;
                    const isMaxInCart = !isOut && remainingStock <= 0;

                    return (
                      <div key={v.id_ext} className={`flex items-center justify-between p-3 bg-slate-950 rounded-xl border ${isOut ? 'border-slate-800 opacity-50' : isMaxInCart ? 'border-amber-500/30' : 'border-slate-700'}`}>
                        <div className="flex-1">
                          <p className="font-bold text-slate-200 text-sm">{v.color || v.codigo_color}</p>
                          <p className="text-[10px] text-slate-500">SKU: {v.id_ext}</p>
                        </div>
                        <div className="text-right mr-4 w-28">
                          <p className="font-black text-emerald-400">${v.precio_neto_clp?.toLocaleString('es-CL')}</p>
                          {isOut ? (
                            <p className="text-[10px] text-rose-400 font-bold">Sin stock</p>
                          ) : isMaxInCart ? (
                            <p className="text-[10px] text-amber-400 font-bold">Máx. en carrito ({maxStock})</p>
                          ) : inCart > 0 ? (
                            <p className="text-[10px] text-slate-400">Disp: {remainingStock} ({inCart} en carrito)</p>
                          ) : (
                            <p className="text-[10px] text-slate-500">Stock: {maxStock}</p>
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
                            className="w-16 bg-slate-900 border border-slate-600 rounded-lg py-1.5 text-center text-white font-bold text-sm focus:border-emerald-500 outline-none disabled:opacity-50"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {stockWarning && (
                  <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{stockWarning}</span>
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-slate-800 pt-4">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Unidades</span>
                    <span className="text-xl font-black text-white">{getTotalSelected()}</span>
                  </div>
                  <button 
                    onClick={handleAddAllToCart}
                    disabled={getTotalSelected() === 0 || isAdding}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black px-6 py-3 rounded-xl transition flex items-center gap-2"
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
