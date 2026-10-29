'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingBag, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useCartStore } from '@/store/useCartStore';

interface MoqProgressBarProps {
  variant?: 'banner' | 'floating' | 'card';
  className?: string;
  isLoggedIn?: boolean;
}

export default function MoqProgressBar({
  variant = 'banner',
  className = '',
  isLoggedIn = false,
}: MoqProgressBarProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cartUnits = useCartStore((state) =>
    state.cart.reduce((sum, item) => sum + (item.cantidad || 0), 0)
  );
  const getMontoNeto = useCartStore((state) => state.getMontoNeto);
  const clearCart = useCartStore((state) => state.clearCart);

  const target = 10;
  const current = mounted ? cartUnits : 0;
  const isReached = current >= target;
  const remaining = Math.max(0, target - current);
  const progressPercent = Math.min(100, Math.round((current / target) * 100));
  const montoNeto = mounted ? getMontoNeto() : 0;

  if (!mounted) {
    return null;
  }

  if (variant === 'floating') {
    if (current === 0) return null;

    return (
      <div className={`fixed bottom-0 left-0 right-0 z-40 bg-[#0F0F0F]/95 backdrop-blur-md border-t border-[#262626] text-white p-4 transition-all duration-300 shadow-xl ${className}`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Info izquierda */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-10 h-10 border border-[#262626] bg-[#1A1A1A] text-[#9E8256] flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-5 h-5 stroke-[1.5]" />
            </div>

            <div className="space-y-0.5 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-serif text-lg tracking-wide text-white uppercase font-normal">
                  Pedido B2B
                </span>
                <span className="font-mono text-xs text-[#9E8256] border border-[#9E8256]/30 px-2 py-0.5 tabular-nums font-semibold">
                  {current} de 10 armazones seleccionados
                </span>
                {isLoggedIn && montoNeto > 0 && (
                  <span className="font-mono text-xs text-[#E6E2DD] tabular-nums">
                    • ${montoNeto.toLocaleString('es-CL')} CLP Neto
                  </span>
                )}
              </div>

              <div className="text-xs text-[#787670]">
                {isReached ? (
                  <span className="text-[#9E8256] font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#9E8256]" />
                    ¡Mínimo de 10 unidades completado! ({current} armazones combinables) · Listo para facturación e importación
                  </span>
                ) : (
                  <span>
                    Faltan <strong className="text-white font-mono">{remaining}</strong> {remaining === 1 ? 'armazón' : 'armazones'} combinables para el mínimo mayorista (MOQ 10 u.)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Barra central de precisión */}
          <div className="w-full md:w-80 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-[#787670]">
              <span>PROGRESO MOQ COMBINABLE</span>
              <span className="text-[#9E8256] font-medium tabular-nums">{progressPercent}% ({current}/10)</span>
            </div>
            <div className="w-full h-[3px] bg-[#262626] overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isReached ? 'bg-[#2D6A4F]' : 'bg-[#9E8256]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Botones de acción derecha */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={() => clearCart()}
              className="text-[10px] text-[#787670] hover:text-white px-3 py-2 transition tracking-[0.16em] uppercase font-medium cursor-pointer"
            >
              Vaciar
            </button>
            <Link
              href="/carrito"
              className="bg-[#9E8256] text-white hover:bg-[#846C44] text-[10px] uppercase tracking-[0.18em] py-3 px-6 transition-colors font-medium flex items-center gap-2 border border-[#9E8256]"
            >
              <span>Revisar Pedido</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

        </div>
      </div>
    );
  }

  // Variant 'banner' o 'card' (barra ejecutiva de bordes rectos)
  return (
    <div className={`bg-[#FFFFFF] border border-[#E6E2DD] p-6 ${className}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border border-[#E6E2DD] bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="w-4 h-4 text-[#9E8256]" />
          </div>
          <div>
            <h4 className="font-serif text-lg font-normal text-[#0F0F0F] leading-tight">
              Control de Compra Mínima Mayorista (MOQ)
            </h4>
            <p className="text-xs text-[#5C5A55] mt-0.5">
              10 unidades combinables entre cualquier marca oficial para consolidar importación directa desde USA.
            </p>
          </div>
        </div>

        <div className="text-right flex items-center gap-2 self-end sm:self-auto">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#787670]">Estado:</span>
          <span className={`text-[10px] uppercase tracking-[0.14em] font-medium px-2.5 py-1 border ${
            isReached
              ? 'bg-[#F7F3EB] text-[#846C44] border-[#9E8256]/40 font-semibold'
              : 'bg-[#FAF9F6] text-[#5C5A55] border-[#E6E2DD]'
          }`}>
            {isReached ? 'Mínimo Cumplido (10+)' : `Faltan ${remaining} un.`}
          </span>
        </div>
      </div>

      {/* Barra de progreso fina de 3px */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-[#5C5A55]">
            <strong className="text-[#0F0F0F] font-bold">{current}</strong> de <strong className="text-[#0F0F0F] font-bold">10</strong> armazones seleccionados
          </span>
          <span className="text-[#9E8256] font-medium tabular-nums">{progressPercent}%</span>
        </div>
        <div className="w-full h-[3px] bg-[#F4F2ED] overflow-hidden border border-[#E6E2DD]/60">
          <div
            className={`h-full transition-all duration-500 ${isReached ? 'bg-[#2D6A4F]' : 'bg-[#0F0F0F]'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
