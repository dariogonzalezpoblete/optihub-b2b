'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCartStore, getValidStock, getProductCartKey } from '@/store/useCartStore';
import { useRecentStore } from '@/store/useRecentStore';
import { type EnrichedMarco } from '@/lib/catalog/types';
import { 
  ArrowLeft, Lock, ShoppingBag, AlertCircle, Check, ShieldCheck, Truck, Sparkles, Box, FileCheck, TrendingUp, Plus, Minus, Clock, MessageCircle, ArrowRight
} from 'lucide-react';
import { calculateRetailProjection } from '@/lib/catalog/brandCategories';
import { trackB2BEvent } from '@/lib/analytics';

interface Props {
  variants: EnrichedMarco[];
  baseProduct: EnrichedMarco;
}

export default function ProductClientView({ variants, baseProduct }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skuFromUrl = searchParams?.get('sku');

  // Auth Context: Seguridad B2B
  const { isLoggedIn, isB2BApproved, isB2BPending, opticaData, session } = useAuth();

  const cart = useCartStore((state) => state.cart);
  const addToCart = useCartStore((state) => state.addToCart);
  const getTotalUnits = useCartStore((state) => state.getTotalUnits);
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

    // Consulta de precios: SOLO si el usuario está autenticado y VERIFICADO B2B
    if (!isLoggedIn || !isB2BApproved || !session?.access_token || !variants || variants.length === 0) {
      return;
    }

    const ids = Array.from(new Set(variants.map((v) => v.id_ext).filter(Boolean)));
    if (ids.length === 0) return;

    let cancelled = false;
    fetch('/api/catalog/pricing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ids }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.items)) return;
        const b2bMap = new Map(
          (data.items as Array<{ id_ext: string; precio_neto_clp?: number | null; precio_bruto_clp?: number | null; stock?: number | null }>).map(
            (row) => [row.id_ext, row]
          )
        );
        setB2bVariants((prev) =>
          prev.map((v) => {
            const b2b = b2bMap.get(v.id_ext);
            return b2b
              ? {
                  ...v,
                  precio_neto_clp: typeof b2b.precio_neto_clp === 'number' ? b2b.precio_neto_clp : undefined,
                  precio_bruto_clp: typeof b2b.precio_bruto_clp === 'number' ? b2b.precio_bruto_clp : undefined,
                  stock: typeof b2b.stock === 'number' ? b2b.stock : undefined,
                }
              : v;
          })
        );
        setActiveVariant((prev) => {
          const b2b = b2bMap.get(prev.id_ext);
          return b2b
            ? {
                ...prev,
                precio_neto_clp: typeof b2b.precio_neto_clp === 'number' ? b2b.precio_neto_clp : undefined,
                precio_bruto_clp: typeof b2b.precio_bruto_clp === 'number' ? b2b.precio_bruto_clp : undefined,
                stock: typeof b2b.stock === 'number' ? b2b.stock : undefined,
              }
            : prev;
        });
      })
      .catch((err) => {
        console.error('[ProductClientView] Error al consultar tarifas B2B:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [variantIdsKey, isLoggedIn, isB2BApproved, session?.access_token, baseProduct, skuFromUrl, variants]);

  useEffect(() => {
    if (!activeVariant) return;
    trackB2BEvent('view_product_sheet', {
      brand: activeVariant.marca || baseProduct?.marca || '',
      model: activeVariant.modelo || baseProduct?.modelo || '',
      sku: activeVariant.id_ext || baseProduct?.id_ext || '',
      price_neto: typeof activeVariant.precio_neto_clp === 'number' ? activeVariant.precio_neto_clp : undefined,
    });
  }, [activeVariant?.id_ext, activeVariant?.precio_neto_clp, baseProduct?.marca, baseProduct?.modelo, baseProduct?.id_ext]);

  const handleSelectVariant = (variant: EnrichedMarco) => {
    if (variant.id_ext === activeVariant.id_ext) return;
    setActiveVariant(variant);
    setActiveImageIndex(0);
    setStockWarning('');

    // Actualizar URL sin reload
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('sku', variant.id_ext);
    window.history.replaceState({}, '', currentUrl.toString());
  };

  // Recolectar imágenes para la variante activa
  const images = useMemo(() => {
    const list: string[] = [];
    if (activeVariant?.imagen_principal) {
      list.push(activeVariant.imagen_principal.trim());
    }
    if (activeVariant?.imagenes_secundarias) {
      const sec = activeVariant.imagenes_secundarias
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      list.push(...sec);
    }
    return Array.from(new Set(list));
  }, [activeVariant]);

  const currentImage = images[activeImageIndex] || activeVariant?.imagen_principal || '/placeholder.png';

  // Manejo de cantidades en matriz
  const handleQuantityChange = (sku: string, val: string, maxStock: number, remainingStock: number) => {
    const parsed = parseInt(val, 10);
    setStockWarning('');

    if (isNaN(parsed) || parsed <= 0) {
      setQuantities((prev) => {
        const next = { ...prev };
        delete next[sku];
        return next;
      });
      return;
    }

    if (parsed > remainingStock) {
      setQuantities((prev) => ({ ...prev, [sku]: remainingStock }));
      setStockWarning(`Disponibilidad máxima de ${remainingStock} unidades para el acabado seleccionado.`);
      return;
    }

    setQuantities((prev) => ({ ...prev, [sku]: parsed }));
  };

  const handleIncrement = (sku: string, remainingStock: number, maxStock: number) => {
    const current = quantities[sku] || 0;
    if (current >= remainingStock) {
      setStockWarning(`Disponibilidad máxima de ${remainingStock} unidades para este acabado.`);
      return;
    }
    setQuantities((prev) => ({ ...prev, [sku]: current + 1 }));
    setStockWarning('');
  };

  const handleDecrement = (sku: string) => {
    const current = quantities[sku] || 0;
    if (current <= 1) {
      setQuantities((prev) => {
        const next = { ...prev };
        delete next[sku];
        return next;
      });
    } else {
      setQuantities((prev) => ({ ...prev, [sku]: current - 1 }));
    }
    setStockWarning('');
  };

  const getTotalSelected = () => {
    return Object.values(quantities).reduce((acc, q) => acc + q, 0);
  };

  // Añadir variantes seleccionadas al carrito
  const handleAddAllToCart = () => {
    if (!isLoggedIn || !isB2BApproved) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const selectedSkus = Object.entries(quantities).filter(([_, q]) => q > 0);
    if (selectedSkus.length === 0) return;

    setIsAdding(true);

    let addedCount = 0;
    for (const [sku, qty] of selectedSkus) {
      const v = b2bVariants.find((item) => item.id_ext === sku);
      if (v) {
        addToCart(v, qty);
        addedCount += qty;
      }
    }

    // Registrar en productos recientes
    addRecentItem(activeVariant);

    setSuccessMsg(`¡${addedCount} unidades añadidas al pedido mayorista!`);
    setQuantities({});
    setIsAdding(false);

    setTimeout(() => {
      setSuccessMsg('');
    }, 4000);
  };

  // Cálculo de Margen Retail Sugerido
  const retail = useMemo(() => {
    if (typeof activeVariant.precio_neto_clp !== 'number') return null;
    return calculateRetailProjection(activeVariant.precio_neto_clp, activeVariant.marca);
  }, [activeVariant.precio_neto_clp, activeVariant.marca]);

  // Enlace contextual de consulta B2B por WhatsApp
  const whatsappConsultUrl = useMemo(() => {
    const brand = activeVariant?.marca || baseProduct?.marca || '';
    const model = activeVariant?.modelo || baseProduct?.modelo || '';
    const sku = activeVariant?.id_ext || baseProduct?.id_ext || '';
    const msg = `Hola equipo OPTIHUB, escribo desde una óptica en Chile y quiero consultar por el armazón ${brand} ${model} (SKU: ${sku}) para mi pedido mayorista`;
    return `https://wa.me/56989338537?text=${encodeURIComponent(msg)}`;
  }, [activeVariant, baseProduct]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] pb-24">
      {/* Barra de Navegación Secundaria / Breadcrumbs */}
      <div className="border-b border-[#E6E2DD] bg-[#FFFFFF] py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
          <Link
            href="/catalogo"
            className="inline-flex items-center gap-2 text-[#5C5A55] hover:text-[#0F0F0F] transition uppercase tracking-wider font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Catálogo</span>
          </Link>

          <div className="flex items-center gap-2 text-[#787670] uppercase tracking-wider text-[10px] font-mono">
            <span>{baseProduct.marca}</span>
            <span>/</span>
            <span className="text-[#0F0F0F] font-bold">{baseProduct.modelo}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* COLUMNA IZQUIERDA: GALERÍA DE IMÁGENES */}
          <div className="lg:col-span-6 space-y-4">
            {/* Visor Principal con Fondo Neutro y Aspecto Editorial */}
            <div className="relative aspect-4/3 bg-[#F4F2ED] border border-[#E6E2DD] overflow-hidden flex items-center justify-center p-8">
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 bg-[#FFFFFF] border border-[#E6E2DD] text-[#5C5A55]">
                  COL {activeVariant.codigo_color || 'N/A'}
                </span>
                {activeVariant.origen && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-[#FFFFFF] border border-[#E6E2DD] text-[#5C5A55]">
                    {activeVariant.origen}
                  </span>
                )}
              </div>

              <div className="relative w-full h-full flex items-center justify-center">
                <Image
                  src={currentImage}
                  alt={`${activeVariant.marca} ${activeVariant.modelo} ${activeVariant.color || ''}`}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain p-4 mix-blend-multiply transition-all duration-300"
                />
              </div>
            </div>

            {/* Carrusel de Miniaturas de la Variante Activa */}
            {images.length > 1 && (
              <div className="flex gap-2.5 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={`thumb-${idx}`}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-16 h-16 bg-[#F4F2ED] border flex-shrink-0 transition-all p-1 rounded-none cursor-pointer ${
                      activeImageIndex === idx
                        ? 'border-[#0F0F0F] ring-1 ring-[#0F0F0F]'
                        : 'border-[#E6E2DD] hover:border-[#0F0F0F] opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Image
                      src={img}
                      alt={`Toma ${idx + 1}`}
                      fill
                      sizes="64px"
                      className="object-contain p-1 mix-blend-multiply"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Especificaciones Técnicas de Óptica */}
            <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 space-y-4 mt-6">
              <h3 className="font-semibold text-xs uppercase tracking-[0.16em] text-[#0F0F0F] flex items-center gap-2">
                <Box className="w-4 h-4 text-[#9E8256]" />
                Especificaciones Técnicas de Armazón
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs pt-2">
                <div className="border-b border-[#E6E2DD] pb-2">
                  <span className="text-[10px] text-[#787670] uppercase tracking-wider block font-medium">Calibre / Puente</span>
                  <span className="font-mono font-bold text-[#0F0F0F]">{activeVariant.tamano || 'Estándar'}</span>
                </div>
                <div className="border-b border-[#E6E2DD] pb-2">
                  <span className="text-[10px] text-[#787670] uppercase tracking-wider block font-medium">Material Armazón</span>
                  <span className="font-medium text-[#0F0F0F]">{activeVariant.material || 'Acetato / Metal'}</span>
                </div>
                <div className="border-b border-[#E6E2DD] pb-2">
                  <span className="text-[10px] text-[#787670] uppercase tracking-wider block font-medium">Forma de Montura</span>
                  <span className="font-medium text-[#0F0F0F]">{activeVariant.forma || 'Clásica'}</span>
                </div>
                <div className="border-b border-[#E6E2DD] pb-2">
                  <span className="text-[10px] text-[#787670] uppercase tracking-wider block font-medium">Género Recomendado</span>
                  <span className="font-medium text-[#0F0F0F]">{activeVariant.genero || 'Unisex'}</span>
                </div>
                <div className="border-b border-[#E6E2DD] pb-2">
                  <span className="text-[10px] text-[#787670] uppercase tracking-wider block font-medium">Código Universal (UPC)</span>
                  <span className="font-mono text-[#0F0F0F]">{activeVariant.upc || 'N/A'}</span>
                </div>
                <div className="border-b border-[#E6E2DD] pb-2">
                  <span className="text-[10px] text-[#787670] uppercase tracking-wider block font-medium">SKU Individual</span>
                  <span className="font-mono text-[#0F0F0F]">{activeVariant.id_ext}</span>
                </div>
              </div>
            </div>

            {/* Garantías de Distribución Directa B2B */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-4 flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-[#9E8256] shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-[11px] uppercase tracking-wider text-[#0F0F0F]">100% Original</h4>
                  <p className="text-[10px] text-[#5C5A55] mt-0.5 leading-tight">Distribución directa de fabricante en EE.UU.</p>
                </div>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-4 flex items-start gap-3">
                <FileCheck className="w-4 h-4 text-[#9E8256] shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-[11px] uppercase tracking-wider text-[#0F0F0F]">Factura SII</h4>
                  <p className="text-[10px] text-[#5C5A55] mt-0.5 leading-tight">Facturación electrónica y crédito fiscal DTE.</p>
                </div>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-4 flex items-start gap-3">
                <Truck className="w-4 h-4 text-[#9E8256] shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-[11px] uppercase tracking-wider text-[#0F0F0F]">Importación</h4>
                  <p className="text-[10px] text-[#5C5A55] mt-0.5 leading-tight">10 a 15 días hábiles a todo Chile.</p>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: INFORMACIÓN B2B, MATRIZ Y COMPRA RÁPIDA */}
          <div className="lg:col-span-6 space-y-6">
            
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

              {/* Proyección Retail Sugerida para Ópticas Verificadas */}
              {isLoggedIn && isB2BApproved && retail && retail.pvpSugerido > 0 && (
                <div className="mt-5 pt-4 border-t border-[#E6E2DD] bg-[#FAF9F6] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-[#5C5A55] uppercase tracking-wider block font-medium">
                      PVP Sugerido en Óptica / Mercado:
                    </span>
                    <span className="text-xl font-bold font-mono text-[#0F0F0F] tabular-nums">
                      ${retail.pvpSugerido.toLocaleString('es-CL')}{' '}
                      <span className="text-xs font-normal text-[#787670]">CLP</span>
                    </span>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-[#9E8256] uppercase tracking-wider block font-semibold flex items-center gap-1 sm:justify-end">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Margen ~{retail.margenPorcentaje}%
                    </span>
                    <span className="text-xs font-bold text-[#0F0F0F] font-mono tabular-nums">
                      +${retail.gananciaPorUnidad.toLocaleString('es-CL')} utilidad/un
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Grilla B2B de Variantes */}
            <div className="bg-[#FFFFFF] border border-[#E6E2DD] overflow-hidden flex flex-col">
              <div className="bg-[#FAF9F6] px-6 py-4 border-b border-[#E6E2DD] flex items-center justify-between">
                <h3 className="font-semibold text-[11px] tracking-[0.16em] uppercase text-[#0F0F0F] flex items-center gap-2">
                  <ShoppingBag className="w-3.5 h-3.5 text-[#9E8256]" />
                  Matriz de Compra Rápida por Color
                </h3>
                <span className="text-[10px] text-[#787670] font-mono uppercase tracking-wider">
                  {b2bVariants.length} {b2bVariants.length === 1 ? 'color' : 'colores'}
                </span>
              </div>

              {/* BARRA DE PROGRESO MOQ COMBINABLE (10 UNIDADES) */}
              {isLoggedIn && isB2BApproved && (
                <div className="bg-[#FFFFFF] px-6 py-3 border-b border-[#E6E2DD]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[10px] font-semibold text-[#0F0F0F] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#9E8256]" />
                      Pedido Mínimo Mayorista (10 un. combinables)
                    </span>
                    <span className="font-mono text-xs font-bold text-[#0F0F0F] tabular-nums">
                      {getTotalUnits() + getTotalSelected()} / 10 un.
                    </span>
                  </div>
                  <div className="w-full bg-[#E6E2DD] h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ease-out ${
                        getTotalUnits() + getTotalSelected() >= 10 ? 'bg-[#2D6A4F]' : 'bg-[#9E8256]'
                      }`}
                      style={{ width: `${Math.min(100, ((getTotalUnits() + getTotalSelected()) / 10) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1 text-[10px] text-[#5C5A55]">
                    <span>
                      {getTotalUnits() + getTotalSelected() >= 10 ? (
                        <strong className="text-[#2D6A4F] font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> ¡Mínimo mayorista de 10 unidades combinables alcanzado!
                        </strong>
                      ) : (
                        <span>
                          Faltan <strong>{Math.max(0, 10 - (getTotalUnits() + getTotalSelected()))} {Math.max(0, 10 - (getTotalUnits() + getTotalSelected())) === 1 ? 'unidad' : 'unidades'}</strong> para completar el mínimo combinable.
                        </span>
                      )}
                    </span>
                    {getTotalSelected() > 0 && (
                      <span className="font-mono font-semibold text-[#9E8256] tabular-nums">
                        +{getTotalSelected()} un. seleccionadas
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* SELECTOR RÁPIDO DE COLORES (SWATCHES) */}
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
                              COL {v.codigo_color || 'N/A'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* CASO 1: USUARIO INVITADO (NO LOGUEADO) */}
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
                  <div className="w-full max-w-xs mt-3">
                    <a
                      href={whatsappConsultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        trackB2BEvent('click_whatsapp_b2b', {
                          source: 'product_sheet',
                          brand: activeVariant?.marca || baseProduct?.marca,
                          model: activeVariant?.modelo || baseProduct?.modelo,
                          sku: activeVariant?.id_ext || baseProduct?.id_ext,
                        });
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 bg-[#FAF9F6] hover:bg-[#F4F2ED] text-[#0F0F0F] border border-[#E6E2DD] hover:border-[#0F0F0F] py-2.5 px-3 transition text-[10px] uppercase tracking-[0.16em] font-medium"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                      <span>Consultar disponibilidad / lote por WhatsApp</span>
                    </a>
                  </div>
                </div>
              ) : isB2BPending ? (
                /* CASO 2: USUARIO LOGUEADO PERO CUENTA EN VALIDACIÓN SII PENDIENTE */
                <div className="p-8 sm:p-10 text-center flex-1 flex flex-col justify-center items-center bg-[#FAF6ED]/40 border-b border-[#E6D7B8]">
                  <div className="w-12 h-12 border border-[#D9C496] bg-[#F7F3EB] flex items-center justify-center mb-4 text-[#846C44]">
                    <Clock className="w-5 h-5 text-[#846C44]" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#846C44] bg-[#EFE4C8] px-2.5 py-0.5 mb-2 font-mono">
                    VALIDACIÓN SII EN PROCESO
                  </span>
                  <h4 className="font-serif text-2xl text-[#0F0F0F] font-normal mb-2">
                    Cuenta Óptica en Revisión Comercial
                  </h4>
                  <p className="text-xs text-[#5C5A55] max-w-md mb-6 leading-relaxed">
                    Su cuenta registrada ({opticaData?.rut_empresa ? `RUT: ${opticaData.rut_empresa}` : 'Óptica'}) está en proceso de validación tributaria ante el SII. Los precios mayoristas netos y pedidos de importación directa se activarán tras la confirmación de su giro óptico.
                  </p>
                  <div className="w-full max-w-sm space-y-3">
                    <a
                      href={`https://wa.me/56989338537?text=${encodeURIComponent(
                        `Hola OptiHub B2B, acabo de ver la ficha de ${baseProduct.marca} ${baseProduct.modelo}. Mi cuenta (${opticaData?.nombre_optica || 'Óptica'}, RUT: ${opticaData?.rut_empresa || ''}) está en validación SII. Solicito activación prioritaria para cotizar.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        trackB2BEvent('click_whatsapp_b2b', {
                          source: 'product_sheet',
                          brand: activeVariant?.marca || baseProduct?.marca,
                          model: activeVariant?.modelo || baseProduct?.modelo,
                          sku: activeVariant?.id_ext || baseProduct?.id_ext,
                        });
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white py-3.5 px-4 transition text-[11px] uppercase tracking-[0.18em] font-semibold border border-[#20BA5A] shadow-xs"
                    >
                      <MessageCircle className="w-4 h-4 fill-white" />
                      <span>Activar Cuenta vía WhatsApp</span>
                    </a>
                    <Link
                      href="/catalogo"
                      className="w-full inline-flex items-center justify-center gap-2 bg-transparent hover:bg-[#FAF9F6] text-[#0F0F0F] py-3 px-4 transition text-[11px] uppercase tracking-[0.16em] border border-[#D5D0C8] text-center"
                    >
                      <span>Volver al Catálogo</span>
                    </Link>
                  </div>
                </div>
              ) : (
                /* CASO 3: ÓPTICA AUTORIZADA Y VERIFICADA B2B */
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
                      const qtySelected = quantities[v.id_ext] || 0;
                      const rowImgSrc = v.imagen_principal && v.imagen_principal.trim() ? v.imagen_principal.trim() : '/placeholder.png';

                      return (
                        <div 
                          key={v.id_ext || `row-${i}`} 
                          onClick={() => handleSelectVariant(v)}
                          className={`grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 border transition-all cursor-pointer ${
                            qtySelected > 0
                              ? 'border-[#0F0F0F] bg-[#FAF9F6] shadow-2xs'
                              : isSelected
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
                                {qtySelected > 0 && (
                                  <span className="inline-flex items-center text-[9px] bg-[#0F0F0F] text-white px-1.5 py-0.2 uppercase tracking-wider shrink-0 font-mono font-bold">
                                    +{qtySelected} un.
                                  </span>
                                )}
                                {isSelected && qtySelected === 0 && (
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
                          
                          {/* Precio Neto B2B */}
                          <div className="col-span-1 sm:col-span-3 text-left sm:text-center">
                            <span className="sm:hidden text-xs text-[#787670] mr-2">Precio:</span>
                            <span className="font-mono font-bold text-[#0F0F0F] text-sm tabular-nums">
                              {typeof v.precio_neto_clp === 'number' 
                                ? `$${v.precio_neto_clp.toLocaleString('es-CL')}` 
                                : 'Cotizar'}
                            </span>
                          </div>
                          
                          {/* Stock en Origen */}
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
                                Disp: {remainingStock} ({inCart} en carro)
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-[#5C5A55] tabular-nums">
                                {maxStock >= 50 ? '50+ un.' : `${maxStock} un.`}
                              </span>
                            )}
                          </div>

                          {/* Stepper de Cantidad */}
                          <div className="col-span-1 sm:col-span-2 flex items-center justify-end sm:justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              aria-label={`Reducir ${v.color || v.codigo_color}`}
                              disabled={outOfStock || !qtySelected || qtySelected <= 0}
                              onClick={() => handleDecrement(v.id_ext)}
                              className="w-7 h-7 flex items-center justify-center border border-[#D5D0C8] bg-[#FAF9F6] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white hover:border-[#0F0F0F] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer select-none"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              aria-label={`Cantidad para ${v.color || v.codigo_color}`}
                              disabled={outOfStock || isMaxInCart}
                              value={quantities[v.id_ext] || ''}
                              placeholder="0"
                              onChange={(e) => handleQuantityChange(v.id_ext, e.target.value, maxStock, remainingStock)}
                              className="w-11 h-7 bg-[#FFFFFF] border border-[#D5D0C8] text-center text-[#0F0F0F] font-mono font-bold text-xs focus:outline-none focus:border-[#0F0F0F] disabled:opacity-30 rounded-none tabular-nums"
                            />

                            <button
                              type="button"
                              aria-label={`Aumentar ${v.color || v.codigo_color}`}
                              disabled={outOfStock || isMaxInCart || qtySelected >= remainingStock}
                              onClick={() => handleIncrement(v.id_ext, remainingStock, maxStock)}
                              className="w-7 h-7 flex items-center justify-center border border-[#D5D0C8] bg-[#FAF9F6] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white hover:border-[#0F0F0F] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer select-none"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
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

                  <div className="mt-auto pt-5 border-t border-[#E6E2DD] space-y-3">
                    <div className="flex items-center justify-between">
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

                    {/* CTA Secundario: Consulta B2B por WhatsApp */}
                    <a
                      href={whatsappConsultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        trackB2BEvent('click_whatsapp_b2b', {
                          source: 'product_sheet',
                          brand: activeVariant?.marca || baseProduct?.marca,
                          model: activeVariant?.modelo || baseProduct?.modelo,
                          sku: activeVariant?.id_ext || baseProduct?.id_ext,
                        });
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 bg-[#FAF9F6] hover:bg-[#F4F2ED] text-[#0F0F0F] border border-[#E6E2DD] hover:border-[#0F0F0F] py-3 px-4 transition text-[11px] uppercase tracking-[0.16em] font-medium"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                      <span>Consultar disponibilidad / lote por WhatsApp</span>
                    </a>
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
