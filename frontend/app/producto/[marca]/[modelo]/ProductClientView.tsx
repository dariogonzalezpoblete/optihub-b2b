'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCartStore } from '@/store/useCartStore';
import { useRecentStore } from '@/store/useRecentStore';
import type { EnrichedMarco } from '@/lib/catalog/types';
import { 
  ArrowLeft, Lock, ShoppingBag, Ruler, CheckCircle2, Package, ShieldCheck
} from 'lucide-react';

interface Props {
  variants: EnrichedMarco[];
  baseProduct: EnrichedMarco;
}

export default function ProductClientView({ variants, baseProduct }: Props) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const addToCart = useCartStore((state) => state.addToCart);
  const addRecentItem = useRecentStore((state) => state.addRecentItem);

  const [activeVariant, setActiveVariant] = useState<EnrichedMarco>(baseProduct);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);

  const currentImages = [activeVariant.imagen_principal].filter(Boolean) as string[];
  if (activeVariant.imagenes_secundarias) {
    currentImages.push(activeVariant.imagenes_secundarias);
  }
  const currentImageUrl = currentImages[activeImageIndex] || currentImages[0];

  useEffect(() => {
    // Agregar al historial de "Vistos Recientemente"
    addRecentItem(baseProduct);
  }, [baseProduct, addRecentItem]);

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
          // Remover atributos enriquecidos antes de enviar al store
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _k, _search, _dims, ...base } = variant;
          addToCart(base, qty);
          addedCount += qty;
        }
      }
    });

    setTimeout(() => {
      setIsAdding(false);
      setQuantities({}); // Resetear inputs
      // Redirigir o notificar
    }, 600);
  };

  const dims = baseProduct._dims;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Back to Catalog */}
      <button 
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-emerald-400 transition mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver al catálogo
      </button>

      <div className="flex flex-col lg:flex-row gap-10">
        
        {/* Lado Izquierdo: Galería */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4">
          <div className="bg-slate-900 rounded-3xl border border-slate-800/80 p-8 flex items-center justify-center aspect-[4/3] relative overflow-hidden group">
            {currentImageUrl ? (
              <Image 
                src={currentImageUrl} 
                alt={`${baseProduct.marca} ${baseProduct.modelo}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain p-8 filter drop-shadow-2xl transition-transform duration-500 group-hover:scale-105"
                priority
              />
            ) : (
              <div className="text-slate-600">Sin Imagen</div>
            )}
            <div className="absolute top-4 right-4 z-10 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full text-xs font-bold text-emerald-400">
              ID: {baseProduct.modelo}
            </div>
          </div>
          
          {/* Ángulos del Variante Actual */}
          {currentImages.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar justify-center">
              {currentImages.map((imgUrl, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative w-20 h-20 rounded-2xl border-2 flex-shrink-0 bg-slate-900 p-2 transition-all ${
                    activeImageIndex === idx ? 'border-emerald-500 opacity-100' : 'border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600'
                  }`}
                >
                  <Image src={imgUrl} alt="Ángulo" fill className="object-contain p-2" sizes="80px" />
                </button>
              ))}
            </div>
          )}

          {/* Selector de Colores (Variantes) */}
          <div className="mt-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Colores Disponibles</h4>
            <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
              {variants.map((v) => (
                <button
                  key={v.id_ext}
                  onClick={() => {
                    setActiveVariant(v);
                    setActiveImageIndex(0);
                  }}
                  className={`relative w-16 h-16 rounded-2xl border-2 flex-shrink-0 bg-slate-900 transition-all ${
                    activeVariant.id_ext === v.id_ext ? 'border-emerald-500 opacity-100 scale-105 shadow-lg shadow-emerald-500/20' : 'border-slate-800 opacity-50 hover:opacity-100 hover:border-slate-600'
                  }`}
                  title={v.color}
                >
                  {v.imagen_principal && (
                    <Image src={v.imagen_principal} alt={v.color || 'Color'} fill className="object-contain p-1.5" sizes="64px" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lado Derecho: Info y Compra */}
        <div className="w-full lg:w-1/2 flex flex-col">
          <div className="mb-6">
            <Link href={`/catalogo?marca=${encodeURIComponent(baseProduct.marca.toLowerCase())}`} className="text-xs font-black tracking-widest text-emerald-400 hover:text-emerald-300 uppercase transition">
              {baseProduct.marca}
            </Link>
            <h1 className="text-4xl font-black text-white tracking-tight mt-1 mb-3">
              Modelo {baseProduct.modelo}
            </h1>
            
            <div className="flex flex-wrap gap-4 text-sm mt-4">
              <span className="flex items-center gap-2 text-slate-300 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Autenticidad Garantizada
              </span>
              <span className="flex items-center gap-2 text-slate-300 bg-slate-900/50 px-3 py-1.5 rounded-xl border border-slate-800">
                <Package className="w-4 h-4 text-emerald-500" />
                Despacho a todo Chile
              </span>
            </div>
          </div>

          {/* Especificaciones Técnicas */}
          <div className="bg-slate-900/40 rounded-3xl p-6 border border-slate-800/80 mb-8">
            <div className="flex items-center gap-2 text-white font-bold mb-4">
              <Ruler className="w-5 h-5 text-emerald-400" />
              <h3>Especificaciones Ópticas</h3>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/50 text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Ancho Aro</span>
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
                    const outOfStock = v.stock <= 0;
                    return (
                      <div key={v.id_ext} className={`grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-slate-950 p-3 rounded-2xl border ${outOfStock ? 'border-slate-800/40 opacity-60' : 'border-slate-800'}`}>
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
                          <span className={`text-xs font-bold px-2 py-1 rounded-md ${outOfStock ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {v.stock} un.
                          </span>
                        </div>
                        
                        <div className="col-span-1 sm:col-span-2 flex justify-start sm:justify-center">
                          <input 
                            type="number"
                            min="0"
                            max={v.stock}
                            disabled={outOfStock}
                            value={quantities[v.id_ext] || ''}
                            placeholder="0"
                            onChange={(e) => handleQuantityChange(v.id_ext, e.target.value, v.stock)}
                            className="w-16 bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-2 text-center text-white font-bold text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

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
  );
}
