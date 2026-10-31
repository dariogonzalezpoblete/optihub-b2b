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
  ArrowLeft,
  Users,
  UserCheck,
  UserX,
  Phone,
  MessageCircle,
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

export interface OpticaUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  razon_social: string;
  nombre_optica: string;
  rut_empresa: string;
  giro_comercial: string;
  nombre_contacto: string;
  telefono: string;
  region: string;
  comuna: string;
  direccion: string;
  estado_verificacion: 'pendiente' | 'verificado' | 'rechazado';
  verificado_b2b: boolean;
  isAdmin: boolean;
  fecha_solicitud: string;
  fecha_aprobacion: string | null;
}

export default function AdminOrdersPage() {
  const { user, session, isLoggedIn } = useAuth();
  const router = useRouter();

  // Tab State: 'orders' | 'opticas'
  const [activeTab, setActiveTab] = useState<'orders' | 'opticas'>('orders');

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

  // Ópticas / B2B Verification State
  const [opticas, setOpticas] = useState<OpticaUser[]>([]);
  const [loadingOpticas, setLoadingOpticas] = useState(true);
  const [opticasSearchQuery, setOpticasSearchQuery] = useState('');
  const [opticasFilter, setOpticasFilter] = useState<'all' | 'pendiente' | 'verificado' | 'rechazado'>('all');
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [opticaToast, setOpticaToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Read URL query parameter ?tab=opticas
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('tab') === 'opticas') {
        setActiveTab('opticas');
      }
    }
  }, []);

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

  // 2. Fetch Ópticas from API
  const fetchOpticas = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingOpticas(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setOpticas(data.users);
      }
    } catch (err) {
      console.error('Error fetching opticas:', err);
    } finally {
      setLoadingOpticas(false);
    }
  }, [session?.access_token]);

  // Load orders and opticas on session ready
  useEffect(() => {
    if (session?.access_token) {
      fetchOrders();
      fetchOpticas();
    }
  }, [session?.access_token, fetchOrders, fetchOpticas]);

  // Refresh current view
  const handleRefresh = () => {
    if (activeTab === 'orders') {
      fetchOrders();
    } else {
      fetchOpticas();
    }
  };

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

  // Approve / Reject Óptica
  const handleUpdateOpticaStatus = async (
    userId: string,
    action: 'approve' | 'reject' | 'reset',
    razonSocial: string
  ) => {
    if (!session?.access_token) return;
    setProcessingUserId(userId);
    setOpticaToast(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al procesar la solicitud');
      }

      const actionText =
        action === 'approve'
          ? 'aprobada con éxito. Se envió el correo de bienvenida con acceso mayorista.'
          : action === 'reject'
          ? 'rechazada/suspendida.'
          : 'restablecida a pendiente.';

      setOpticaToast({
        type: 'success',
        message: `Óptica "${razonSocial}" ${actionText}`,
      });

      // Update local state
      setOpticas((prev) =>
        prev.map((opt) => {
          if (opt.id !== userId) return opt;
          return {
            ...opt,
            estado_verificacion:
              action === 'approve' ? 'verificado' : action === 'reject' ? 'rechazado' : 'pendiente',
            verificado_b2b: action === 'approve',
          };
        })
      );

      setTimeout(() => setOpticaToast(null), 5000);
    } catch (err) {
      setOpticaToast({ type: 'error', message: (err as Error).message });
    } finally {
      setProcessingUserId(null);
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

  // Filtered opticas list
  const filteredOpticas = opticas.filter((opt) => {
    if (opticasFilter !== 'all' && opt.estado_verificacion !== opticasFilter) return false;
    if (!opticasSearchQuery.trim()) return true;
    const q = opticasSearchQuery.toLowerCase().trim();
    return (
      opt.razon_social.toLowerCase().includes(q) ||
      opt.nombre_optica.toLowerCase().includes(q) ||
      opt.rut_empresa.toLowerCase().includes(q) ||
      opt.nombre_contacto.toLowerCase().includes(q) ||
      opt.email.toLowerCase().includes(q) ||
      opt.comuna.toLowerCase().includes(q) ||
      opt.region.toLowerCase().includes(q) ||
      opt.telefono.toLowerCase().includes(q)
    );
  });

  // Calculate order stats
  const totalCount = orders.length;
  const paidCount = orders.filter((o) => o.status === 'paid' || o.payment_status === 'approved').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;
  const shippedCount = orders.filter((o) => o.status === 'shipped').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;

  // Calculate opticas stats
  const totalOpticasCount = opticas.filter((o) => !o.isAdmin).length;
  const pendingOpticasCount = opticas.filter((o) => o.estado_verificacion === 'pendiente' && !o.isAdmin).length;
  const approvedOpticasCount = opticas.filter((o) => o.estado_verificacion === 'verificado' && !o.isAdmin).length;
  const rejectedOpticasCount = opticas.filter((o) => o.estado_verificacion === 'rechazado' && !o.isAdmin).length;

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
        return 'bg-[#FAF6EF] text-[#846C44] border-[#EADFC9]';
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
          <div className="w-16 h-16 rounded-2xl bg-[#FFFFFF] border border-[#E6E2DD] flex items-center justify-center mx-auto mb-4 text-[#846C44] shadow-sm">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="font-editorial font-serif text-2xl font-bold text-[#0F0F0F] mb-2">
            Acceso de Administración
          </h1>
          <p className="text-sm text-[#575551] mb-6">
            Inicia sesión con tu cuenta de administrador autorizada para gestionar los pedidos y despachos a ópticas.
          </p>
          <Link
            href="/login?redirect=/admin"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#0F0F0F] text-white text-xs font-semibold tracking-wide hover:bg-[#333333] transition"
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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#E6E2DD]">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EF] border border-[#EADFC9] text-[#846C44] text-[11px] font-semibold uppercase tracking-[0.18em] mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Panel Central de Administración B2B</span>
            </div>

            <h1 className="font-editorial font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#0F0F0F] tracking-tight">
              {activeTab === 'orders' ? 'Gestión y Seguimiento de Pedidos' : 'Verificación y Aprobación de Ópticas'}
            </h1>

            <p className="text-[#575551] text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
              {activeTab === 'orders'
                ? 'Informa a cada óptica y clínica el estado exacto de su importación: avance en Miami, aduana en Santiago, asignación de courier local y entrega final.'
                : 'Revisa las solicitudes de registro, verifica el RUT de empresa ante el SII y aprueba con un clic el acceso al catálogo y precios mayoristas.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={activeTab === 'orders' ? loadingOrders : loadingOpticas}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FFFFFF] border border-[#E6E2DD] text-[#0F0F0F] text-xs font-medium hover:border-[#82807A] transition shadow-xs disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#846C44] ${
                  (activeTab === 'orders' ? loadingOrders : loadingOpticas) ? 'animate-spin' : ''
                }`}
              />
              <span>Actualizar</span>
            </button>
            <Link
              href="/mis-pedidos"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0F0F0F] text-white text-xs font-medium hover:bg-[#333333] transition"
            >
              <span>Vista Cliente</span>
              <ExternalLink className="w-3 h-3 text-[#9E8256]" />
            </Link>
          </div>
        </div>

        {/* PESTAÑAS DE NAVEGACIÓN SUPERIOR */}
        <div className="flex items-center gap-4 border-b border-[#E6E2DD]">
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-3 px-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
              activeTab === 'orders'
                ? 'border-[#0F0F0F] text-[#0F0F0F]'
                : 'border-transparent text-[#82807A] hover:text-[#0F0F0F]'
            }`}
          >
            <Package className="w-4 h-4 text-[#846C44]" />
            <span>Gestión de Pedidos ({orders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('opticas')}
            className={`pb-3 px-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition relative ${
              activeTab === 'opticas'
                ? 'border-[#0F0F0F] text-[#0F0F0F]'
                : 'border-transparent text-[#82807A] hover:text-[#0F0F0F]'
            }`}
          >
            <Building2 className="w-4 h-4 text-[#846C44]" />
            <span>Ópticas y Clientes B2B ({totalOpticasCount})</span>
            {pendingOpticasCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs animate-pulse">
                {pendingOpticasCount} pendiente{pendingOpticasCount > 1 ? 's' : ''}
              </span>
            )}
          </button>
        </div>

        {/* TOAST NOTIFICACIÓN GENERAL PARA ÓPTICAS */}
        {opticaToast && (
          <div
            className={`p-4 rounded-xl border text-xs flex items-center justify-between shadow-xs transition-all ${
              opticaToast.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {opticaToast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span className="font-medium">{opticaToast.message}</span>
            </div>
            <button
              onClick={() => setOpticaToast(null)}
              className="text-stone-400 hover:text-stone-700 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECCIÓN 1: GESTIÓN DE PEDIDOS Y LOGÍSTICA                                 */}
        {/* ========================================================================= */}
        {activeTab === 'orders' && (
          <>
            {/* MÉTRICAS RESUMEN DE PEDIDOS */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-4 text-center shadow-xs">
                <span className="text-[11px] font-mono text-[#82807A] uppercase tracking-wider block">Total Pedidos</span>
                <span className="text-2xl font-bold text-[#0F0F0F] mt-1 block">{totalCount}</span>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-4 text-center shadow-xs">
                <span className="text-[11px] font-mono text-emerald-700 uppercase tracking-wider block">Pagados / Aprobados</span>
                <span className="text-2xl font-bold text-emerald-700 mt-1 block">{paidCount}</span>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-4 text-center shadow-xs">
                <span className="text-[11px] font-mono text-indigo-700 uppercase tracking-wider block">En Preparación</span>
                <span className="text-2xl font-bold text-indigo-700 mt-1 block">{preparingCount}</span>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-4 text-center shadow-xs">
                <span className="text-[11px] font-mono text-purple-700 uppercase tracking-wider block">En Reparto Courier</span>
                <span className="text-2xl font-bold text-purple-700 mt-1 block">{shippedCount}</span>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-4 text-center shadow-xs col-span-2 sm:col-span-1">
                <span className="text-[11px] font-mono text-[#846C44] uppercase tracking-wider block">Entregados con Éxito</span>
                <span className="text-2xl font-bold text-[#0F0F0F] mt-1 block">{deliveredCount}</span>
              </div>
            </div>

            {/* BARRA DE FILTRO Y BÚSQUEDA DE PEDIDOS */}
            <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-[#82807A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por N° Pedido, Razón Social, RUT, Correo o Courier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl text-[#0F0F0F] placeholder-[#82807A] focus:outline-none focus:border-[#9E8256]"
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
                        ? 'bg-[#0F0F0F] text-white shadow-xs'
                        : 'bg-[#FAF9F6] text-[#575551] hover:text-[#0F0F0F] border border-[#E6E2DD]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TABLA PRINCIPAL DE PEDIDOS */}
            <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[#E6E2DD] flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0F0F0F]">
                  Listado de Órdenes ({filteredOrders.length})
                </span>
                <span className="text-xs text-[#82807A]">
                  Haz clic en cualquier pedido para actualizar su tracking al cliente
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F6] text-[#82807A] font-mono uppercase tracking-wider border-b border-[#E6E2DD]">
                    <tr>
                      <th className="py-3 px-4">Pedido / Fecha</th>
                      <th className="py-3 px-4">Cliente / Óptica</th>
                      <th className="py-3 px-4">Destino (Comuna)</th>
                      <th className="py-3 px-4 text-center">Unidades</th>
                      <th className="py-3 px-4 text-right">Total Facturado</th>
                      <th className="py-3 px-4 text-center">Estado Pedido</th>
                      <th className="py-3 px-4 text-center">Seguimiento / Courier</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E2DD]">
                    {loadingOrders ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-[#82807A]">
                          <div className="inline-flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-[#846C44]" />
                            <span>Cargando pedidos de ópticas...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-[#82807A]">
                          No se encontraron pedidos con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((ord) => {
                        const parsedTracking = parseOrderTracking(ord);
                        return (
                          <tr
                            key={ord.id}
                            onClick={() => handleSelectOrderForEdit(ord)}
                            className="hover:bg-[#FAF9F6] transition cursor-pointer group"
                          >
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-[#0F0F0F] group-hover:text-[#846C44] transition">
                                #{ord.id.split('-')[0].toUpperCase()}
                              </span>
                              <span className="block text-[11px] text-[#82807A] mt-0.5">
                                {new Date(ord.created_at).toLocaleDateString('es-CL', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <span className="font-medium text-[#0F0F0F] block">
                                {ord.business_name || ord.customer_name || 'Óptica Sin Razón Social'}
                              </span>
                              <span className="text-[11px] text-[#82807A] font-mono">
                                RUT: {ord.business_rut || 'No informado'}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-[#575551]">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-[#846C44] flex-shrink-0" />
                                <span>{ord.shipping_commune || 'Santiago'}</span>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span className="font-mono font-bold text-[#0F0F0F] bg-[#FAF9F6] px-2 py-0.5 rounded-full border border-[#E6E2DD]">
                                {(ord as any).total_units || 'N/A'} un.
                              </span>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <span className="font-mono font-bold text-[#0F0F0F]">
                                ${(ord.total_amount || 0).toLocaleString('es-CL')}
                              </span>
                              <span className="block text-[10px] text-[#82807A] uppercase font-mono">
                                CLP (Con IVA)
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getStatusBadge(
                                  ord.status
                                )}`}
                              >
                                {getStatusText(ord.status)}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              {ord.tracking_number ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className="text-[11px] font-mono font-bold text-[#0F0F0F]">
                                    {ord.shipping_provider || 'Courier'}: {ord.tracking_number}
                                  </span>
                                  <span className="text-[10px] text-emerald-700 font-medium">
                                    {parsedTracking.stageInfo.label}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-[#82807A] italic">Sin despacho local</span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectOrderForEdit(ord);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#FAF9F6] border border-[#E6E2DD] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white transition group-hover:border-[#0F0F0F]"
                              >
                                <span>Gestionar</span>
                                <ChevronRight className="w-3 h-3" />
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
          </>
        )}

        {/* ========================================================================= */}
        {/* SECCIÓN 2: VERIFICACIÓN Y APROBACIÓN DE ÓPTICAS B2B                       */}
        {/* ========================================================================= */}
        {activeTab === 'opticas' && (
          <>
            {/* MÉTRICAS RESUMEN DE ÓPTICAS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-4 text-center shadow-xs">
                <span className="text-[11px] font-mono text-[#82807A] uppercase tracking-wider block">Total Ópticas</span>
                <span className="text-2xl font-bold text-[#0F0F0F] mt-1 block">{totalOpticasCount}</span>
              </div>

              <div className="bg-[#FFFFFF] border border-amber-200 rounded-2xl p-4 text-center shadow-xs bg-amber-50/30">
                <span className="text-[11px] font-mono text-amber-700 uppercase tracking-wider block">Pendientes de Aprobación</span>
                <span className="text-2xl font-bold text-amber-600 mt-1 block">{pendingOpticasCount}</span>
              </div>

              <div className="bg-[#FFFFFF] border border-emerald-200 rounded-2xl p-4 text-center shadow-xs bg-emerald-50/30">
                <span className="text-[11px] font-mono text-emerald-700 uppercase tracking-wider block">Aprobadas / Mayoristas</span>
                <span className="text-2xl font-bold text-emerald-700 mt-1 block">{approvedOpticasCount}</span>
              </div>

              <div className="bg-[#FFFFFF] border border-rose-200 rounded-2xl p-4 text-center shadow-xs bg-rose-50/30">
                <span className="text-[11px] font-mono text-rose-700 uppercase tracking-wider block">Rechazadas / Suspendidas</span>
                <span className="text-2xl font-bold text-rose-700 mt-1 block">{rejectedOpticasCount}</span>
              </div>
            </div>

            {/* BARRA DE FILTRO Y BÚSQUEDA DE ÓPTICAS */}
            <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-[#82807A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por Razón Social, RUT, Contacto, Comuna o Email..."
                  value={opticasSearchQuery}
                  onChange={(e) => setOpticasSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl text-[#0F0F0F] placeholder-[#82807A] focus:outline-none focus:border-[#9E8256]"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                <span className="text-xs font-semibold text-[#82807A] whitespace-nowrap hidden sm:inline">
                  Filtrar por:
                </span>
                {[
                  { id: 'all', label: 'Todas las Ópticas' },
                  { id: 'pendiente', label: `Pendientes (${pendingOpticasCount})` },
                  { id: 'verificado', label: 'Aprobadas' },
                  { id: 'rechazado', label: 'Rechazadas' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setOpticasFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                      opticasFilter === f.id
                        ? 'bg-[#0F0F0F] text-white shadow-xs'
                        : 'bg-[#FAF9F6] text-[#575551] hover:text-[#0F0F0F] border border-[#E6E2DD]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TABLA DE ÓPTICAS REGISTRADAS */}
            <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[#E6E2DD] flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0F0F0F]">
                  Listado de Ópticas y Cuentas B2B ({filteredOpticas.length})
                </span>
                <span className="text-xs text-[#82807A]">
                  Aprueba cuentas para autorizar la visualización de precios netos y compras por mayor
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F6] text-[#82807A] font-mono uppercase tracking-wider border-b border-[#E6E2DD]">
                    <tr>
                      <th className="py-3 px-4">Óptica / Razón Social</th>
                      <th className="py-3 px-4">RUT & Giro Comercial</th>
                      <th className="py-3 px-4">Contacto & Teléfono</th>
                      <th className="py-3 px-4">Ubicación</th>
                      <th className="py-3 px-4 text-center">Estado Verificación</th>
                      <th className="py-3 px-4 text-center">Fecha Registro</th>
                      <th className="py-3 px-4 text-right">Acciones de Aprobación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E2DD]">
                    {loadingOpticas ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-[#82807A]">
                          <div className="inline-flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-[#846C44]" />
                            <span>Cargando directorio de ópticas...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredOpticas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-[#82807A]">
                          No se encontraron ópticas registradas con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredOpticas.map((opt) => {
                        const cleanPhone = (opt.telefono || '').replace(/\D/g, '');
                        const waUrl =
                          cleanPhone.length >= 8 ? `https://wa.me/56${cleanPhone.slice(-9)}` : null;
                        const isProcessing = processingUserId === opt.id;

                        return (
                          <tr key={opt.id} className="hover:bg-[#FAF9F6] transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[#846C44] flex-shrink-0" />
                                <div>
                                  <span className="font-bold text-[#0F0F0F] block">
                                    {opt.razon_social}
                                  </span>
                                  {opt.nombre_optica && opt.nombre_optica !== opt.razon_social && (
                                    <span className="text-[11px] text-[#575551] block">
                                      {opt.nombre_optica}
                                    </span>
                                  )}
                                  {opt.isAdmin && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[9px] font-bold bg-[#0F0F0F] text-white rounded">
                                      ADMIN
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-[#0F0F0F] block">
                                {opt.rut_empresa}
                              </span>
                              <span className="text-[11px] text-[#82807A] line-clamp-1">
                                {opt.giro_comercial}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <span className="font-medium text-[#0F0F0F] block">
                                {opt.nombre_contacto}
                              </span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-[#575551]">{opt.email}</span>
                                {waUrl && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 transition"
                                  >
                                    <Phone className="w-2.5 h-2.5" />
                                    <span>WhatsApp</span>
                                  </a>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-[#575551]">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-[#846C44] flex-shrink-0" />
                                <span>
                                  {opt.comuna ? `${opt.comuna}, ` : ''}
                                  {opt.region || 'Chile'}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center">
                              {opt.estado_verificacion === 'verificado' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Aprobada</span>
                                </span>
                              ) : opt.estado_verificacion === 'rechazado' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  <span>Rechazada</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>Pendiente</span>
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-center text-[#82807A] text-[11px] font-mono">
                              {new Date(opt.fecha_solicitud || opt.created_at).toLocaleDateString(
                                'es-CL',
                                {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                }
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              {opt.isAdmin ? (
                                <span className="text-[11px] text-[#82807A] italic">Cuenta Administrador</span>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 justify-end">
                                  {opt.estado_verificacion !== 'verificado' && (
                                    <button
                                      disabled={isProcessing}
                                      onClick={() =>
                                        handleUpdateOpticaStatus(opt.id, 'approve', opt.razon_social)
                                      }
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] transition shadow-xs disabled:opacity-60"
                                      title="Aprobar óptica y habilitar precios mayoristas"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Aprobar</span>
                                    </button>
                                  )}

                                  {opt.estado_verificacion !== 'rechazado' && (
                                    <button
                                      disabled={isProcessing}
                                      onClick={() =>
                                        handleUpdateOpticaStatus(opt.id, 'reject', opt.razon_social)
                                      }
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-stone-200 hover:border-rose-200 text-[11px] font-medium transition disabled:opacity-60"
                                      title="Rechazar o suspender acceso comercial"
                                    >
                                      <X className="w-3 h-3" />
                                      <span>{opt.estado_verificacion === 'verificado' ? 'Suspender' : 'Rechazar'}</span>
                                    </button>
                                  )}

                                  {opt.estado_verificacion === 'rechazado' && (
                                    <button
                                      disabled={isProcessing}
                                      onClick={() =>
                                        handleUpdateOpticaStatus(opt.id, 'reset', opt.razon_social)
                                      }
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-stone-50 hover:bg-stone-100 text-stone-600 text-[10px] font-medium transition disabled:opacity-60"
                                    >
                                      <span>Re-evaluar</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* PANEL LATERAL DE EDICIÓN DE SEGUIMIENTO (DRAWER MODAL PARA PEDIDOS)        */}
        {/* ========================================================================= */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-[#0F0F0F]/60 backdrop-blur-xs flex items-center justify-end animate-in fade-in duration-200">
            <div className="w-full max-w-xl h-full bg-[#FFFFFF] shadow-2xl p-6 sm:p-8 flex flex-col justify-between overflow-y-auto">
              
              {/* ENCABEZADO DEL MODAL */}
              <div className="pb-6 border-b border-[#E6E2DD] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-editorial font-serif text-2xl font-bold text-[#0F0F0F]">
                      Pedido #{selectedOrder.id.split('-')[0].toUpperCase()}
                    </span>
                    <button
                      onClick={() => handleCopyTracking(selectedOrder.id)}
                      className="p-1 text-[#82807A] hover:text-[#0F0F0F] rounded transition"
                      title="Copiar ID completo"
                    >
                      {copiedTracking ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <span className="text-xs text-[#82807A] mt-1 block">
                    {selectedOrder.business_name || selectedOrder.customer_name} • RUT: {selectedOrder.business_rut || 'N/A'}
                  </span>
                </div>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-8 h-8 rounded-full bg-[#FAF9F6] border border-[#E6E2DD] flex items-center justify-center text-[#82807A] hover:text-[#0F0F0F] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* TOAST DENTRO DEL FORMULARIO */}
              {orderToast && (
                <div
                  className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    orderToast.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border-rose-200'
                  }`}
                >
                  {orderToast.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{orderToast.message}</span>
                </div>
              )}

              {/* FORMULARIO DE GESTIÓN Y SEGUIMIENTO */}
              <form onSubmit={handleSaveOrderChanges} className="py-6 space-y-6 flex-1">
                
                {/* 1. ESTADO GENERAL & ESTADO DE PAGO */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-[#82807A] mb-1.5">
                      Estado Operacional
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl text-[#0F0F0F] font-medium focus:outline-none focus:border-[#9E8256]"
                    >
                      {ORDER_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-[#82807A] mb-1.5">
                      Estado del Pago (MP)
                    </label>
                    <select
                      value={editPaymentStatus}
                      onChange={(e) => setEditPaymentStatus(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl text-[#0F0F0F] font-medium focus:outline-none focus:border-[#9E8256]"
                    >
                      {PAYMENT_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 2. ETAPA DE IMPORTACIÓN USA -> CHILE */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#82807A] mb-1.5">
                    Etapa de la Cadena de Suministro (Visible para la Óptica)
                  </label>
                  <select
                    value={editStage}
                    onChange={(e) => setEditStage(e.target.value as ImportStageKey)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl text-[#0F0F0F] font-medium focus:outline-none focus:border-[#9E8256]"
                  >
                    {IMPORT_STAGES.map((stg) => (
                      <option key={stg.key} value={stg.key}>
                        Paso {stg.step}: {stg.label} ({stg.location})
                      </option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-[#82807A] mt-1">
                    Esto actualiza la barra de progreso en tiempo real dentro del portal del cliente en /seguimiento.
                  </span>
                </div>

                {/* 3. COURIER Y NÚMERO DE SEGUIMIENTO LOCAL */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-[#82807A] mb-1.5">
                      Courier Nacional
                    </label>
                    <select
                      value={editCourier}
                      onChange={(e) => setEditCourier(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl text-[#0F0F0F] font-medium focus:outline-none focus:border-[#9E8256]"
                    >
                      {COURIER_OPTIONS.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-[#82807A] mb-1.5">
                      N° de Orden / Flete
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 9948271049"
                      value={editTrackingNumber}
                      onChange={(e) => setEditTrackingNumber(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl text-[#0F0F0F] font-mono focus:outline-none focus:border-[#9E8256]"
                    />
                  </div>
                </div>

                {/* Vista previa link de tracking si existe número */}
                {editTrackingNumber && (
                  <div className="p-3 bg-[#FAF6EF] border border-[#EADFC9] rounded-xl flex items-center justify-between text-xs">
                    <span className="text-[#846C44] font-medium">
                      Enlace de seguimiento oficial de {editCourier}:
                    </span>
                    <a
                      href={getCourierTrackingUrl(editCourier, editTrackingNumber) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0F0F0F] font-bold underline inline-flex items-center gap-1"
                    >
                      <span>Probar Enlace</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* 4. NOTA O MENSAJE PERSONALIZADO */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#82807A] mb-1.5">
                    Nota Logística para el Cliente (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ej: Pedido arribó a aduana en Santiago el día 28. Liberación estimada en 48 horas."
                    value={editCustomNote}
                    onChange={(e) => setEditCustomNote(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#E6E2DD] rounded-xl text-[#0F0F0F] focus:outline-none focus:border-[#9E8256]"
                  />
                </div>

                {/* 5. RESUMEN DE MODELOS / SKUS DE LA ORDEN (PARA COMPRA EN USA) */}
                <div className="pt-4 border-t border-[#E6E2DD]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-[#0F0F0F] uppercase tracking-wider">
                      Modelos Adquiridos ({orderItems.length})
                    </span>
                    <span className="text-[11px] font-mono text-[#82807A]">
                      SKUs para consolidación con proveedor NYWD
                    </span>
                  </div>

                  <div className="border border-[#E6E2DD] rounded-xl overflow-hidden bg-[#FAF9F6] max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FFFFFF] text-[#82807A] font-mono text-[10px] uppercase border-b border-[#E6E2DD]">
                        <tr>
                          <th className="py-2 px-3">SKU</th>
                          <th className="py-2 px-3">Marca / Modelo</th>
                          <th className="py-2 px-3 text-center">Cant.</th>
                          <th className="py-2 px-3 text-right">Neto Unit.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E6E2DD]">
                        {loadingOrderItems ? (
                          <tr><td colSpan={4} className="py-4 text-center text-[#82807A]">Cargando modelos...</td></tr>
                        ) : orderItems.length === 0 ? (
                          <tr><td colSpan={4} className="py-4 text-center text-[#82807A]">Sin ítems vinculados.</td></tr>
                        ) : (
                          orderItems.map((it, idx) => (
                            <tr key={idx}>
                              <td className="py-2 px-3 font-mono font-bold text-[#0F0F0F]">{it.sku || it.product_id}</td>
                              <td className="py-2 px-3 text-[#575551]">{it.brand_name || it.product_name}</td>
                              <td className="py-2 px-3 text-center font-bold text-[#0F0F0F]">{it.quantity}</td>
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
                <div className="pt-4 border-t border-[#E6E2DD] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="px-5 py-2.5 rounded-full bg-[#FAF9F6] border border-[#E6E2DD] text-[#575551] text-xs font-semibold hover:text-[#0F0F0F] transition"
                  >
                    Cerrar
                  </button>

                  <button
                    type="submit"
                    disabled={savingOrder}
                    className="px-6 py-2.5 rounded-full bg-[#0F0F0F] hover:bg-[#333333] text-white font-semibold text-xs transition shadow-md flex items-center gap-2 disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5 text-[#9E8256]" />
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
