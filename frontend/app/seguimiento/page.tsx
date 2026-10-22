"use client";

import React, { useState } from 'react';
import { 
  Package, 
  Plane, 
  CheckCircle2, 
  Search, 
  MapPin, 
  Building2, 
  Truck, 
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  ArrowRight 
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import OrderTrackingTimeline from '@/components/orders/OrderTrackingTimeline';

export default function SeguimientoPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<null | any>(null);
  const [error, setError] = useState('');
  const { isLoggedIn } = useAuth();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    
    if (!isLoggedIn) {
      setError("Debes iniciar sesión para rastrear tu pedido por seguridad.");
      return;
    }

    setIsSearching(true);
    setError('');
    setTrackedOrder(null);
    
    try {
      const { data, error: sbError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderNumber.trim())
        .single();

      if (sbError || !data) {
        setError("Pedido no encontrado. Verifica el ID o asegúrate de haber iniciado sesión con la cuenta correcta.");
      } else {
        setTrackedOrder(data);
      }
    } catch (err) {
      setError("Ocurrió un error al buscar el pedido.");
    } finally {
      setIsSearching(false);
    }
  };

  // Mapear estado real de B2B a Fase de Tracker
  const getCurrentStage = (status: string, payment_status: string) => {
    if (status === 'delivered') return 5;
    if (status === 'shipped') return 4;
    if (status === 'preparing') return 2;
    if (payment_status === 'approved') return 1;
    return 0; // Pendiente de pago / Cancelado
  };

  return (
    <main className="min-h-screen pt-24 pb-20 bg-slate-950">
      {/* Header Tracker */}
      <div className="bg-slate-900 border-b border-slate-800 pb-16 pt-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 opacity-10 pointer-events-none">
          <Plane className="w-96 h-96 text-emerald-500 -rotate-12" />
        </div>
        
        <div className="max-w-3xl mx-auto px-4 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold tracking-wide mb-6">
            <ShieldCheck className="w-4 h-4" />
            Tracker B2B Exclusivo
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight">
            Rastrea tu Importación
          </h1>
          <p className="text-lg text-slate-400 mb-8 max-w-xl mx-auto">
            Ingresa el UUID de tu orden para conocer el estado exacto en tiempo real.
          </p>

          <form onSubmit={handleSearch} className="relative max-w-xl mx-auto">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-6 h-6 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Ej: 123e4567-e89b-12d3-a456-426614174000"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl py-5 pl-14 pr-36 text-lg text-white placeholder-slate-600 outline-none transition-all"
              required
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute inset-y-2 right-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSearching ? 'Buscando...' : 'Rastrear'}
              {!isSearching && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
          {error && (
            <div className="mt-6 flex items-center justify-center gap-2 text-rose-400 bg-rose-500/10 py-3 px-6 rounded-xl max-w-xl mx-auto border border-rose-500/20">
              <AlertCircle className="w-5 h-5" />
              <p className="font-semibold text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Resultados del Tracker */}
      <div className="max-w-4xl mx-auto px-4 mt-12">
        {trackedOrder && (
          <div className="space-y-8 animate-fade-in">
            {/* Info Tarjeta */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <p className="text-sm font-bold text-emerald-400 mb-1 uppercase tracking-wider">Orden Encontrada</p>
                <h2 className="text-2xl font-black text-white font-mono">
                  #{trackedOrder.id.split('-')[0].toUpperCase()}
                </h2>
                <p className="text-slate-400 mt-2 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Estado Interno: <span className="text-white font-bold uppercase">{trackedOrder.status}</span>
                </p>
              </div>
              
              <div className="text-left md:text-right">
                <p className="text-sm text-slate-500 font-semibold mb-1">Fecha de Solicitud</p>
                <p className="text-lg font-bold text-white">
                  {new Date(trackedOrder.created_at).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Stages B2B de Importación Directa (5 Fases) */}
            <OrderTrackingTimeline 
              order={trackedOrder}
              onOrderUpdated={(updated) => setTrackedOrder(updated)}
            />
            
            <div className="text-center pt-4">
              <Link href={`/mis-pedidos/${trackedOrder.id}`} className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-bold transition">
                Ver detalle de productos y facturación <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
