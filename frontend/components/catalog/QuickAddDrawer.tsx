'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useCartStore, getValidStock, getProductCartKey } from '@/store/useCartStore';
import type { EnrichedMarco } from '@/lib/catalog/types';
import { X, Lock, ShoppingBag, Check, AlertCircle, ArrowRight, ShieldCheck, Sparkles, Plus, Minus } from 'lucide-react';
import { calculateRetailProjection } from '@/lib/catalog/brandCategories';

interface QuickAddDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  variants: EnrichedMarco[];
  initialVariantId?: string | null;
}

export default function QuickAddDrawer({
  isOpen,
  onClose,
  variants,
  initialVariantId,
}: QuickAddDrawerProps) {
  const { isLoggedIn, isB2BApproved } = useAuth();
  const cart = useCartStore((state) => state.cart);
  const addToCart = useCartStore((state) => state.addToCart);
  const getTotalUnits = useCartStore((state) => state.getTotalUnits);

  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [stockWarning, setStockWarning] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Lock body scroll and set initial active variant
  useEffect(() => {
    if (isOpen && variants && variants.length > 0) {
      const initial =
        initialVariantId && variants.some((v) => v.id_ext === initialVariantId)
          ? initialVariantId
          : variants[0]?.id_ext || null;
      setActiveVariantId(initial);
      setQuantities({});
      setStockWarning('');
      setSuccessMsg('');
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, variants, initialVariantId, onClose]);

  const baseProduct = variants?.[0];
  const activeVariant =
    (variants && variants.find((v) => v.id_ext === activeVariantId)) || baseProduct;

  const currentCartTotal = getTotalUnits();

  const selectedUnitsInMatrix = useMemo(() => {
    return Object.values(quantities).reduce((acc, curr) => acc + (curr || 0), 0);
  }, [quantities]);

  const selectedSubtotalNeto = useMemo(() => {
    if (!variants) return 0;
    return Object.entries(quantities).reduce((sum, [id_ext, qty]) => {
      if (qty <= 0) return sum;
      const v = variants.find((item) => item.id_ext === id_ext);
      const price = v?.precio_neto_clp || 0;
      return sum + price * qty;
    }, 0);
  }, [quantities, variants]);

  const projectedTotalUnits = currentCartTotal + selectedUnitsInMatrix;
  const moqThreshold = 10;
  const isMoqMet = projectedTotalUnits >= moqThreshold;
  const unitsNeeded = Math.max(0, moqThreshold - projectedTotalUnits);

  const handleIncrement = (id_ext: string, remainingStock: number, maxStock: number) => {
    const current = quantities[id_ext] || 0;
    if (current >= remainingStock) {
      setStockWarning(`Stock máximo disponible para este color: ${maxStock} unidades.`);
      return;
    }
    setStockWarning('');
    setQuantities((prev) => ({ ...prev, [id_ext]: current + 1 }));
  };

  const handleDecrement = (id_ext: string) => {
    const current = quantities[id_ext] || 0;
    if (current <= 1) {
      const next = { ...quantities };
      delete next[id_ext];
      setQuantities(next);
    } else {
      setQuantities((prev) => ({ ...prev, [id_ext]: current - 1 }));
    }
    setStockWarning('');
  };

  const handleDirectInput = (
    id_ext: string,
    val: string,
    maxStock: number,
    remainingStock: number
  ) => {
    let num = parseInt(val, 10);
    if (isNaN(num) || num < 0) num = 0;
    if (num > remainingStock) {
      num = remainingStock;
      setStockWarning(`Stock máximo disponible: ${maxStock} ${maxStock === 1 ? 'unidad' : 'unidades'}.`);
    } else {
      setStockWarning('');
    }
    setQuantities((prev) => ({ ...prev, [id_ext]: num }));
  };

  const handleAddAllToCart = () => {
    if (!isLoggedIn) return;
    setIsAdding(true);
    setStockWarning('');
    setSuccessMsg('');

    let totalAdded = 0;
    let warningMsg = '';

    Object.entries(quantities).forEach(([id_ext, qty]) => {
      if (qty > 0) {
        const variant = variants?.find((v) => v.id_ext === id_ext);
        if (variant) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _k, _search, _dims, ...base } = variant;
          const res = addToCart(base, qty);
          if (res.message) {
            warningMsg = res.message;
          }
          totalAdded += res.added;
        }
      }
    });

    if (warningMsg) {
      setStockWarning(warningMsg);
    }

    if (totalAdded > 0) {
      setSuccessMsg(`✓ ${totalAdded} unidades añadidas a su pedido combinable.`);
      setTimeout(() => {
        setSuccessMsg('');
      }, 4000);
    }

    setTimeout(() => {
      setIsAdding(false);
      setQuantities({});
    }, 500);
  };

  if (!isOpen || !variants || variants.length === 0 || !baseProduct) return null;

  const productHref = `/producto/${encodeURIComponent(baseProduct.marca || '')}/${encodeURIComponent(baseProduct.modelo || '')}`;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" aria-modal="true" role="dialog">
      {/* Fondo sombreado */}
      <div
        className="fixed inset-0 bg-[#0F0F0F]/65 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Contenedor del Drawer lateral deslizable */}
      <div className="relative w-full max-w-2xl bg-[#FFFFFF] h-full shadow-2xl border-l border-[#E6E2DD] flex flex-col z-10 animate-slide-in-right overflow-hidden">
        {/* CABECERA ARQUITECTÓNICA */}
        <div className="p-5 sm:p-6 border-b border-[#E6E2DD] bg-[#FAF9F6] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.24em] font-semibold text-[#9E8256]">
                {baseProduct.marca}
              </span>
              <span className="text-[10px] text-[#787670] font-mono">
                · MATRIZ DE COMPRA RÁPIDA
              </span>
            </div>
            <h2 className="font-serif text-2xl text-[#0F0F0F] font-normal leading-tight">
              {baseProduct.modelo}
            </h2>
            <p className="text-[11px] text-[#5C5A55] mt-0.5">
              {variants.length} {variants.length === 1 ? 'color disponible' : 'colores disponibles'} · Combine unidades libremente
            </p>
          </div>

          <button
            onClick={onClose}
            type="button"
            aria-label="Cerrar panel de compra rápida"
            className="w-9 h-9 border border-[#E6E2DD] bg-[#FFFFFF] hover:bg-[#0F0F0F] hover:text-white text-[#5C5A55] flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* INDICADOR DE PROGRESO MOQ (10 UNIDADES COMBINABLES) */}
        <div className="bg-[#FAF9F6] px-5 sm:px-6 py-3 border-b border-[#E6E2DD]">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[11px] font-semibold text-[#0F0F0F] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#9E8256]" />
              Pedido Mínimo Mayorista (10 un. combinables)
            </span>
            <span className="font-mono text-xs font-bold text-[#0F0F0F] tabular-nums">
              {projectedTotalUnits} / {moqThreshold} un.
            </span>
          </div>

          {/* Barra de progreso */}
          <div className="w-full bg-[#E6E2DD] h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                isMoqMet ? 'bg-[#2D6A4F]' : 'bg-[#9E8256]'
              }`}
              style={{ width: `${Math.min(100, (projectedTotalUnits / moqThreshold) * 100)}%` }}
            />
          </div>

          <div className="flex justify-between items-center mt-1 text-[10px] text-[#5C5A55]">
            <span>
              {isMoqMet ? (
                <strong className="text-[#2D6A4F] font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" /> ¡Mínimo de 10 unidades alcanzado!
                </strong>
              ) : (
                <span>
                  Faltan <strong>{unitsNeeded} {unitsNeeded === 1 ? 'unidad' : 'unidades'}</strong> para completar el mínimo mayorista combinable.
                </span>
              )}
            </span>
            {selectedUnitsInMatrix > 0 && (
              <span className="font-mono font-semibold text-[#9E8256] tabular-nums">
                +{selectedUnitsInMatrix} un. en esta matriz
              </span>
            )}
          </div>
        </div>

        {/* VISTA PREVIA DEL COLOR ACTIVO */}
        {activeVariant && (
          <div className="px-5 sm:px-6 py-3 bg-[#FFFFFF] border-b border-[#E6E2DD] flex items-center gap-4">
            <div className="relative w-16 h-14 bg-[#F4F2ED] border border-[#E6E2DD] shrink-0 flex items-center justify-center p-1">
              <img
                src={
                  activeVariant.imagen_principal && activeVariant.imagen_principal.trim()
                    ? activeVariant.imagen_principal.trim()
                    : '/placeholder.png'
                }
                alt={activeVariant.color || activeVariant.codigo_color || 'Variante'}
                className="w-full h-full object-contain mix-blend-multiply"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#0F0F0F] truncate">
                  {activeVariant.color || 'Color Estándar'}
                </span>
                <span className="text-[10px] font-mono text-[#787670] bg-[#FAF9F6] border border-[#E6E2DD] px-1.5 py-0.5">
                  COL {activeVariant.codigo_color || 'N/A'}
                </span>
              </div>
              <p className="text-[10px] text-[#787670] font-mono truncate mt-0.5">
                SKU: {activeVariant.id_ext} · Material: {baseProduct.material || 'Acetato'}
              </p>
            </div>
            <Link
              href={productHref}
              className="text-[10px] text-[#0F0F0F] hover:text-[#9E8256] uppercase tracking-wider font-semibold shrink-0 flex items-center gap-1"
            >
              Ficha <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL: MATRIZ DE COLORES Y STOCK */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 scrollbar-thin">
          {!isLoggedIn ? (
            <div className="py-12 px-6 text-center bg-[#FAF9F6] border border-[#E6E2DD] flex flex-col items-center">
              <div className="w-10 h-10 border border-[#E6E2DD] bg-[#FFFFFF] flex items-center justify-center mb-3 text-[#9E8256]">
                <Lock className="w-4 h-4" />
              </div>
              <h3 className="font-serif text-lg text-[#0F0F0F] mb-1">
                Acceso B2B Exclusivo para Ópticas
              </h3>
              <p className="text-xs text-[#5C5A55] max-w-sm mb-5 leading-relaxed">
                Inicie sesión para visualizar los precios netos por volumen y agregar unidades de cada color directamente al pedido.
              </p>
              <div className="flex gap-3">
                <Link
                  href="/login"
                  className="bg-[#0F0F0F] hover:bg-[#262626] text-white text-[10px] font-medium py-2.5 px-5 transition tracking-[0.16em] uppercase border border-[#0F0F0F]"
                >
                  Iniciar Sesión
                </Link>
                <Link
                  href="/registro"
                  className="bg-transparent hover:bg-[#0F0F0F] hover:text-white text-[#0F0F0F] text-[10px] font-medium py-2.5 px-5 border border-[#0F0F0F] transition tracking-[0.16em] uppercase"
                >
                  Registrar Óptica
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-semibold text-[#787670] uppercase tracking-[0.18em] pb-2 border-b border-[#E6E2DD]">
                <span>Variantes de Color ({variants.length})</span>
                <span className="hidden sm:inline">Precio Neto / Stock / Cantidad</span>
              </div>

              {variants.map((v, i) => {
                const maxStock = getValidStock(v.stock);
                const inCart =
                  cart.find((item) => getProductCartKey(item.producto) === v.id_ext)?.cantidad || 0;
                const remainingStock = Math.max(0, maxStock - inCart);
                const isOutOfStock = maxStock <= 0;
                const isMaxInCart = !isOutOfStock && remainingStock <= 0;
                const isSelected = v.id_ext === activeVariant?.id_ext;
                const qtySelected = quantities[v.id_ext] || 0;
                const rowImgSrc =
                  v.imagen_principal && v.imagen_principal.trim()
                    ? v.imagen_principal.trim()
                    : '/placeholder.png';

                return (
                  <div
                    key={v.id_ext || `quick-row-${i}`}
                    onClick={() => setActiveVariantId(v.id_ext)}
                    className={`p-3 border transition-all cursor-pointer ${
                      qtySelected > 0
                        ? 'border-[#0F0F0F] bg-[#FAF9F6] shadow-2xs'
                        : isSelected
                        ? 'border-[#9E8256] bg-[#FFFFFF]'
                        : isOutOfStock
                        ? 'border-[#E6E2DD] bg-[#F4F2ED] opacity-50'
                        : 'border-[#E6E2DD] bg-[#FFFFFF] hover:border-[#0F0F0F]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                      {/* Miniatura y Color */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`relative w-12 h-12 bg-[#F4F2ED] border flex-shrink-0 flex items-center justify-center p-1 ${
                            isSelected ? 'border-[#0F0F0F]' : 'border-[#E6E2DD]'
                          }`}
                        >
                          <img
                            src={rowImgSrc}
                            alt={v.color || v.codigo_color || 'Color'}
                            className="w-full h-full object-contain mix-blend-multiply"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                            }}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-[#0F0F0F] truncate">
                              {v.color || 'Color Estándar'}
                            </span>
                            {qtySelected > 0 && (
                              <span className="text-[9px] font-mono font-bold bg-[#0F0F0F] text-white px-1.5 py-0.2 uppercase tracking-wider">
                                +{qtySelected} un.
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#787670] font-mono mt-0.5 truncate">
                            {v.codigo_color ? `COL ${v.codigo_color} · ` : ''}SKU: {v.id_ext}
                          </div>
                        </div>
                      </div>

                      {/* Precio y Disponibilidad */}
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs font-bold text-[#0F0F0F] tabular-nums">
                          {isLoggedIn && isB2BApproved && typeof v.precio_neto_clp === 'number'
                            ? `$${v.precio_neto_clp.toLocaleString('es-CL')}`
                            : 'Reservado B2B'}
                          {isLoggedIn && isB2BApproved && typeof v.precio_neto_clp === 'number' && (
                            <span className="text-[9px] font-normal text-[#787670] ml-1">Neto</span>
                          )}
                        </div>

                        <div className="text-[10px] mt-0.5">
                          {isOutOfStock ? (
                            <span className="text-[#9E3838] font-mono uppercase">Agotado</span>
                          ) : isMaxInCart ? (
                            <span className="text-[#846C44] font-mono">Máx. ({maxStock})</span>
                          ) : inCart > 0 ? (
                            <span className="text-[#5C5A55] font-mono tabular-nums">
                              Disp: {remainingStock} ({inCart} en carro)
                            </span>
                          ) : (
                            <span className="text-[#787670] font-mono tabular-nums">
                              Stock: {maxStock >= 50 ? '50+' : maxStock} un.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* CONTROL STEPPER: [-] [ INPUT ] [+] */}
                      <div
                        className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label={`Disminuir ${v.color || v.codigo_color}`}
                          disabled={isOutOfStock || isMaxInCart || qtySelected <= 0}
                          onClick={() => handleDecrement(v.id_ext)}
                          className="w-8 h-8 flex items-center justify-center border border-[#D5D0C8] bg-[#FAF9F6] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white hover:border-[#0F0F0F] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer font-bold text-sm select-none"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <input
                          type="number"
                          min="0"
                          max={remainingStock}
                          disabled={isOutOfStock || isMaxInCart}
                          value={quantities[v.id_ext] || ''}
                          placeholder="0"
                          onChange={(e) =>
                            handleDirectInput(v.id_ext, e.target.value, maxStock, remainingStock)
                          }
                          className="w-12 h-8 bg-[#FFFFFF] border border-[#D5D0C8] text-center text-[#0F0F0F] font-mono font-bold text-xs focus:outline-none focus:border-[#0F0F0F] disabled:opacity-30 rounded-none tabular-nums"
                        />

                        <button
                          type="button"
                          aria-label={`Aumentar ${v.color || v.codigo_color}`}
                          disabled={isOutOfStock || isMaxInCart || qtySelected >= remainingStock}
                          onClick={() => handleIncrement(v.id_ext, remainingStock, maxStock)}
                          className="w-8 h-8 flex items-center justify-center border border-[#D5D0C8] bg-[#FAF9F6] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white hover:border-[#0F0F0F] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer font-bold text-sm select-none"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MENSAJES DE ADVERTENCIA / ÉXITO */}
          {stockWarning && (
            <div className="mt-4 p-3 bg-[#FBF8F1] border border-[#E6E2DD] text-[#846C44] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#846C44]" />
              <span>{stockWarning}</span>
            </div>
          )}

          {successMsg && (
            <div className="mt-4 p-3 bg-[#F4F8F5] border border-[#C4D9C8] text-[#2D6A4F] text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-[#2D6A4F]" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* PIE DE MATRIZ FIJO: TOTALES Y CTA */}
        {isLoggedIn && isB2BApproved && (
          <div className="p-5 sm:p-6 bg-[#FAF9F6] border-t border-[#E6E2DD] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#787670] uppercase tracking-[0.16em] block">
                  Unidades Seleccionadas
                </span>
                <span className="font-mono text-xl font-bold text-[#0F0F0F] tabular-nums">
                  {selectedUnitsInMatrix}{' '}
                  <span className="text-xs font-normal text-[#787670]">unidades</span>
                </span>
              </div>

              {selectedSubtotalNeto > 0 && (
                <div className="text-right">
                  <span className="text-[10px] text-[#787670] uppercase tracking-[0.16em] block">
                    Subtotal Neto Matriz
                  </span>
                  <span className="font-mono text-xl font-bold text-[#0F0F0F] tabular-nums">
                    ${selectedSubtotalNeto.toLocaleString('es-CL')}{' '}
                    <span className="text-xs font-normal text-[#787670]">CLP</span>
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handleAddAllToCart}
              disabled={selectedUnitsInMatrix === 0 || isAdding}
              className="w-full bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white text-[11px] font-medium uppercase tracking-[0.18em] py-3.5 transition flex items-center justify-center gap-2 border border-[#0F0F0F] cursor-pointer"
            >
              {isAdding ? (
                'Añadiendo a la orden...'
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4 text-[#9E8256]" />
                  <span>
                    Añadir {selectedUnitsInMatrix > 0 ? `${selectedUnitsInMatrix} un.` : ''} al Pedido
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
