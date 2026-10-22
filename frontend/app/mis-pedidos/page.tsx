"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Package, Clock, ExternalLink, ChevronRight, AlertCircle, ShoppingBag, Truck, ChevronLeft, Plane, Building2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { Order } from '@/lib/catalog/types';
import { parseOrderTracking } from '@/lib/trackingUtils';

export default function MisPedidosPage() {
  const { user, isLoggedIn } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchOrders = useCallback(async (currentPage: number) => {
    if (!user) return;
    setLoading(true);
    try {
      const offset = (currentPage - 1) * limit;
      
      // Mostrar exclusivamente pedidos realizados y confirmados (no cancelados ni abandonados)
      const { data, count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching orders:", error);
      } else {
        // Filtrar sesiones de checkout abandonadas sin pago ni confirmación
        const validOrders = (data || []).filter(order => 
          order.status !== 'cancelled' && 
          !(order.status === 'pending' && order.payment_status === 'pending')
        );
        setOrders(validOrders);
        setTotal(validOrders.length);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/login?redirect=/mis-pedidos');
    } else if (isLoggedIn && user) {
      fetchOrders(page);
    }
  }, [isLoggedIn, user, page, router, fetchOrders]);

  if (!isLoggedIn || !user) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center bg-slate-950">
        <div className="animate-pulse flex items-center gap-2 text-slate-400">
          <Clock className="w-5 h-5" />
          <span>Verificando sesión...</span>
        </div>
      </div>
    );
  }

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: 'Pendiente',
      payment_pending: 'Pago Pendiente',
      paid: 'Pagado',
      preparing: 'En Preparación',
      shipped: 'Enviado',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
      refunded: 'Reembolsado',
      requires_attention: 'En Revisión (Stock)',
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    if (['delivered'].includes(status)) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (['paid', 'preparing', 'shipped'].includes(status)) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (['cancelled', 'refunded'].includes(status)) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    if (['requires_attention'].includes(status)) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <main className="min-h-screen pt-24 pb-20 bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Package className="w-8 h-8 text-emerald-400" />
            Mis Pedidos B2B
          </h1>
          <p className="text-slate-400 mt-2">
            Historial de compras y estado de tus importaciones.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-slate-900/50 rounded-2xl animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="w-10 h-10 text-slate-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No tienes pedidos aún</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Cuando realices tu primera compra al por mayor, aparecerá aquí con todo el detalle de facturación y seguimiento.
            </p>
            <Link 
              href="/catalogo"
              className="inline-flex items-center gap-2 bg-emerald-500 text-slate-950 px-6 py-3 rounded-xl font-bold hover:bg-emerald-400 transition"
            >
              Explorar Catálogo
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const tracking = parseOrderTracking(order);

              return (
                <div 
                  key={order.id} 
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 transition-all group"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-lg font-black text-white font-mono">
                          #{order.id.split('-')[0].toUpperCase()}
                        </span>
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                        
                        {/* Píldora de Etapa de Importación */}
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                          {tracking.currentStageKey === 'logistica_usa' && <Building2 className="w-3.5 h-3.5" />}
                          {tracking.currentStageKey === 'viajando' && <Plane className="w-3.5 h-3.5" />}
                          {tracking.currentStageKey === 'desaduanamiento' && <ShieldCheck className="w-3.5 h-3.5" />}
                          {tracking.currentStageKey === 'reparto_chile' && <Truck className="w-3.5 h-3.5" />}
                          {tracking.currentStageKey === 'entregado' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span>Paso {tracking.currentStep}/5: {tracking.stageInfo.label}</span>
                        </div>

                        {tracking.trackingNumber && (
                          <span className="px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                            {tracking.courier ? `${tracking.courier}: ` : ''}{tracking.trackingNumber}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {new Date(order.created_at).toLocaleDateString('es-CL')}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Package className="w-4 h-4" />
                          {order.total_amount > 0 ? 'Pedido B2B' : 'Cotización'}
                        </div>
                        <div className="text-xs text-slate-400">
                          {tracking.stageInfo.location}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
                      <div className="text-left md:text-right">
                        <p className="text-xs text-slate-500 font-semibold mb-0.5 uppercase tracking-wider">Total (Neto + IVA)</p>
                        <p className="text-xl font-black text-white">
                          ${order.total_amount.toLocaleString('es-CL')}
                        </p>
                      </div>
                      
                      <Link 
                        href={`/mis-pedidos/${order.id}`}
                        className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg disabled:opacity-50 hover:bg-slate-700 transition font-bold text-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </button>
                <span className="text-sm text-slate-400 font-semibold">
                  Página <span className="text-white">{page}</span> de {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg disabled:opacity-50 hover:bg-slate-700 transition font-bold text-sm"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
