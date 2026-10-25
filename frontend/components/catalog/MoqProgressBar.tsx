'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingBag, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
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
  const cartUnits = useCartStore((state) =>
    state.cart.reduce((sum, item) => sum + (item.cantidad || 0), 0)
  );
  const getMontoNeto = useCartStore((state) => state.getMontoNeto);
  const clearCart = useCartStore((state) => state.clearCart);

  const target = 10;
  const current = cartUnits;
  const isReached = current >= target;
  const remaining = Math.max(0, target - current);
  const progressPercent = Math.min(100, Math.round((current / target) * 100));
  const montoNeto = getMontoNeto();

  if (variant === 'floating') {
    if (current === 0) return null;

    return (
      <div className={`fixed bottom-0 left-0 right-0 z-40 bg-[#111111]/95 backdrop-blur-md border-t border-[#242424] text-white shadow-2xl p-4 transition-all duration-300 ${className}`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Info izquierda */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-12 h-12 rounded-xl bg-[#242424] border border-[#3A3936] text-[#B89768] flex items-center justify-center flex-shrink-0 shadow-inner">
              <ShoppingBag className="w-6 h-6 stroke-[1.8]" />
            </div>

            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-3">
                <span className="font-editorial text-xl font-semibold tracking-wide text-white">
                  Orden B2B
                </span>
                <span className="font-tech text-xs bg-[#242424] text-[#B89768] border border-[#B89768]/30 px-2.5 py-0.5 rounded">
                  {current} {current === 1 ? 'unidad' : 'unidades'}
                </span>
                {isLoggedIn && montoNeto > 0 && (
                  <span className="font-tech text-xs text-[#E5E4DF]">
                    • ${montoNeto.toLocaleString('es-CL')} CLP Neto
                  </span>
                )}
              </div>

              <div className="text-xs text-[#82807A]">
                {isReached ? (
                  <span className="text-[#C9AD82] font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#B89768]" />
                    Mínimo de 10 unidades cumplido • Listo para consolidación e importación
                  </span>
                ) : (
                  <span>
                    Faltan <strong className="text-white font-tech">{remaining}</strong> {remaining === 1 ? 'armazón' : 'armazones'} para completar el mínimo mayorista (10 un.)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Barra central de precisión */}
          <div className="w-full md:w-80 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[11px] font-tech text-[#82807A]">
              <span>Progreso MOQ</span>
              <span className="text-[#B89768] font-bold">{progressPercent}% ({current}/10)</span>
            </div>
            <div className="w-full h-2 bg-[#242424] rounded-full overflow-hidden p-0.5 border border-[#3A3936]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isReached
                    ? 'bg-gradient-to-r from-[#9E7D4F] via-[#B89768] to-[#C9AD82]'
                    : 'bg-gradient-to-r from-[#9E7D4F] to-[#B89768]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Botones de acción derecha */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={() => clearCart()}
              className="text-xs text-[#82807A] hover:text-[#C0392B] px-3 py-2 transition tracking-wider uppercase font-semibold"
            >
              Vaciar
            </button>
            <Link
              href="/carrito"
              className="btn-champagne text-xs py-3 px-6 shadow-lg shadow-[#B89768]/15"
            >
              <span>Revisar Orden</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

        </div>
      </div>
    );
  }

  // Variant 'banner' o 'card':
  return (
    <div className={`bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-5 shadow-sm ${className}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FAF9F6] border border-[#E5E4DF] text-[#111111] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-[#B89768]" />
          </div>
          <div>
            <h4 className="font-editorial text-lg font-semibold text-[#111111] leading-tight">
              Control de Compra Mínima Mayorista (MOQ)
            </h4>
            <p className="text-xs text-[#575551]">
              10 unidades combinables entre cualquier marca para activar importación directa desde USA.
            </p>
          </div>
        </div>

        <div className="text-right flex items-center gap-2 self-end sm:self-auto">
          <span className="font-tech text-xs text-[#82807A]">Estado:</span>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            isReached
              ? 'bg-[#F7F3EB] text-[#9E7D4F] border-[#B89768]/40'
              : 'bg-[#FAF9F6] text-[#575551] border-[#E5E4DF]'
          }`}>
            {isReached ? 'Mínimo Cumplido' : `Faltan ${remaining} un.`}
          </span>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs font-tech">
          <span className="text-[#575551]">
            <strong className="text-[#111111]">{current}</strong> de <strong className="text-[#111111]">10</strong> armazones
          </span>
          <span className="text-[#B89768] font-bold">{progressPercent}%</span>
        </div>
        <div className="w-full h-2.5 bg-[#FAF9F6] rounded-full overflow-hidden border border-[#E5E4DF] p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isReached
                ? 'bg-gradient-to-r from-[#9E7D4F] to-[#B89768]'
                : 'bg-[#B89768]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
