"use client";

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Package, Clock, ChevronLeft, MapPin, Building2, CreditCard, ShoppingBag, Truck, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { Order, OrderItem } from '@/lib/catalog/types';
import OrderTrackingTimeline from '@/components/orders/OrderTrackingTimeline';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const orderId = unwrappedParams.id;
  const { user, session, isLoggedIn } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOrderDetail = async () => {
      if (!session?.access_token) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        const json = await res.json();

        if (!res.ok || json.error) {
          if (res.status === 401) {
            router.push('/login?redirect=/mis-pedidos/' + orderId);
            return;
          }
          setError(json.error || 'Pedido no encontrado o no tienes permisos para verlo.');
          setLoading(false);
          return;
        }

        setOrder(json.order);
        setItems(json.items || []);
        setIsAdmin(Boolean(json.isAdmin));
      } catch (err) {
        console.error(err);
        setError('Ocurrió un error al cargar el pedido.');
      } finally {
        setLoading(false);
      }
    };

    if (isLoggedIn === false) {
      router.push('/login?redirect=/mis-pedidos/' + orderId);
    } else if (isLoggedIn && session?.access_token) {
      fetchOrderDetail();
    }
  }, [isLoggedIn, session?.access_token, orderId, router]);

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

  if (loading) {
    return (
      <main className="min-h-screen pt-24 pb-20 bg-slate-950">
        <div className="max-w-4xl mx-auto px-4">
          <div className="h-8 bg-slate-900 rounded w-1/4 animate-pulse mb-8" />
          <div className="h-64 bg-slate-900 rounded-2xl animate-pulse" />
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen pt-24 pb-20 bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Pedido no encontrado</h1>
            <p className="text-slate-400 mb-8">{error}</p>
            <Link 
              href="/mis-pedidos"
              className="inline-flex items-center gap-2 bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-700 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Volver a mis pedidos
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-20 bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <Link 
          href="/mis-pedidos"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-emerald-400 mb-8 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a mis pedidos
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3">
              Pedido #{order.id.split('-')[0].toUpperCase()}
            </h1>
            <p className="text-slate-400 mt-2 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Realizado el {new Date(order.created_at).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex gap-3">
            <div className={`px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 ${getStatusColor(order.status)}`}>
              <Package className="w-4 h-4" />
              {getStatusLabel(order.status)}
            </div>
            {order.payment_status === 'approved' && (
              <div className="px-4 py-2 rounded-xl border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-sm font-bold flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Pago Aprobado
              </div>
            )}
          </div>
        </div>

        {order.status === 'requires_attention' && (
          <div className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div className="text-sm">
              <p className="font-bold text-white">Pago recibido. Pedido en revisión operativa de inventario.</p>
              <p className="text-amber-200/80 mt-1">Tu pago fue confirmado por Mercado Pago. Nuestro equipo está coordinando la disponibilidad de bodega para preparar tu despacho o contactarte a la brevedad.</p>
            </div>
          </div>
        )}

        {/* Módulo Interactivo de Seguimiento de Importación de 5 Fases */}
        <div className="mb-8">
          <OrderTrackingTimeline 
            order={order}
            onOrderUpdated={(updated) => setOrder(updated)}
            isAdmin={isAdmin}
          />
        </div>

        {/* Ficha de Gestión de Cliente para el Administrador */}
        {isAdmin && (
          <div className="mb-8 p-6 rounded-2xl bg-slate-900 border border-emerald-500/30">
            <div className="flex items-center gap-2 mb-4 text-emerald-400 font-bold text-sm uppercase tracking-wider">
              <Building2 className="w-4 h-4" />
              Ficha del Cliente Óptico (Para Compra en Proveedor NYWD y Facturación)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-500 font-semibold block mb-1">Razón Social / Óptica</span>
                <span className="font-bold text-white text-base">{order.business_name || 'No informada'}</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-500 font-semibold block mb-1">RUT Empresa</span>
                <span className="font-bold text-white font-mono text-base">{order.business_rut || 'No informado'}</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-500 font-semibold block mb-1">Contacto Directo</span>
                <span className="font-bold text-white block">{order.customer_name || 'Cliente'}</span>
                <span className="text-xs text-slate-400 block mt-0.5">{order.customer_phone || order.customer_email}</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-500 font-semibold block mb-1">Destino Despacho</span>
                <span className="font-bold text-white block">{order.shipping_commune || 'Comuna'}</span>
                <span className="text-xs text-slate-400 block mt-0.5">{order.shipping_address || 'Dirección no indicada'}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Detalles de productos (Snapshot histórico) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-400" />
                  Productos
                </h2>
              </div>
              <div className="divide-y divide-slate-800">
                {items.length === 0 ? (
                  <p className="p-6 text-slate-400">No hay productos en este pedido.</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="p-6 flex flex-col sm:flex-row gap-6">
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-white text-lg">{item.product_name}</h3>
                          <span className="font-bold text-white bg-slate-800 px-3 py-1 rounded-lg">x{item.quantity}</span>
                        </div>
                        <p className="text-sm font-semibold text-emerald-400/80 uppercase tracking-wider">{item.brand_name}</p>
                        <p className="text-xs text-slate-500 font-mono">SKU: {item.sku}</p>
                      </div>
                      <div className="text-left sm:text-right pt-2 sm:pt-0">
                        <p className="text-xs text-slate-500 font-semibold mb-1">Subtotal Neto</p>
                        <p className="font-black text-white">${item.subtotal_net.toLocaleString('es-CL')}</p>
                        <p className="text-xs text-slate-500 mt-1">@ ${item.unit_price_net.toLocaleString('es-CL')} c/u</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Resumen Financiero e Info */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-6">Resumen de Compra</h2>
              
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Subtotal Neto</span>
                  <span className="text-white font-semibold">${order.subtotal_net.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">IVA (19%)</span>
                  <span className="text-white font-semibold">${order.tax_amount.toLocaleString('es-CL')}</span>
                </div>
                {order.shipping_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Envío</span>
                    <span className="text-white font-semibold">${order.shipping_amount.toLocaleString('es-CL')}</span>
                  </div>
                )}
                
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold">Total a Pagar</span>
                    <span className="text-2xl font-black text-emerald-400">${order.total_amount.toLocaleString('es-CL')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                Datos de Facturación
              </h2>
              <div className="space-y-2 text-sm text-slate-400">
                <p><span className="text-slate-500">RUT:</span> {order.business_rut || 'No especificado'}</p>
                <p><span className="text-slate-500">Razón Social:</span> {order.business_name || 'No especificada'}</p>
                <p><span className="text-slate-500">Giro:</span> Venta al por mayor de artículos ópticos</p>
                <p><span className="text-slate-500">Dirección:</span> {order.billing_address || 'No especificada'}</p>
              </div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-500" />
                Dirección de Envío
              </h2>
              <div className="text-sm text-slate-400">
                <p>{order.shipping_address || 'No especificada'}</p>
                <p>{order.shipping_commune}{order.shipping_region ? `, ${order.shipping_region}` : ''}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
