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
  ArrowLeft, Lock, ShoppingBag, AlertCircle, Check, ShieldCheck, Truck, Sparkles, Box, FileCheck
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
  }, [variantIdsKey, isLoggedIn, baseProduct, skuFromUrl, variants]);

  const handleSelectVariant = (variant: EnrichedMarco) => {
    if (variant.id_ext === activeVariant.id_ext) return;
    setActiveVariant(variant);
    setActiveImageIndex(0);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Barra de navegación superior sutil */}
      <div className="flex items-center justify-between pb-6 mb-8 border-b border-[#E6E2DD]">
        <button 
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-[11px] font-medium text-[#5C5A55] hover:text-[#0F0F0F] transition uppercase tracking-[0.18em] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al catálogo
        </button>
        <div className="text-[10px] text-[#787670] font-mono tracking-widest uppercase">
          {baseProduct.marca} · {baseProduct.modelo}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
        
        {/* Columna Izquierda: Galería de Imágenes & Ficha Técnica Arquitectónica */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          
          {/* Contenedor Principal de Imagen sobre Superficie #F4F2ED con mix-blend-multiply */}
          <div className="aspect-[4/3] bg-[#F4F2ED] border border-[#E6E2DD] flex items-center justify-center p-8 sm:p-14 relative overflow-hidden group">
            {currentImageUrl ? (
              <Image 
                unoptimized
                key={`${activeVariant?.id_ext || 'main'}-${activeImageIndex}-${currentImageUrl}`}
                src={currentImageUrl} 
                alt={`${activeVariant?.marca || ''} ${activeVariant?.modelo || ''} ${activeVariant?.color || ''}`.trim() || 'Fotografía de producto'}
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-contain p-6 sm:p-10 mix-blend-multiply transition-all duration-500 group-hover:scale-[1.03]"
                priority
                loading="eager"
              />
            ) : (
              <div className="text-[#787670] text-xs uppercase tracking-wider">Sin fotografía disponible</div>
            )}
            
            {/* Badge flotante de Color en la foto */}
            <div className="absolute top-4 left-4 z-10 bg-[#FFFFFF] border border-[#E6E2DD] px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#0F0F0F]">
              {activeVariant?.color || activeVariant?.codigo_color || 'Color Único'}
            </div>

            {/* Código de Origen */}
            <div className="absolute top-4 right-4 z-10 text-[9px] font-mono uppercase tracking-wider text-[#787670] bg-[#FFFFFF] border border-[#E6E2DD] px-2.5 py-1">
              USA DIRECT
            </div>
          </div>

          {/* Miniaturas Cuadradas de Borde 1px (border-[#0F0F0F] cuando está activa) */}
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
                  className={`relative w-20 h-20 bg-[#F4F2ED] border overflow-hidden flex-shrink-0 transition-all flex items-center justify-center cursor-pointer ${
                    idx === activeImageIndex 
                      ? 'border-[#0F0F0F] ring-1 ring-[#0F0F0F]' 
                      : 'border-[#E6E2DD] opacity-70 hover:opacity-100 hover:border-[#0F0F0F]'
                  }`}
                  title={`Vista ${idx + 1}`}
                >
                  <img 
                    src={img} 
                    alt={`Vista ${idx + 1}`} 
                    loading="eager"
                    decoding="async"
                    className="w-full h-full object-contain p-1.5 mix-blend-multiply"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          {/* FICHA TÉCNICA DE MEDIDAS: CUADRÍCULA ARQUITECTÓNICA DE 4 CELDAS (1px solid #E6E2DD) */}
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-4 h-[1px] bg-[#9E8256]" />
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9E8256]">
                Especificaciones Ópticas y Dimensiones
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 border border-[#E6E2DD] divide-y sm:divide-y-0 sm:divide-x divide-[#E6E2DD]">
              <div className="p-5 text-center bg-[#FAF9F6]">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#5C5A55] block mb-1">
                  Calibre
                </span>
                <span className="font-serif text-xl font-normal text-[#0F0F0F] block tabular-nums">
                  {dims?.calibre || '-'} <span className="text-xs text-[#787670] font-sans">mm</span>
                </span>
              </div>

              <div className="p-5 text-center bg-[#FAF9F6]">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#5C5A55] block mb-1">
                  Puente
                </span>
                <span className="font-serif text-xl font-normal text-[#0F0F0F] block tabular-nums">
                  {dims?.puente || '-'} <span className="text-xs text-[#787670] font-sans">mm</span>
                </span>
              </div>

              <div className="p-5 text-center bg-[#FAF9F6]">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#5C5A55] block mb-1">
                  Varilla
                </span>
                <span className="font-serif text-xl font-normal text-[#0F0F0F] block tabular-nums">
                  {dims?.varilla || '-'} <span className="text-xs text-[#787670] font-sans">mm</span>
                </span>
              </div>

              <div className="p-5 text-center bg-[#FAF9F6]">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#5C5A55] block mb-1">
                  Material
                </span>
                <span className="font-serif text-xl font-normal text-[#0F0F0F] truncate block" title={baseProduct.material}>
                  {baseProduct.material || 'Acetato / Metal'}
                </span>
              </div>
            </div>

            {/* BLOQUE INFORMATIVO: DOTACIÓN OFICIAL DE FÁBRICA INCLUIDA (ÍCONOS DE LÍNEA 1PX) */}
            <div className="mt-8 pt-6 border-t border-[#E6E2DD]">
              <span className="text-[10px] uppercase tracking-[0.18em] text-[#0F0F0F] font-semibold block mb-4">
                Dotación Oficial de Fábrica Incluida
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs text-[#5C5A55]">
                <div className="flex items-start gap-3">
                  <Box className="w-4 h-4 text-[#9E8256] shrink-0 stroke-[1.25] mt-0.5" />
                  <div>
                    <span className="font-semibold text-[#0F0F0F] block text-xs">Estuche Rígido Original</span>
                    <span className="text-[11px] text-[#787670] leading-tight block mt-0.5">Firmado con emblema de la casa manufacturera.</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-[#9E8256] shrink-0 stroke-[1.25] mt-0.5" />
                  <div>
                    <span className="font-semibold text-[#0F0F0F] block text-xs">Microfibra y Folletería</span>
                    <span className="text-[11px] text-[#787670] leading-tight block mt-0.5">Paño oficial y certificado de garantía de marca.</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <FileCheck className="w-4 h-4 text-[#9E8256] shrink-0 stroke-[1.25] mt-0.5" />
                  <div>
                    <span className="font-semibold text-[#0F0F0F] block text-xs">Trazabilidad USA · SII</span>
                    <span className="text-[11px] text-[#787670] leading-tight block mt-0.5">Factura electrónica con IVA 100% deducible.</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Columna Derecha: Información B2B & Matriz de Variantes */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Cabecera del Producto */}
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 sm:p-8">
            <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#9E8256] block mb-2">
              {baseProduct.marca}
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl text-[#0F0F0F] font-normal tracking-tight">
              {baseProduct.modelo}
            </h1>
            <p className="text-[#5C5A55] text-xs sm:text-sm mt-3 leading-relaxed">
              Armazón óptico original importado directamente desde distribuidor oficial en EE.UU. para ópticas autorizadas en Chile.
            </p>
          </div>

          {/* Grilla B2B de Variantes */}
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] overflow-hidden flex flex-col">
            <div className="bg-[#FAF9F6] px-6 py-4 border-b border-[#E6E2DD] flex items-center justify-between">
              <h3 className="font-semibold text-[11px] tracking-[0.16em] uppercase text-[#0F0F0F] flex items-center gap-2">
                <ShoppingBag className="w-3.5 h-3.5 text-[#9E8256]" />
                Variantes y Stock Mayorista
              </h3>
              <span className="text-[10px] text-[#787670] font-mono uppercase tracking-wider">
                {b2bVariants.length} {b2bVariants.length === 1 ? 'color' : 'colores'}
              </span>
            </div>

            {/* SELECTOR RÁPIDO DE COLORES (SWATCHES RECTANGULARES) */}
            {b2bVariants.length > 1 && (
              <div className="p-5 sm:p-6 pb-4 border-b border-[#E6E2DD] bg-[#FAF9F6]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-semibold text-[#0F0F0F] uppercase tracking-wider">
                    Color seleccionado:{' '}
                    <span className="text-[#9E8256] normal-case">
                      {activeVariant.color || activeVariant.codigo_color || 'Estándar'}
                    </span>
                  </span>
                  <span className="text-[10px] text-[#787670] font-mono">
                    COL {activeVariant.codigo_color || 'N/A'} · SKU: {activeVariant.id_ext}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {b2bVariants.map((v, i) => {
                    const isSelected = v.id_ext === activeVariant?.id_ext;
                    const swatchSrc = v.imagen_principal && v.imagen_principal.trim() ? v.imagen_principal.trim() : '/placeholder.png';
                    return (
                      <button
                        key={`swatch-detail-${v.id_ext || i}`}
                        type="button"
                        onClick={() => handleSelectVariant(v)}
                        className={`group relative flex items-center gap-2 px-3 py-1.5 border transition-all text-left cursor-pointer ${
                          isSelected
                            ? 'border-[#0F0F0F] bg-[#FFFFFF] ring-1 ring-[#0F0F0F]'
                            : 'border-[#E6E2DD] bg-[#FFFFFF] hover:border-[#0F0F0F]'
                        }`}
                        title={`${v.color || v.codigo_color || 'Variante'} (SKU: ${v.id_ext})`}
                      >
                        <div className={`relative w-8 h-8 overflow-hidden bg-[#F4F2ED] border flex-shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-[#0F0F0F]' : 'border-[#E6E2DD]'
                        }`}>
                          <img 
                            src={swatchSrc} 
                            alt={v.color || v.codigo_color || 'Variante'} 
                            loading="eager"
                            decoding="async"
                            className="w-full h-full object-contain p-0.5 mix-blend-multiply"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                            }}
                          />
                        </div>

                        <div>
                          <span className={`block text-[11px] font-bold leading-tight ${isSelected ? 'text-[#0F0F0F]' : 'text-[#5C5A55]'}`}>
                            {v.color || v.codigo_color || 'Variante'}
                          </span>
                          <span className="block text-[9px] text-[#787670] font-mono leading-none mt-0.5">
                            {v.codigo_color ? `COL ${v.codigo_color}` : v.id_ext}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {!isLoggedIn ? (
              <div className="p-8 sm:p-10 text-center flex-1 flex flex-col justify-center items-center">
                <div className="w-10 h-10 border border-[#E6E2DD] bg-[#FAF9F6] flex items-center justify-center mb-4 text-[#9E8256]">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="font-serif text-xl text-[#0F0F0F] font-normal mb-2">
                  Precios y Stock B2B Reservados
                </h4>
                <p className="text-xs text-[#5C5A55] max-w-sm mb-6 leading-relaxed">
                  Para visualizar precios netos por volumen y disponibilidad de importación en origen, inicie sesión con su cuenta de óptica registrada.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                  <Link 
                    href="/login" 
                    className="flex-1 bg-[#0F0F0F] hover:bg-[#262626] text-white text-[11px] font-medium py-3 px-4 transition text-center tracking-[0.16em] uppercase border border-[#0F0F0F]"
                  >
                    Iniciar Sesión
                  </Link>
                  <Link 
                    href="/registro" 
                    className="flex-1 bg-transparent hover:bg-[#0F0F0F] hover:text-white text-[#0F0F0F] text-[11px] font-medium py-3 px-4 border border-[#0F0F0F] transition text-center tracking-[0.16em] uppercase"
                  >
                    Registrar Óptica
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6 flex flex-col flex-1">
                <div className="hidden sm:grid grid-cols-12 gap-3 text-[10px] font-semibold text-[#787670] uppercase tracking-[0.18em] mb-3 px-2">
                  <div className="col-span-5">Color / Acabado</div>
                  <div className="col-span-3 text-center">Precio Neto</div>
                  <div className="col-span-2 text-center">Stock</div>
                  <div className="col-span-2 text-center">Cantidad</div>
                </div>
                
                <div className="space-y-2 mb-6">
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
                        className={`grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#0F0F0F] bg-[#FAF9F6]'
                            : outOfStock 
                            ? 'border-[#E6E2DD] opacity-50 bg-[#F4F2ED]' 
                            : isMaxInCart 
                            ? 'border-[#9E8256]/40 bg-[#FAF9F6]' 
                            : 'border-[#E6E2DD] bg-[#FFFFFF] hover:border-[#0F0F0F]'
                        }`}
                      >
                        {/* Miniatura + Color / Acabado */}
                        <div className="col-span-1 sm:col-span-5 flex items-center gap-3">
                          <div className={`relative w-10 h-10 overflow-hidden bg-[#F4F2ED] border flex-shrink-0 flex items-center justify-center ${
                            isSelected ? 'border-[#0F0F0F]' : 'border-[#E6E2DD]'
                          }`}>
                            <img 
                              src={rowImgSrc} 
                              alt={v.color || v.codigo_color || 'Variante'} 
                              loading="eager"
                              decoding="async"
                              className="w-full h-full object-contain p-0.5 mix-blend-multiply"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                              }}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-xs text-[#0F0F0F] truncate">{v.color || 'Estándar'}</p>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-[#0F0F0F] text-white px-1.5 py-0.5 uppercase tracking-wider shrink-0 font-mono">
                                  <Check className="w-2.5 h-2.5" /> Viendo
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#787670] font-mono truncate">
                              {v.codigo_color ? `COL ${v.codigo_color} · ` : ''}SKU: {v.id_ext}
                            </p>
                          </div>
                        </div>
                        
                        {/* Precio Neto */}
                        <div className="col-span-1 sm:col-span-3 text-left sm:text-center">
                          <span className="sm:hidden text-xs text-[#787670] mr-2">Precio:</span>
                          <span className="font-mono font-bold text-[#0F0F0F] text-sm tabular-nums">
                            {typeof v.precio_neto_clp === 'number' 
                              ? `$${v.precio_neto_clp.toLocaleString('es-CL')}` 
                              : 'Cotizar'}
                          </span>
                        </div>
                        
                        {/* Stock */}
                        <div className="col-span-1 sm:col-span-2 text-left sm:text-center">
                          <span className="sm:hidden text-xs text-[#787670] mr-2">Stock en origen:</span>
                          {outOfStock ? (
                            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-[#FAF4F4] text-[#9E3838] border border-[#E6D0D0]">
                              Agotado
                            </span>
                          ) : isMaxInCart ? (
                            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-[#FBF8F1] text-[#846C44] border border-[#E6E2DD]" title={`Ya tiene ${inCart} en el carrito`}>
                              Máx ({maxStock})
                            </span>
                          ) : inCart > 0 ? (
                            <span className="text-[10px] font-mono px-2 py-0.5 bg-[#F7F3EB] text-[#846C44] border border-[#9E8256]/30 tabular-nums">
                              {remainingStock} un.
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-2 py-0.5 bg-[#F4F2ED] text-[#0F0F0F] border border-[#E6E2DD] tabular-nums">
                              {maxStock >= 50 ? '50+ un.' : `${maxStock} un.`}
                            </span>
                          )}
                        </div>
                        
                        {/* Cantidad Input */}
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
                            className="w-16 bg-[#FFFFFF] border border-[#D5D0C8] py-1 px-2 text-center text-[#0F0F0F] font-mono font-bold text-xs focus:outline-none focus:border-[#0F0F0F] disabled:opacity-30 rounded-none tabular-nums"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {stockWarning && (
                  <div className="mb-4 p-3 bg-[#FBF8F1] border border-[#E6E2DD] text-[#846C44] text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-[#846C44]" />
                    <span>{stockWarning}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="mb-4 p-3 bg-[#F4F8F5] border border-[#C4D9C8] text-[#2D6A4F] text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 text-[#2D6A4F]" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <div className="mt-auto pt-5 border-t border-[#E6E2DD] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[#787670] font-medium uppercase tracking-[0.16em] mb-0.5">Total Seleccionado</p>
                    <p className="font-mono text-xl font-bold text-[#0F0F0F] tabular-nums">{getTotalSelected()} <span className="text-xs font-normal text-[#787670]">unidades</span></p>
                  </div>
                  
                  <button 
                    onClick={handleAddAllToCart}
                    disabled={getTotalSelected() === 0 || isAdding}
                    className="bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white text-[11px] font-medium uppercase tracking-[0.18em] px-8 py-3.5 transition flex items-center gap-2 border border-[#0F0F0F] cursor-pointer"
                  >
                    {isAdding ? (
                      'Añadiendo...'
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5 text-[#9E8256]" />
                        <span>Añadir al Pedido</span>
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
