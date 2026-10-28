"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  Package,
  Clock,
  ChevronRight,
  ShoppingBag,
  Truck,
  ChevronLeft,
  Plane,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Receipt,
  ArrowRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Order } from '@/lib/catalog/types';
import { parseOrderTracking } from '@/lib/trackingUtils';

export default function MisPedidosPage() {
  const { user, session, isLoggedIn } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchOrders = useCallback(async (currentPage: number) => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        if (res.status === 401) {
          router.push('/login?redirect=/mis-pedidos');
          return;
        }
        console.error("Error fetching orders:", json.error);
        setOrders([]);
        setTotal(0);
      } else {
        const fetchedOrders: Order[] = json.orders || [];
        setOrders(fetchedOrders);
        setTotal(fetchedOrders.length);
        setIsAdmin(Boolean(json.isAdmin));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, router]);

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/login?redirect=/mis-pedidos');
    } else if (isLoggedIn && session?.access_token) {
      fetchOrders(page);
    }
  }, [isLoggedIn, session?.access_token, page, router, fetchOrders]);

  if (!isLoggedIn || !user) {
    return (
      <div className="min-h-screen pt-28 pb-16 flex items-center justify-center bg-[#FAF9F6]">
        <div className="animate-pulse flex items-center gap-3 text-[#7A7873] text-sm">
          <Clock className="w-4 h-4 text-[#846C44]" />
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
      requires_attention: 'En Revisión',
    };
    return map[status] || status;
  };

  const getStatusBadgeClass = (status: string) => {
    if (['delivered'].includes(status)) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (['paid', 'preparing', 'shipped'].includes(status)) {
      return 'bg-blue-50 text-blue-800 border-blue-200';
    }
    if (['cancelled', 'refunded'].includes(status)) {
      return 'bg-rose-50 text-rose-800 border-rose-200';
    }
    if (['requires_attention'].includes(status)) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    return 'bg-[#FAF6EF] text-[#846C44] border-[#EADFC9]';
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <main className="min-h-screen pt-28 pb-24 bg-[#FAF9F6]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Encabezado Editorial */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-8 border-b border-[#E6E2DD]">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EF] border border-[#EADFC9] text-[#846C44] text-[11px] font-semibold uppercase tracking-[0.18em] mb-3">
              <Package className="w-3.5 h-3.5" />
              <span>{isAdmin ? 'Panel Maestro' : 'Gestión B2B'}</span>
            </div>
            
            <h1 className="font-editorial font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#0F0F0F] tracking-tight">
              {isAdmin ? 'Gestión Maestra de Pedidos' : 'Mis Pedidos Mayoristas'}
            </h1>
            
            <p className="text-[#575551] text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
              {isAdmin 
                ? 'Supervisión centralizada de compras mayoristas, seguimiento logístico desde origen y despacho a ópticas en Chile.' 
                : 'Consulte el estado en tiempo real de sus importaciones, detalle de facturación electrónica y guías de transporte.'}
            </p>
          </div>

          {isAdmin && (
            <div className="shrink-0 px-4 py-2 rounded-xl bg-[#FFFFFF] border border-[#E6E2DD] text-[#0F0F0F] text-xs font-semibold uppercase tracking-wider flex items-center gap-2.5 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-[#846C44]" />
              <span>Acceso Administrador (Todas las Ópticas)</span>
            </div>
          )}
        </div>

        {/* Estado de Carga */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div 
                key={i} 
                className="h-36 bg-[#FFFFFF] rounded-2xl animate-pulse border border-[#E6E2DD]" 
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          /* Estado Vacío */
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-3xl p-12 sm:p-16 text-center max-w-xl mx-auto shadow-sm">
            <div className="w-20 h-20 bg-[#FAF9F6] border border-[#E6E2DD] rounded-2xl flex items-center justify-center mx-auto mb-6 text-[#846C44]">
              <ShoppingBag className="w-10 h-10" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#846C44] block mb-2">
              Sin Órdenes Registradas
            </span>
            <h2 className="font-editorial font-serif text-2xl sm:text-3xl font-semibold text-[#0F0F0F] mb-3">
              No registra pedidos aún
            </h2>
            <p className="text-[#575551] text-sm mb-8 leading-relaxed">
              Cuando realice su primera compra mayorista de armazones, podrá revisar aquí todo el detalle de facturación electrónica SII y el seguimiento del embarque.
            </p>
            <Link 
              href="/catalogo"
              className="inline-flex items-center gap-2 bg-[#0F0F0F] hover:bg-[#222222] text-[#FFFFFF] px-7 py-3.5 rounded-xl font-semibold text-xs uppercase tracking-widest transition shadow-sm"
            >
              <span>Explorar Catálogo</span>
              <ArrowRight className="w-4 h-4 text-[#9E8256]" />
            </Link>
          </div>
        ) : (
          /* Listado de Pedidos */
          <div className="space-y-5">
            {orders.map((order) => {
              const tracking = parseOrderTracking(order);

              return (
                <div 
                  key={order.id} 
                  className="bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#C8C5BD] rounded-2xl p-6 transition-all duration-200 group shadow-sm hover:shadow-md"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-3.5 flex-1">
                      
                      {/* Fila Superior: Referencia + Estado + Etapa */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm font-bold text-[#0F0F0F] font-mono tracking-tight bg-[#FAF9F6] border border-[#E6E2DD] px-3 py-1 rounded-lg">
                          #{order.id.split('-')[0].toUpperCase()}
                        </span>

                        <span className={`px-3 py-1 text-[11px] font-semibold rounded-lg border uppercase tracking-wider ${getStatusBadgeClass(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                        
                        {/* Píldora de Etapa de Importación */}
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FAF6EF] border border-[#EADFC9] text-[#846C44] text-[11px] font-semibold">
                          {tracking.currentStageKey === 'logistica_usa' && <Building2 className="w-3.5 h-3.5" />}
                          {tracking.currentStageKey === 'viajando' && <Plane className="w-3.5 h-3.5" />}
                          {tracking.currentStageKey === 'desaduanamiento' && <ShieldCheck className="w-3.5 h-3.5" />}
                          {tracking.currentStageKey === 'reparto_chile' && <Truck className="w-3.5 h-3.5" />}
                          {tracking.currentStageKey === 'entregado' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span>Paso {tracking.currentStep}/5: {tracking.stageInfo.label}</span>
                        </div>

                        {tracking.trackingNumber && (
                          <span className="px-3 py-1 text-[11px] font-mono font-medium rounded-lg bg-[#FAF9F6] border border-[#E6E2DD] text-[#575551]">
                            {tracking.courier ? `${tracking.courier}: ` : 'Guía: '}{tracking.trackingNumber}
                          </span>
                        )}
                      </div>

                      {/* Información de Cliente Óptico (Vista Administrador) */}
                      {isAdmin && (
                        <div className="p-3.5 bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#575551]">
                          <span className="font-semibold text-[#0F0F0F] flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-[#846C44]" />
                            {order.business_name || 'Óptica Cliente'}
                          </span>
                          {order.business_rut && (
                            <span className="font-mono">
                              RUT: <strong className="text-[#0F0F0F]">{order.business_rut}</strong>
                            </span>
                          )}
                          {(order.customer_name || order.customer_phone || order.customer_email) && (
                            <span>
                              Contacto: <strong className="text-[#0F0F0F]">{order.customer_name}</strong> {order.customer_phone ? `(${order.customer_phone})` : order.customer_email ? `(${order.customer_email})` : ''}
                            </span>
                          )}
                          {order.shipping_commune && (
                            <span>
                              Destino: <strong className="text-[#0F0F0F]">{order.shipping_commune}</strong>{order.shipping_region ? `, ${order.shipping_region}` : ''}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Metadatos Rápidos */}
                      <div className="flex flex-wrap items-center gap-5 text-xs text-[#7A7873]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#846C44]" />
                          <span>{new Date(order.created_at).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-[#846C44]" />
                          <span>{order.total_amount > 0 ? 'Compra Mayorista' : 'Cotización'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[#575551]">
                          <Receipt className="w-3.5 h-3.5 text-[#846C44]" />
                          <span>Factura Electrónica SII</span>
                        </div>
                        <div className="text-[#846C44] font-medium">
                          {tracking.stageInfo.location}
                        </div>
                      </div>
                    </div>

                    {/* Lado Derecho: Monto y Acción */}
                    <div className="flex items-center justify-between lg:justify-end gap-6 pt-4 lg:pt-0 border-t lg:border-t-0 border-[#E6E2DD]">
                      <div className="text-left lg:text-right">
                        <span className="text-[10px] font-semibold text-[#7A7873] uppercase tracking-[0.16em] block">
                          Total Facturado (IVA incl.)
                        </span>
                        <span className="text-xl sm:text-2xl font-bold font-mono text-[#0F0F0F]">
                          ${order.total_amount.toLocaleString('es-CL')}
                        </span>
                      </div>
                      
                      <Link 
                        href={`/mis-pedidos/${order.id}`}
                        className="inline-flex items-center justify-center gap-2 bg-[#FAF9F6] group-hover:bg-[#0F0F0F] text-[#0F0F0F] group-hover:text-[#FFFFFF] border border-[#E6E2DD] group-hover:border-[#0F0F0F] px-4 py-3 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all duration-200 shadow-sm"
                      >
                        <span className="hidden sm:inline">Detalle</span>
                        <ChevronRight className="w-4 h-4 text-[#846C44] group-hover:text-[#9E8256]" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-10 pt-6 border-t border-[#E6E2DD]">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#FFFFFF] border border-[#E6E2DD] text-[#0F0F0F] rounded-xl disabled:opacity-40 hover:bg-[#FAF9F6] transition font-semibold text-xs uppercase tracking-wider shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4 text-[#846C44]" />
                  <span>Anterior</span>
                </button>
                <span className="text-xs text-[#575551] font-medium">
                  Página <strong className="text-[#0F0F0F]">{page}</strong> de {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#FFFFFF] border border-[#E6E2DD] text-[#0F0F0F] rounded-xl disabled:opacity-40 hover:bg-[#FAF9F6] transition font-semibold text-xs uppercase tracking-wider shadow-sm"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-4 h-4 text-[#846C44]" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
