'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCartStore, getValidStock, getProductCartKey } from '@/store/useCartStore';
import { useRecentStore } from '@/store/useRecentStore';
import type { EnrichedMarco } from '@/lib/catalog/types';
import { 
  ArrowLeft, Lock, ShoppingBag, Ruler, CheckCircle2, Package, ShieldCheck, AlertCircle, Check
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

  const [activeVariant, setActiveVariant] = useState<EnrichedMarco>(baseProduct);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [stockWarning, setStockWarning] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const currentImages = [activeVariant.imagen_principal].filter(Boolean) as string[];
  if (activeVariant.imagenes_secundarias) {
    currentImages.push(activeVariant.imagenes_secundarias);
  }
  const currentImageUrl = currentImages[activeImageIndex] || currentImages[0];

  useEffect(() => {
    // Agregar al historial de "Vistos Recientemente"
    addRecentItem(baseProduct);
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
        const variant = variants.find(v => v.id_ext === id_ext);
        if (variant) {
          // Remover atributos enriquecidos antes de enviar al store
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
      setSuccessMsg(`✓ ${addedCount} unidades añadidas a tu carrito mayorista.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    }

    setTimeout(() => {
      setIsAdding(false);
      setQuantities({}); // Resetear inputs
    }, 600);
  };

  const dims = baseProduct._dims;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Barra de navegación superior simple */}
      <div className="border-b border-slate-800 bg-slate-900/40 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al catálogo
          </button>
          <div className="text-xs text-slate-500 font-mono">
            {baseProduct.marca} / {baseProduct.modelo}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Columna Izquierda: Galería de Imágenes */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="aspect-[4/3] bg-slate-900/60 rounded-3xl border border-slate-800 flex items-center justify-center p-8 relative overflow-hidden group shadow-2xl">
              {currentImageUrl ? (
                <Image unoptimized
                  src={currentImageUrl} 
                  alt={`${activeVariant.marca} ${activeVariant.modelo}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="object-contain p-8 transition-transform duration-500 group-hover:scale-105"
                  priority
                />
              ) : (
                <div className="text-slate-600 text-sm">Sin imagen disponible</div>
              )}
              
              <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-300">
                {activeVariant.color || 'Color Único'}
              </div>
            </div>

            {/* Thumbnails */}
            {currentImages.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                {currentImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-20 h-20 bg-slate-900/60 rounded-2xl border overflow-hidden flex-shrink-0 transition-all ${
                      idx === activeImageIndex 
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20' 
                        : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <Image unoptimized src={img} alt="Thumbnail" fill sizes="80px" className="object-cover p-2" />
                  </button>
                ))}
              </div>
            )}

            {/* Ficha Técnica y Dimensiones */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/50 text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Calibre</span>
                <span className="text-lg font-black text-slate-200">{dims?.calibre || '-'} <span className="text-xs text-slate-500">mm</span></span>
              </div>
              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/50 text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Puente</span>
                <span className="text-lg font-black text-slate-200">{dims?.puente || '-'} <span className="text-xs text-slate-500">mm</span></span>
              </div>
              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/50 text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Varilla</span>
                <span className="text-lg font-black text-slate-200">{dims?.varilla || '-'} <span className="text-xs text-slate-500">mm</span></span>
              </div>
              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/50 text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Material</span>
                <span className="text-sm font-black text-slate-200 truncate" title={baseProduct.material}>{baseProduct.material || 'Estándar'}</span>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Información B2B & Grilla de Variantes */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div>
              <span className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
                {baseProduct.marca}
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">{baseProduct.modelo}</h1>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                Armazón óptico mayorista original importado. Disponible para despachos inmediatos a ópticas y distribuidores registrados.
              </p>
            </div>

            {/* Grilla B2B de Variantes */}
            <div className="bg-slate-900/60 rounded-3xl border border-emerald-500/20 overflow-hidden flex-1 flex flex-col">
              <div className="bg-emerald-500/10 px-6 py-4 border-b border-emerald-500/20">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  Grilla de Compra Mayorista (Variantes)
                </h3>
              </div>
              
              {!isLoggedIn ? (
                <div className="p-8 text-center flex-1 flex flex-col justify-center items-center">
                  <Lock className="w-12 h-12 text-slate-600 mb-4" />
                  <h4 className="text-lg font-bold text-white mb-2">Inicia sesión para cotizar</h4>
                  <p className="text-sm text-slate-400 max-w-md mb-6">
                    Los precios mayoristas netos y el stock en tiempo real son exclusivos para ópticas registradas.
                  </p>
                  <div className="flex gap-3">
                    <Link href="/login" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition">
                      Iniciar Sesión
                    </Link>
                    <Link href="/registro" className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-6 py-3 rounded-xl border border-slate-700 transition">
                      Registrar Óptica
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex flex-col flex-1">
                  <div className="hidden sm:grid grid-cols-12 gap-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">
                    <div className="col-span-5">Color / SKU</div>
                    <div className="col-span-3 text-center">Precio Neto</div>
                    <div className="col-span-2 text-center">Stock</div>
                    <div className="col-span-2 text-center">Cant.</div>
                  </div>
                  
                  <div className="space-y-3 mb-8">
                    {variants.map((v) => {
                      const maxStock = getValidStock(v.stock);
                      const inCart = cart.find(item => getProductCartKey(item.producto) === v.id_ext)?.cantidad || 0;
                      const remainingStock = Math.max(0, maxStock - inCart);
                      const outOfStock = maxStock <= 0;
                      const isMaxInCart = !outOfStock && remainingStock <= 0;

                      return (
                        <div key={v.id_ext} className={`grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-slate-950 p-3 rounded-2xl border ${outOfStock ? 'border-slate-800/40 opacity-60' : isMaxInCart ? 'border-amber-500/30' : 'border-slate-800'}`}>
                          <div className="col-span-1 sm:col-span-5 flex items-center gap-3">
                            {v.codigo_color && (
                              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                {v.codigo_color}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-slate-200 text-sm">{v.color || 'Estándar'}</p>
                              <p className="text-[10px] text-slate-500 font-mono">SKU: {v.id_ext}</p>
                            </div>
                          </div>
                          
                          <div className="col-span-1 sm:col-span-3 text-left sm:text-center">
                            <span className="sm:hidden text-xs text-slate-500 mr-2">Precio:</span>
                            <span className="font-black text-emerald-400">${v.precio_neto_clp?.toLocaleString('es-CL')}</span>
                          </div>
                          
                          <div className="col-span-1 sm:col-span-2 text-left sm:text-center">
                            <span className="sm:hidden text-xs text-slate-500 mr-2">Stock:</span>
                            {outOfStock ? (
                              <span className="text-xs font-bold px-2 py-1 rounded-md bg-red-500/10 text-red-400">
                                Sin stock
                              </span>
                            ) : isMaxInCart ? (
                              <span className="text-xs font-bold px-2 py-1 rounded-md bg-amber-500/10 text-amber-400" title={`Ya tienes ${inCart} en el carrito`}>
                                Máx. ({maxStock})
                              </span>
                            ) : inCart > 0 ? (
                              <span className="text-xs font-bold px-2 py-1 rounded-md bg-teal-500/10 text-teal-300" title={`${inCart} en carrito`}>
                                {remainingStock} un.
                              </span>
                            ) : (
                              <span className="text-xs font-bold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400">
                                {maxStock} un.
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
                              className="w-16 bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-2 text-center text-white font-bold text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
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

                  {successMsg && (
                    <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                      <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <div className="mt-auto pt-6 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Total Seleccionado</p>
                      <p className="text-2xl font-black text-white">{getTotalSelected()} <span className="text-sm font-normal text-slate-500">unidades</span></p>
                    </div>
                    
                    <button 
                      onClick={handleAddAllToCart}
                      disabled={getTotalSelected() === 0 || isAdding}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black px-8 py-4 rounded-2xl transition shadow-lg shadow-emerald-500/20 disabled:shadow-none flex items-center gap-2"
                    >
                      {isAdding ? (
                        'Agregando...'
                      ) : (
                        <>
                          <ShoppingBag className="w-5 h-5" />
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
    </div>
  );
}
