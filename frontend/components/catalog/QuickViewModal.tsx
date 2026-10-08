'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useCartStore } from '@/store/useCartStore';
import type { EnrichedMarco } from '@/lib/catalog/types';
import { X, Lock, ShoppingBag, Ruler } from 'lucide-react';

interface Props {
  variants: EnrichedMarco[];
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickViewModal({ variants, isOpen, onClose }: Props) {
  const { isLoggedIn } = useAuth();
  const addToCart = useCartStore((state) => state.addToCart);

  const [activeImage, setActiveImage] = useState<string>('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);

  // Initialize
  useEffect(() => {
    if (isOpen && variants.length > 0) {
      setActiveImage(variants[0].imagen_principal || '');
      setQuantities({});
      document.body.style.overflow = 'hidden'; // Lock scroll
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, variants]);

  if (!isOpen || variants.length === 0) return null;

  const baseProduct = variants[0];
  const dims = baseProduct._dims;

  const handleQuantityChange = (id_ext: string, val: string, maxStock: number) => {
    let num = parseInt(val, 10);
    if (isNaN(num) || num < 0) num = 0;
    if (num > maxStock) num = maxStock;
    setQuantities(prev => ({ ...prev, [id_ext]: num }));
  };

  const getTotalSelected = () => {
    return Object.values(quantities).reduce((acc, curr) => acc + curr, 0);
  };

  const handleAddAllToCart = () => {
    if (!isLoggedIn) return;
    setIsAdding(true);
    
    let addedCount = 0;
    Object.entries(quantities).forEach(([id_ext, qty]) => {
      if (qty > 0) {
        const variant = variants.find(v => v.id_ext === id_ext);
        if (variant) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _k, _search, _dims, ...base } = variant;
          addToCart(base, qty);
          addedCount += qty;
        }
      }
    });

    setTimeout(() => {
      setIsAdding(false);
      onClose(); // Close modal after adding
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
        <div className="w-full md:w-5/12 bg-slate-950 p-6 flex flex-col items-center justify-center border-r border-slate-800/80">
          <div className="aspect-[4/3] w-full flex items-center justify-center mb-6">
            {activeImage ? (
              <img src={activeImage} alt="Product" className="w-full h-full object-contain filter drop-shadow-xl" />
            ) : (
              <span className="text-slate-600 font-bold">Sin imagen</span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto w-full custom-scrollbar pb-2">
            {variants.map((v) => (
              v.imagen_principal && (
                <button
                  key={v.id_ext}
                  onClick={() => setActiveImage(v.imagen_principal as string)}
                  className={`w-14 h-14 flex-shrink-0 rounded-xl border-2 bg-slate-900 p-1 transition ${activeImage === v.imagen_principal ? 'border-emerald-500' : 'border-slate-800 opacity-60 hover:opacity-100'}`}
                >
                  <img src={v.imagen_principal} alt={v.color} className="w-full h-full object-contain" />
                </button>
              )
            ))}
          </div>
          
          <Link 
            href={`/producto/${encodeURIComponent(baseProduct.marca)}/${encodeURIComponent(baseProduct.modelo)}`}
            className="mt-6 text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wider underline underline-offset-4"
          >
            Ver Ficha Completa (PDP)
          </Link>
        </div>

        {/* Detalles y Grilla B2B */}
        <div className="w-full md:w-7/12 flex flex-col h-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 md:p-8 border-b border-slate-800/80">
            <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase">{baseProduct.marca}</span>
            <h2 className="text-3xl font-black text-white mt-1 mb-4">{baseProduct.modelo}</h2>
            
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-slate-950 rounded-xl p-2 border border-slate-800">
                <span className="text-[9px] text-slate-500 uppercase block">Aro</span>
                <span className="font-bold text-slate-200 text-sm">{dims?.calibre || '-'}</span>
              </div>
              <div className="bg-slate-950 rounded-xl p-2 border border-slate-800">
                <span className="text-[9px] text-slate-500 uppercase block">Puente</span>
                <span className="font-bold text-slate-200 text-sm">{dims?.puente || '-'}</span>
              </div>
              <div className="bg-slate-950 rounded-xl p-2 border border-slate-800">
                <span className="text-[9px] text-slate-500 uppercase block">Varilla</span>
                <span className="font-bold text-slate-200 text-sm">{dims?.varilla || '-'}</span>
              </div>
              <div className="bg-slate-950 rounded-xl p-2 border border-slate-800">
                <span className="text-[9px] text-slate-500 uppercase block">Material</span>
                <span className="font-bold text-slate-200 text-sm truncate block" title={baseProduct.material}>{baseProduct.material || '-'}</span>
              </div>
            </div>
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
                    const isOut = v.stock <= 0;
                    return (
                      <div key={v.id_ext} className={`flex items-center justify-between p-3 bg-slate-950 rounded-xl border ${isOut ? 'border-slate-800 opacity-50' : 'border-slate-700'}`}>
                        <div className="flex-1">
                          <p className="font-bold text-slate-200 text-sm">{v.color || v.codigo_color}</p>
                          <p className="text-[10px] text-slate-500">SKU: {v.id_ext}</p>
                        </div>
                        <div className="text-right mr-4 w-24">
                          <p className="font-black text-emerald-400">${v.precio_neto_clp?.toLocaleString('es-CL')}</p>
                          <p className="text-[10px] text-slate-500">Stock: {v.stock}</p>
                        </div>
                        <div>
                          <input 
                            type="number" min="0" max={v.stock} disabled={isOut}
                            value={quantities[v.id_ext] || ''} placeholder="0"
                            onChange={(e) => handleQuantityChange(v.id_ext, e.target.value, v.stock)}
                            className="w-16 bg-slate-900 border border-slate-600 rounded-lg py-1.5 text-center text-white font-bold text-sm focus:border-emerald-500 outline-none disabled:opacity-50"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

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
