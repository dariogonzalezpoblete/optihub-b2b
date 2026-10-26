"use client";

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { 
  Package, 
  Clock, 
  ChevronLeft, 
  MapPin, 
  Building2, 
  CreditCard, 
  ShoppingBag, 
  AlertCircle,
  Receipt,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { useRouter } from 'next/navigation';
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
          setError(json.error || 'Pedido no encontrado o no tiene permisos para verlo.');
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
      <div className="min-h-screen pt-28 pb-16 flex items-center justify-center bg-[#FAF9F6]">
        <div className="animate-pulse flex items-center gap-3 text-[#7A7873] text-sm">
          <Clock className="w-4 h-4 text-[#9E7D4F]" />
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
    return 'bg-[#FAF6EF] text-[#9E7D4F] border-[#EADFC9]';
  };

  if (loading) {
    return (
      <main className="min-h-screen pt-28 pb-20 bg-[#FAF9F6]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="h-6 bg-[#FFFFFF] rounded w-48 animate-pulse border border-[#E5E4DF]" />
          <div className="h-48 bg-[#FFFFFF] rounded-3xl animate-pulse border border-[#E5E4DF]" />
          <div className="h-72 bg-[#FFFFFF] rounded-3xl animate-pulse border border-[#E5E4DF]" />
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen pt-28 pb-20 bg-[#FAF9F6]">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-12 shadow-sm">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h1 className="font-editorial font-serif text-2xl font-semibold text-[#111111] mb-2">
              Pedido no encontrado
            </h1>
            <p className="text-[#575551] text-sm mb-8 leading-relaxed">{error}</p>
            <Link 
              href="/mis-pedidos"
              className="inline-flex items-center gap-2 bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] px-6 py-3 rounded-xl font-semibold text-xs uppercase tracking-widest transition shadow-sm"
            >
              <ChevronLeft className="w-4 h-4 text-[#B89768]" />
              <span>Volver a mis pedidos</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-28 pb-24 bg-[#FAF9F6]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Enlace Volver */}
        <Link 
          href="/mis-pedidos"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#7A7873] hover:text-[#111111] mb-8 transition"
        >
          <ChevronLeft className="w-4 h-4 text-[#9E7D4F]" />
          <span>Volver a Mis Pedidos</span>
        </Link>

        {/* Encabezado Principal */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pb-8 border-b border-[#E5E4DF]">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EF] border border-[#EADFC9] text-[#9E7D4F] text-[10px] font-semibold uppercase tracking-[0.18em] mb-2">
              <Package className="w-3.5 h-3.5" />
              <span>Orden de Compra Mayorista</span>
            </div>
            
            <h1 className="font-editorial font-serif text-3xl sm:text-4xl font-semibold text-[#111111] tracking-tight">
              Pedido #{order.id.split('-')[0].toUpperCase()}
            </h1>
            
            <p className="text-xs sm:text-sm text-[#575551] mt-2 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#9E7D4F]" />
              <span>
                Realizado el {new Date(order.created_at).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${getStatusBadgeClass(order.status)}`}>
              <Package className="w-3.5 h-3.5" />
              <span>{getStatusLabel(order.status)}</span>
            </div>
            
            {order.payment_status === 'approved' && (
              <div className="px-3.5 py-1.5 rounded-xl border bg-emerald-50 text-emerald-800 border-emerald-200 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pago Aprobado (Mercado Pago)</span>
              </div>
            )}
          </div>
        </div>

        {/* Alerta de Conciliación si aplica */}
        {order.status === 'requires_attention' && (
          <div className="mb-8 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3.5 text-xs sm:text-sm shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <div className="space-y-1">
              <strong className="text-[#111111] font-semibold block">
                Pago recibido. Pedido en revisión operativa de inventario.
              </strong>
              <p className="text-[#575551] leading-relaxed">
                Su pago fue confirmado por Mercado Pago. Nuestro equipo de bodega está coordinando el embarque desde origen para despachar su pedido o contactarle a la brevedad.
              </p>
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
          <div className="mb-8 p-6 rounded-3xl bg-[#FAF6EF] border border-[#EADFC9] shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-[#9E7D4F] font-bold text-xs uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Ficha del Cliente Óptico (Para Pedido a USA y Facturación SII)</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="bg-[#FFFFFF] p-4 rounded-2xl border border-[#E5E4DF] shadow-sm">
                <span className="text-[10px] text-[#7A7873] font-semibold uppercase tracking-wider block mb-1">Razón Social / Óptica</span>
                <span className="font-bold text-[#111111] text-sm block line-clamp-1">{order.business_name || 'No informada'}</span>
              </div>
              <div className="bg-[#FFFFFF] p-4 rounded-2xl border border-[#E5E4DF] shadow-sm">
                <span className="text-[10px] text-[#7A7873] font-semibold uppercase tracking-wider block mb-1">RUT Empresa</span>
                <span className="font-mono font-bold text-[#111111] text-sm block">{order.business_rut || 'No informado'}</span>
              </div>
              <div className="bg-[#FFFFFF] p-4 rounded-2xl border border-[#E5E4DF] shadow-sm">
                <span className="text-[10px] text-[#7A7873] font-semibold uppercase tracking-wider block mb-1">Contacto Directo</span>
                <span className="font-bold text-[#111111] text-sm block">{order.customer_name || 'Cliente'}</span>
                <span className="text-[11px] text-[#575551] block mt-0.5">{order.customer_phone || order.customer_email}</span>
              </div>
              <div className="bg-[#FFFFFF] p-4 rounded-2xl border border-[#E5E4DF] shadow-sm">
                <span className="text-[10px] text-[#7A7873] font-semibold uppercase tracking-wider block mb-1">Destino Despacho</span>
                <span className="font-bold text-[#111111] text-sm block">{order.shipping_commune || 'Comuna'}</span>
                <span className="text-[11px] text-[#575551] block mt-0.5 line-clamp-1">{order.shipping_address || 'Dirección no indicada'}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Detalles de productos (Snapshot histórico) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl overflow-hidden shadow-sm">
              <div className="px-6 py-4.5 border-b border-[#E5E4DF] bg-[#FAF9F6] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#111111] uppercase tracking-wider flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#9E7D4F]" />
                  <span>Detalle de Armazones Adquiridos</span>
                </h2>
                <span className="text-xs font-mono text-[#7A7873]">
                  {items.reduce((acc, i) => acc + (i.quantity || 1), 0)} unidades
                </span>
              </div>
              
              <div className="divide-y divide-[#E5E4DF]">
                {items.length === 0 ? (
                  <p className="p-8 text-center text-[#7A7873] text-sm">No hay productos en este pedido.</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:bg-[#FAF9F6]/50 transition">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-[#111111] text-base">{item.product_name}</h3>
                          <span className="text-xs font-bold text-[#111111] bg-[#FAF9F6] border border-[#E5E4DF] px-2.5 py-0.5 rounded-lg">
                            x{item.quantity}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-[#9E7D4F] uppercase tracking-widest">{item.brand_name}</p>
                        <p className="text-xs text-[#7A7873] font-mono">SKU: {item.sku}</p>
                      </div>
                      
                      <div className="text-left sm:text-right pt-2 sm:pt-0">
                        <span className="text-[10px] text-[#7A7873] font-semibold uppercase tracking-wider block mb-0.5">
                          Subtotal Neto
                        </span>
                        <p className="font-bold font-mono text-[#111111] text-base">
                          ${item.subtotal_net.toLocaleString('es-CL')}
                        </p>
                        <p className="text-[11px] text-[#7A7873] mt-0.5">
                          @ ${item.unit_price_net.toLocaleString('es-CL')} c/u
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Resumen Financiero e Información Tributaria */}
          <div className="space-y-6">
            
            {/* Tarjeta de Resumen Financiero */}
            <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-6 shadow-sm">
              <h2 className="text-xs font-bold text-[#111111] uppercase tracking-wider mb-5 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#9E7D4F]" />
                <span>Resumen Financiero</span>
              </h2>
              
              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between items-center text-[#575551]">
                  <span>Subtotal Neto</span>
                  <span className="font-mono font-medium text-[#111111]">${order.subtotal_net.toLocaleString('es-CL')}</span>
                </div>
                
                <div className="flex justify-between items-center text-[#575551]">
                  <span>IVA (19% Chile)</span>
                  <span className="font-mono font-medium text-[#9E7D4F]">${order.tax_amount.toLocaleString('es-CL')}</span>
                </div>
                
                {order.shipping_amount > 0 && (
                  <div className="flex justify-between items-center text-[#575551]">
                    <span>Flete &amp; Seguro</span>
                    <span className="font-mono font-medium text-[#111111]">${order.shipping_amount.toLocaleString('es-CL')}</span>
                  </div>
                )}
                
                <div className="pt-4 border-t border-[#E5E4DF] flex justify-between items-baseline">
                  <span className="text-xs font-semibold text-[#111111] uppercase tracking-wider">Total Facturado</span>
                  <span className="text-xl sm:text-2xl font-bold font-mono text-[#111111]">${order.total_amount.toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>

            {/* Datos de Facturación */}
            <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-6 shadow-sm space-y-3">
              <h2 className="text-xs font-bold text-[#111111] uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-[#E5E4DF]">
                <FileText className="w-4 h-4 text-[#9E7D4F]" />
                <span>Datos de Facturación SII</span>
              </h2>
              
              <div className="space-y-2 text-xs text-[#575551]">
                <p><span className="text-[#7A7873]">RUT:</span> <strong className="text-[#111111] font-mono">{order.business_rut || 'No especificado'}</strong></p>
                <p><span className="text-[#7A7873]">Razón Social:</span> <strong className="text-[#111111]">{order.business_name || 'No especificada'}</strong></p>
                <p><span className="text-[#7A7873]">Giro:</span> Venta al por mayor de artículos ópticos</p>
                <p><span className="text-[#7A7873]">Dirección:</span> {order.billing_address || 'No especificada'}</p>
              </div>
            </div>
            
            {/* Dirección de Envío */}
            <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-6 shadow-sm space-y-3">
              <h2 className="text-xs font-bold text-[#111111] uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-[#E5E4DF]">
                <MapPin className="w-4 h-4 text-[#9E7D4F]" />
                <span>Dirección de Despacho en Chile</span>
              </h2>
              
              <div className="text-xs text-[#575551] space-y-1">
                <p className="font-semibold text-[#111111]">{order.shipping_address || 'Dirección de entrega coordinada'}</p>
                <p>{order.shipping_commune}{order.shipping_region ? `, ${order.shipping_region}` : ''}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
