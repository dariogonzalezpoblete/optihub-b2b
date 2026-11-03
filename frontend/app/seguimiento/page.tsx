"use client";

import React, { useState } from 'react';
import { 
  Package, 
  Plane, 
  Search, 
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  ArrowRight 
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import OrderTrackingTimeline from '@/components/orders/OrderTrackingTimeline';

/**
 * Columnas mínimas necesarias para el seguimiento (timeline y cabecera).
 * No incluye datos personales, de facturación, de pago ni campos internos.
 */
const TRACKING_ORDER_COLUMNS =
  'id, status, payment_status, created_at, notes, shipping_provider, tracking_number';

export default function SeguimientoPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<null | any>(null);
  const [error, setError] = useState('');
  const { isLoggedIn, user } = useAuth();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    
    if (!isLoggedIn) {
      setError("Debe iniciar sesión con su cuenta de óptica para rastrear su pedido por seguridad.");
      return;
    }

    setIsSearching(true);
    setError('');
    setTrackedOrder(null);
    
    try {
      const { data, error: sbError } = await supabase
        .from('orders')
        .select(TRACKING_ORDER_COLUMNS)
        .eq('id', orderNumber.trim())
        .eq('user_id', user?.id ?? '')
        .single();

      if (sbError || !data) {
        setError("Pedido no encontrado. Verifique el ID de orden o asegúrese de haber iniciado sesión con la cuenta titular.");
      } else {
        setTrackedOrder(data);
      }
    } catch {
      setError("Ocurrió un error al consultar el estado del pedido.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] pb-24">
      {/* Header Tracker */}
      <div className="bg-[#FFFFFF] border-b border-[#E6E2DD] pb-14 pt-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-16 opacity-[0.04] pointer-events-none">
          <Plane className="w-80 h-80 text-[#0F0F0F] -rotate-12" />
        </div>
        
        <div className="max-w-3xl mx-auto px-4 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#F7F3EB] border border-[#9E8256]/30 text-[#846C44] text-[10px] font-mono uppercase tracking-[0.2em] mb-4">
            <ShieldCheck className="w-3.5 h-3.5 text-[#9E8256]" />
            Seguimiento Logístico Mayorista B2B
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#0F0F0F] mb-4 tracking-tight">
            Rastreo de Importación USA–Chile
          </h1>
          <p className="text-xs sm:text-sm text-[#5C5A55] mb-8 max-w-xl mx-auto leading-relaxed">
            Ingrese el código identificador (UUID) de su orden mayorista para consultar la etapa logística en tiempo real.
          </p>

          <form onSubmit={handleSearch} className="max-w-xl mx-auto flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#787670] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Ej: 123e4567-e89b-12d3-a456-426614174000"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] py-3.5 pl-11 pr-4 text-xs sm:text-sm font-mono text-[#0F0F0F] placeholder-[#787670] outline-none transition"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="bg-[#0F0F0F] hover:bg-[#262626] text-white text-[11px] uppercase tracking-[0.18em] font-medium px-6 py-3.5 transition flex items-center justify-center gap-2 disabled:opacity-50 border border-[#0F0F0F] cursor-pointer shrink-0"
            >
              {isSearching ? 'Consultando...' : 'Rastrear'}
              {!isSearching && <ArrowRight className="w-4 h-4 text-[#9E8256]" />}
            </button>
          </form>

          {error && (
            <div className="mt-6 flex items-center justify-center gap-2 text-[#9E3838] bg-[#FAF4F4] py-3 px-5 max-w-xl mx-auto border border-[#E6D0D0] text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Resultados del Tracker */}
      <div className="max-w-4xl mx-auto px-4 mt-10">
        {trackedOrder && (
          <div className="space-y-8 animate-fade-in">
            {/* Info Tarjeta */}
            <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <p className="text-[10px] font-mono font-semibold text-[#9E8256] mb-1 uppercase tracking-[0.2em]">
                  Orden Mayorista Localizada
                </p>
                <h2 className="font-serif text-2xl sm:text-3xl font-normal text-[#0F0F0F] font-mono">
                  #{trackedOrder.id.split('-')[0].toUpperCase()}
                </h2>
                <p className="text-xs text-[#5C5A55] mt-2 flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#9E8256]" />
                  Estado Operativo: <span className="text-[#0F0F0F] font-semibold uppercase font-mono">{trackedOrder.status}</span>
                </p>
              </div>
              
              <div className="text-left md:text-right border-t md:border-t-0 border-[#E6E2DD] pt-4 md:pt-0 w-full md:w-auto">
                <p className="text-[10px] text-[#787670] uppercase tracking-wider font-medium mb-1">Fecha de Emisión</p>
                <p className="text-sm font-semibold text-[#0F0F0F] font-mono">
                  {new Date(trackedOrder.created_at).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Stages B2B de Importación Directa (5 Fases) */}
            <OrderTrackingTimeline 
              order={trackedOrder}
              onOrderUpdated={(updated) => setTrackedOrder(updated)}
            />
            
            <div className="text-center pt-2">
              <Link
                href={`/mis-pedidos/${trackedOrder.id}`}
                className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] font-medium text-[#0F0F0F] hover:text-[#9E8256] border border-[#0F0F0F] px-6 py-3 transition"
              >
                <span>Ver detalle de productos y facturación</span>
                <ChevronRight className="w-4 h-4 text-[#9E8256]" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
