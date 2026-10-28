'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  Package,
  Clock,
  Truck,
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Save,
  CreditCard,
  ExternalLink,
  Plane,
  X,
  MapPin,
  Mail,
  Receipt,
  Eye,
  Check,
  Copy,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import type { Order, OrderItem } from '@/lib/catalog/types';
import {
  IMPORT_STAGES,
  COURIER_OPTIONS,
  parseOrderTracking,
  getCourierTrackingUrl,
  ImportStageKey,
} from '@/lib/trackingUtils';

const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'payment_pending', label: 'Pago Pendiente' },
  { value: 'paid', label: 'Pagado / Confirmado' },
  { value: 'preparing', label: 'En Preparación' },
  { value: 'shipped', label: 'Enviado' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'refunded', label: 'Reembolsado' },
  { value: 'requires_attention', label: 'En Revisión (Stock)' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'rejected', label: 'Rechazado' },
  { value: 'refunded', label: 'Reembolsado' },
];

export default function AdminOrdersPage() {
  const { user, session, isLoggedIn } = useAuth();
  const router = useRouter();

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingOrderItems, setLoadingOrderItems] = useState(false);

  // Edit Order / Customer Tracking State
  const [editStatus, setEditStatus] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [editStage, setEditStage] = useState<ImportStageKey>('logistica_usa');
  const [editCourier, setEditCourier] = useState('Starken');
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editCustomNote, setEditCustomNote] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderToast, setOrderToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedTracking, setCopiedTracking] = useState(false);

  // 1. Fetch Orders from API
  const fetchOrders = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingOrders(true);
    try {
      const res = await fetch('/api/orders', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.orders) {
        setOrders(data.orders);
        setIsAdminUser(Boolean(data.isAdmin));
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  }, [session?.access_token]);

  // Load orders on session ready
  useEffect(() => {
    if (session?.access_token) {
      fetchOrders();
    }
  }, [session?.access_token, fetchOrders]);

  // Open order editor modal
  const handleSelectOrderForEdit = async (ord: Order) => {
    setSelectedOrder(ord);
    setEditStatus(ord.status);
    setEditPaymentStatus(ord.payment_status);

    const parsed = parseOrderTracking(ord);
    setEditStage(parsed.currentStageKey);
    setEditCourier(parsed.courier || ord.shipping_provider || 'Starken');
    setEditTrackingNumber(parsed.trackingNumber || ord.tracking_number || '');
    setEditCustomNote(parsed.customNote || '');
    setOrderToast(null);

    // Fetch order items (SKUs)
    if (session?.access_token) {
      setLoadingOrderItems(true);
      try {
        const res = await fetch(`/api/orders/${ord.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const d = await res.json();
        if (res.ok && d.items) {
          setOrderItems(d.items);
        }
      } catch (e) {
        console.error('Error fetching order items:', e);
      } finally {
        setLoadingOrderItems(false);
      }
    }
  };

  // Save Order & Customer Tracking Changes
  const handleSaveOrderChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !session?.access_token) return;

    setSavingOrder(true);
    setOrderToast(null);

    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          status: editStatus,
          payment_status: editPaymentStatus,
          shipping_provider: editCourier,
          tracking_number: editTrackingNumber,
          stage: editStage,
          customNote: editCustomNote,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al actualizar el seguimiento del pedido');
      }

      setOrderToast({
        type: 'success',
        message: `Seguimiento del Pedido #${selectedOrder.id.split('-')[0].toUpperCase()} actualizado correctamente. El cliente ya puede ver el nuevo estado.`,
      });

      // Update in local state
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? { ...o, ...data.order } : o))
      );
      setSelectedOrder(data.order);

      setTimeout(() => {
        setOrderToast(null);
      }, 4000);
    } catch (err) {
      setOrderToast({ type: 'error', message: (err as Error).message });
    } finally {
      setSavingOrder(false);
    }
  };

  // Copy tracking number to clipboard
  const handleCopyTracking = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  // Filtered orders list
  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      o.id.toLowerCase().includes(q) ||
      (o.business_name && o.business_name.toLowerCase().includes(q)) ||
      (o.business_rut && o.business_rut.toLowerCase().includes(q)) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
      (o.customer_email && o.customer_email.toLowerCase().includes(q)) ||
      (o.shipping_commune && o.shipping_commune.toLowerCase().includes(q)) ||
      (o.tracking_number && o.tracking_number.toLowerCase().includes(q))
    );
  });

  // Calculate stats
  const totalCount = orders.length;
  const paidCount = orders.filter((o) => o.status === 'paid' || o.payment_status === 'approved').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;
  const shippedCount = orders.filter((o) => o.status === 'shipped').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;

  // Status badge styling helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'paid':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'preparing':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'shipped':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'cancelled':
      case 'refunded':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'requires_attention':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-[#FAF6EF] text-[#9E7D4F] border-[#EADFC9]';
    }
  };

  const getStatusText = (status: string) => {
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

  // If user is not logged in or not admin
  if (!isLoggedIn && !loadingOrders) {
    return (
      <main className="min-h-screen pt-28 pb-20 bg-[#FAF9F6]">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#FFFFFF] border border-[#E5E4DF] flex items-center justify-center mx-auto mb-4 text-[#9E7D4F] shadow-sm">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="font-editorial font-serif text-2xl font-bold text-[#111111] mb-2">
            Acceso de Administración
          </h1>
          <p className="text-sm text-[#575551] mb-6">
            Inicia sesión con tu cuenta de administrador autorizada para gestionar los pedidos y despachos a ópticas.
          </p>
          <Link
            href="/login?redirect=/admin"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#111111] text-white text-xs font-semibold tracking-wide hover:bg-[#333333] transition"
          >
            Iniciar Sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-28 pb-24 bg-[#FAF9F6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* ENCABEZADO EDITORIAL */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#E5E4DF]">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EF] border border-[#EADFC9] text-[#9E7D4F] text-[11px] font-semibold uppercase tracking-[0.18em] mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Panel de Control Logístico</span>
            </div>

            <h1 className="font-editorial font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#111111] tracking-tight">
              Gestión y Seguimiento de Pedidos
            </h1>

            <p className="text-[#575551] text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
              Informa a cada óptica y clínica el estado exacto de su importación: avance en Miami, aduana en Santiago, asignación de courier local y entrega final.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchOrders}
              disabled={loadingOrders}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FFFFFF] border border-[#E5E4DF] text-[#111111] text-xs font-medium hover:border-[#82807A] transition shadow-xs disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#9E7D4F] ${loadingOrders ? 'animate-spin' : ''}`} />
              <span>Actualizar Lista</span>
            </button>
            <Link
              href="/mis-pedidos"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#111111] text-white text-xs font-medium hover:bg-[#333333] transition"
            >
              <span>Vista Cliente</span>
              <ExternalLink className="w-3 h-3 text-[#B89768]" />
            </Link>
          </div>
        </div>

        {/* MÉTRICAS RESUMEN */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[11px] font-mono text-[#82807A] uppercase tracking-wider block">Total Pedidos</span>
            <span className="text-2xl font-bold text-[#111111] mt-1 block">{totalCount}</span>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[11px] font-mono text-emerald-700 uppercase tracking-wider block">Pagados / Aprobados</span>
            <span className="text-2xl font-bold text-emerald-700 mt-1 block">{paidCount}</span>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[11px] font-mono text-indigo-700 uppercase tracking-wider block">En Preparación</span>
            <span className="text-2xl font-bold text-indigo-700 mt-1 block">{preparingCount}</span>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[11px] font-mono text-purple-700 uppercase tracking-wider block">En Reparto Courier</span>
            <span className="text-2xl font-bold text-purple-700 mt-1 block">{shippedCount}</span>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-4 text-center shadow-xs col-span-2 sm:col-span-1">
            <span className="text-[11px] font-mono text-[#9E7D4F] uppercase tracking-wider block">Entregados con Éxito</span>
            <span className="text-2xl font-bold text-[#111111] mt-1 block">{deliveredCount}</span>
          </div>
        </div>

        {/* BARRA DE FILTRO Y BÚSQUEDA */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-[#82807A] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por N° Pedido, Razón Social, RUT, Correo o Courier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl text-[#111111] placeholder-[#82807A] focus:outline-none focus:border-[#B89768]"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-semibold text-[#82807A] whitespace-nowrap hidden sm:inline">
              Filtrar por:
            </span>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'paid', label: 'Pagados' },
              { id: 'preparing', label: 'En Preparación' },
              { id: 'shipped', label: 'Enviados' },
              { id: 'delivered', label: 'Entregados' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  statusFilter === f.id
                    ? 'bg-[#111111] text-white shadow-xs'
                    : 'bg-[#FAF9F6] text-[#575551] hover:text-[#111111] border border-[#E5E4DF]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* TABLA PRINCIPAL DE PEDIDOS */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#E5E4DF] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#111111]">
              Listado de Órdenes ({filteredOrders.length})
            </span>
            <span className="text-xs text-[#82807A]">
              Haz clic en cualquier pedido para actualizar su tracking al cliente
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9F6] text-[#82807A] font-mono uppercase tracking-wider border-b border-[#E5E4DF]">
                <tr>
                  <th className="py-3 px-4">Pedido / Fecha</th>
                  <th className="py-3 px-4">Cliente / Óptica</th>
                  <th className="py-3 px-4">Fase de Seguimiento</th>
                  <th className="py-3 px-4">Courier / Guía</th>
                  <th className="py-3 px-4 text-right">Total ($ CLP)</th>
                  <th className="py-3 px-4 text-center">Estado Comercial</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DF]">
                {loadingOrders ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#82807A]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#9E7D4F]" />
                      <span>Cargando pedidos de ópticas...</span>
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#82807A]">
                      No se encontraron pedidos con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord) => {
                    const tracking = parseOrderTracking(ord);
                    const shortId = ord.id.split('-')[0].toUpperCase();
                    const createdDate = ord.created_at
                      ? new Date(ord.created_at).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Reciente';

                    return (
                      <tr
                        key={ord.id}
                        onClick={() => handleSelectOrderForEdit(ord)}
                        className={`cursor-pointer transition hover:bg-[#FAF9F6] ${
                          selectedOrder?.id === ord.id ? 'bg-[#FAF6EF]/60' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-[#111111] block">
                            #{shortId}
                          </span>
                          <span className="text-[11px] text-[#82807A] block mt-0.5">
                            {createdDate}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-[#111111] block">
                            {ord.business_name || ord.customer_name || 'Óptica Mayorista'}
                          </span>
                          <span className="text-[11px] text-[#82807A] block">
                            {ord.business_rut || ord.customer_email || 'Sin RUT'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FAF6EF] text-[#9E7D4F] border border-[#EADFC9]">
                            {tracking.currentStageKey === 'logistica_usa' && <Building2 className="w-3 h-3" />}
                            {tracking.currentStageKey === 'viajando' && <Plane className="w-3 h-3" />}
                            {tracking.currentStageKey === 'desaduanamiento' && <ShieldCheck className="w-3 h-3" />}
                            {tracking.currentStageKey === 'reparto_chile' && <Truck className="w-3 h-3" />}
                            {tracking.currentStageKey === 'entregado' && <CheckCircle2 className="w-3 h-3" />}
                            <span>{tracking.stageInfo.label}</span>
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          {tracking.trackingNumber ? (
                            <div>
                              <span className="font-semibold text-[#111111] block text-[11px]">
                                {tracking.courier || ord.shipping_provider || 'Courier'}
                              </span>
                              <span className="font-mono text-[11px] text-[#9E7D4F] block">
                                {tracking.trackingNumber}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#82807A] italic">
                              Pendiente asignación
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#111111]">
                          ${(ord.total_amount || 0).toLocaleString('es-CL')}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getStatusBadge(
                              ord.status
                            )}`}
                          >
                            {getStatusText(ord.status)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E5E4DF] text-[#111111] text-[11px] font-semibold hover:border-[#B89768] hover:bg-[#FAF6EF] transition"
                          >
                            <span>Actualizar</span>
                            <ChevronRight className="w-3 h-3 text-[#9E7D4F]" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL / PANEL DE EDICIÓN DEL SEGUIMIENTO AL CLIENTE */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl max-w-3xl w-full my-8 p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
              
              {/* Header Modal */}
              <div className="flex items-center justify-between border-b border-[#E5E4DF] pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FAF6EF] border border-[#EADFC9] text-[#9E7D4F] text-[11px] font-semibold uppercase mb-1">
                    <span>Pedido #{selectedOrder.id.split('-')[0].toUpperCase()}</span>
                  </div>
                  <h2 className="font-editorial font-serif text-2xl font-bold text-[#111111]">
                    Informar al Cliente sobre su Pedido
                  </h2>
                  <p className="text-xs text-[#575551] mt-0.5">
                    {selectedOrder.business_name || selectedOrder.customer_name} • RUT: {selectedOrder.business_rut || 'Sin registrar'}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-8 h-8 rounded-full bg-[#FAF9F6] border border-[#E5E4DF] flex items-center justify-center text-[#575551] hover:text-[#111111] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Toast Feedback */}
              {orderToast && (
                <div
                  className={`p-4 rounded-xl text-xs flex items-center gap-2.5 ${
                    orderToast.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {orderToast.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{orderToast.message}</span>
                </div>
              )}

              <form onSubmit={handleSaveOrderChanges} className="space-y-6">
                
                {/* 1. SELECCIÓN DE FASE LOGÍSTICA (LÍNEA DE TIEMPO DEL CLIENTE) */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-[#111111] uppercase tracking-wider">
                    📍 1. Fase del Envío (Lo que el cliente ve en su línea de tiempo)
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                    {IMPORT_STAGES.map((st) => {
                      const isCurrent = editStage === st.key;
                      return (
                        <button
                          type="button"
                          key={st.key}
                          onClick={() => setEditStage(st.key)}
                          className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                            isCurrent
                              ? 'bg-[#111111] border-[#111111] text-white shadow-md'
                              : 'bg-[#FAF9F6] border-[#E5E4DF] text-[#575551] hover:border-[#82807A]'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-2">
                            <span className="text-[10px] font-mono opacity-80">Paso {st.step}</span>
                            {st.key === 'logistica_usa' && <Building2 className="w-3.5 h-3.5" />}
                            {st.key === 'viajando' && <Plane className="w-3.5 h-3.5" />}
                            {st.key === 'desaduanamiento' && <ShieldCheck className="w-3.5 h-3.5" />}
                            {st.key === 'reparto_chile' && <Truck className="w-3.5 h-3.5" />}
                            {st.key === 'entregado' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <span className="font-semibold text-xs block leading-tight">{st.label}</span>
                            <span className={`text-[10px] block mt-0.5 ${isCurrent ? 'text-[#B89768]' : 'text-[#82807A]'}`}>
                              {st.badge}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. COURIER Y GUÍA DE TRANSPORTE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#111111] uppercase tracking-wider mb-1.5">
                      🚚 Empresa de Despacho (Courier)
                    </label>
                    <select
                      value={editCourier}
                      onChange={(e) => setEditCourier(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl px-3 py-2 text-xs text-[#111111] focus:outline-none focus:border-[#B89768]"
                    >
                      {COURIER_OPTIONS.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] uppercase tracking-wider mb-1.5">
                      🏷️ N° de Guía o Seguimiento
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={editTrackingNumber}
                        onChange={(e) => setEditTrackingNumber(e.target.value)}
                        placeholder="Ej: 123456789 (Starken / Chilexpress)"
                        className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-3 pr-10 py-2 text-xs text-[#111111] font-mono focus:outline-none focus:border-[#B89768]"
                      />
                      {editTrackingNumber && (
                        <button
                          type="button"
                          onClick={() => handleCopyTracking(editTrackingNumber)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#82807A] hover:text-[#111111]"
                          title="Copiar guía"
                        >
                          {copiedTracking ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. MENSAJE DIRECTO AL CLIENTE */}
                <div>
                  <label className="block text-xs font-semibold text-[#111111] uppercase tracking-wider mb-1.5">
                    💬 Mensaje o Nota Visible para la Óptica
                  </label>
                  <textarea
                    rows={2}
                    value={editCustomNote}
                    onChange={(e) => setEditCustomNote(e.target.value)}
                    placeholder="Ej: 'Tu pedido arribó hoy a Santiago y fue entregado a Starken para despacho a tu sucursal. Llegada estimada en 24-48 horas.'"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl p-3 text-xs text-[#111111] focus:outline-none focus:border-[#B89768]"
                  />
                  <span className="text-[11px] text-[#82807A] mt-1 block">
                    Este mensaje aparece destacado en la pantalla de seguimiento del cliente (`/seguimiento`).
                  </span>
                </div>

                {/* 4. ESTADO COMERCIAL & PAGO */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E5E4DF]">
                  <div>
                    <label className="block text-xs font-semibold text-[#111111] uppercase tracking-wider mb-1.5">
                      Estado General del Pedido
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl px-3 py-2 text-xs text-[#111111] focus:outline-none focus:border-[#B89768]"
                    >
                      {ORDER_STATUS_OPTIONS.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] uppercase tracking-wider mb-1.5">
                      Estado de Pago
                    </label>
                    <select
                      value={editPaymentStatus}
                      onChange={(e) => setEditPaymentStatus(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl px-3 py-2 text-xs text-[#111111] focus:outline-none focus:border-[#B89768]"
                    >
                      {PAYMENT_STATUS_OPTIONS.map((ps) => (
                        <option key={ps.value} value={ps.value}>
                          {ps.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 5. ARMAZONES DEL PEDIDO (DETALLE DE MODELOS A DESPACHAR) */}
                <div className="pt-2 border-t border-[#E5E4DF]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#111111] block mb-2">
                    👓 Armazones del Pedido ({orderItems.length} modelos)
                  </span>
                  
                  <div className="bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FFFFFF] text-[#82807A] font-mono uppercase border-b border-[#E5E4DF]">
                        <tr>
                          <th className="py-2 px-3">SKU / Modelo</th>
                          <th className="py-2 px-3">Marca</th>
                          <th className="py-2 px-3 text-center">Cant.</th>
                          <th className="py-2 px-3 text-right">Precio Neto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E4DF]">
                        {loadingOrderItems ? (
                          <tr><td colSpan={4} className="py-4 text-center text-[#82807A]">Cargando modelos...</td></tr>
                        ) : orderItems.length === 0 ? (
                          <tr><td colSpan={4} className="py-4 text-center text-[#82807A]">Sin ítems vinculados.</td></tr>
                        ) : (
                          orderItems.map((it, idx) => (
                            <tr key={idx}>
                              <td className="py-2 px-3 font-mono font-bold text-[#111111]">{it.sku || it.product_id}</td>
                              <td className="py-2 px-3 text-[#575551]">{it.brand_name || it.product_name}</td>
                              <td className="py-2 px-3 text-center font-bold text-[#111111]">{it.quantity}</td>
                              <td className="py-2 px-3 text-right font-mono text-[#575551]">
                                ${(it.unit_price_net || 0).toLocaleString('es-CL')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* BOTONES DE ACCIÓN */}
                <div className="pt-4 border-t border-[#E5E4DF] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="px-5 py-2.5 rounded-full bg-[#FAF9F6] border border-[#E5E4DF] text-[#575551] text-xs font-semibold hover:text-[#111111] transition"
                  >
                    Cerrar
                  </button>

                  <button
                    type="submit"
                    disabled={savingOrder}
                    className="px-6 py-2.5 rounded-full bg-[#111111] hover:bg-[#333333] text-white font-semibold text-xs transition shadow-md flex items-center gap-2 disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5 text-[#B89768]" />
                    <span>{savingOrder ? 'Actualizando y Notificando...' : 'Guardar y Notificar al Cliente'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
