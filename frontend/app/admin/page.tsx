'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  Filter,
  RefreshCw,
  Play,
  Save,
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  Layers,
  Settings,
  ExternalLink,
  Check,
  Plane,
  X
} from 'lucide-react';
import type { Order, OrderItem } from '@/lib/catalog/types';
import { IMPORT_STAGES, COURIER_OPTIONS, parseOrderTracking, ImportStageKey } from '@/lib/trackingUtils';

interface SyncItem {
  id_ext: string;
  status: 'updated' | 'unchanged' | 'out_of_stock';
  oldStock?: number;
  newStock?: number;
  oldPriceNeto?: number;
  newPriceNeto?: number;
  oldPriceUsd?: number;
  newPriceUsd?: number;
  changeReason?: string;
}

interface BrandReport {
  brand: string;
  totalScanned: number;
  updated: number;
  outOfStock: number;
  unchanged: number;
  items: SyncItem[];
}

interface SyncSummary {
  timestamp: string;
  durationSeconds: number;
  brandsProcessed: string[];
  totalScanned: number;
  totalUpdated: number;
  totalOutOfStock: number;
  totalUnchanged: number;
  brandReports: BrandReport[];
}

const POPULAR_BRANDS = [
  'TODAS',
  'Guess',
  'Nike',
  'Adidas',
  'Tom Ford',
  'Calvin Klein',
  'Lacoste',
  'Bolle',
  'BMW',
  'DKNY',
  'IC! Berlin',
];

const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'payment_pending', label: 'Pago Pendiente' },
  { value: 'paid', label: 'Pagado' },
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

export default function AdminMasterPage() {
  const { user, session, isLoggedIn } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'sync' | 'scraper'>('orders');

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingOrderItems, setLoadingOrderItems] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Edit Order Form State
  const [editStatus, setEditStatus] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [editStage, setEditStage] = useState<ImportStageKey>('logistica_usa');
  const [editCourier, setEditCourier] = useState('DHL Express');
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editCustomNote, setEditCustomNote] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderToast, setOrderToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync / Scraper State
  const [syncBrand, setSyncBrand] = useState('TODAS');
  const [syncHeadless, setSyncHeadless] = useState(true);
  const [syncDryRun, setSyncDryRun] = useState(false);
  const [syncDolar, setSyncDolar] = useState('950');
  const [syncMargin, setSyncMargin] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [syncToast, setSyncToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [catalogTotal, setCatalogTotal] = useState<number>(1097);
  const [availableBrands, setAvailableBrands] = useState<{ name: string; count: number }[]>([]);

  // Scraper Core Full State
  const [scraperBrand, setScraperBrand] = useState('TODAS');
  const [scraperPages, setScraperPages] = useState('5');
  const [scraperHeadless, setScraperHeadless] = useState(true);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperMessage, setScraperMessage] = useState<string | null>(null);

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

  // Load latest sync report and catalog stats on mount
  useEffect(() => {
    async function loadLatestSync() {
      try {
        const res = await fetch('/api/admin/sync');
        if (res.ok) {
          const data = await res.json();
          if (data.latest_summary) {
            setSyncSummary(data.latest_summary);
          }
          if (typeof data.total_catalog_products === 'number') {
            setCatalogTotal(data.total_catalog_products);
          }
          if (Array.isArray(data.brands) && data.brands.length > 0) {
            setAvailableBrands(data.brands);
          }
        }
      } catch {}
    }
    loadLatestSync();
  }, []);

  // Open order editor modal or panel
  const handleSelectOrderForEdit = async (ord: Order) => {
    setSelectedOrder(ord);
    setEditStatus(ord.status);
    setEditPaymentStatus(ord.payment_status);
    
    const parsed = parseOrderTracking(ord);
    setEditStage(parsed.currentStageKey);
    setEditCourier(parsed.courier || ord.shipping_provider || 'DHL Express');
    setEditTrackingNumber(parsed.trackingNumber || ord.tracking_number || '');
    setEditCustomNote(parsed.customNote || '');

    // Fetch items
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
        console.error(e);
      } finally {
        setLoadingOrderItems(false);
      }
    }
  };

  // Save Order Changes
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
        throw new Error(data.error || 'Error al guardar los cambios del pedido');
      }

      setOrderToast({
        type: 'success',
        message: `Pedido #${selectedOrder.id.split('-')[0].toUpperCase()} actualizado correctamente.`,
      });

      // Update orders in local list
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? { ...o, ...data.order } : o))
      );
      setSelectedOrder(data.order);
      setTimeout(() => setOrderToast(null), 4000);
    } catch (err) {
      setOrderToast({ type: 'error', message: (err as Error).message });
    } finally {
      setSavingOrder(false);
    }
  };

  // Run Fast Sync
  const handleRunFastSync = async () => {
    setSyncLoading(true);
    setSyncToast(null);

    const isAll = syncBrand === 'TODAS';
    const payload = {
      brand: isAll ? undefined : syncBrand,
      all_brands: isAll,
      headless: syncHeadless,
      dry_run: syncDryRun,
      dolar: syncDolar ? parseFloat(syncDolar) : 950,
      margin_percentage: syncMargin ? parseFloat(syncMargin) : undefined,
      background: false,
    };

    try {
      const res = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Error en sincronización');
      }

      if (data.summary) {
        setSyncSummary(data.summary);
        setSyncToast({
          type: 'success',
          message: `Sincronización finalizada: ${data.summary.totalUpdated} actualizados, ${data.summary.totalOutOfStock} sin stock (0), ${data.summary.totalUnchanged} sin cambios.`,
        });
      } else {
        setSyncToast({ type: 'success', message: data.message || 'Sincronización procesada.' });
      }
    } catch (err) {
      setSyncToast({ type: 'error', message: (err as Error).message });
    } finally {
      setSyncLoading(false);
    }
  };

  // Run Full Scraper Core
  const handleRunFullScraper = async () => {
    setScraperLoading(true);
    setScraperMessage('Iniciando extracción completa de catálogo...');

    const isAll = scraperBrand === 'TODAS';
    try {
      const res = await fetch('/api/admin/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'full-catalog',
          brand: isAll ? undefined : scraperBrand,
          all_brands: isAll,
          max_pages: scraperPages ? parseInt(scraperPages, 10) : 5,
          headless: scraperHeadless,
          dry_run: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Error al iniciar el scraper');
      }

      setScraperMessage(
        data.message || 'Extracción completa iniciada en segundo plano con éxito.'
      );
    } catch (e) {
      setScraperMessage(`Error: ${(e as Error).message}`);
    } finally {
      setScraperLoading(false);
    }
  };

  // Filtered orders
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

  // Calculate order stats
  const totalOrdersCount = orders.length;
  const paidOrdersCount = orders.filter((o) => o.status === 'paid' || o.payment_status === 'approved').length;
  const preparingOrdersCount = orders.filter((o) => o.status === 'preparing').length;
  const shippedOrdersCount = orders.filter((o) => o.status === 'shipped').length;
  const attentionOrdersCount = orders.filter((o) => o.status === 'requires_attention').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Superior */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-widest mb-1">
              <Link href="/" className="hover:underline">Inicio</Link>
              <span>/</span>
              <span>Panel Maestro</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">
              Panel de Administración OptiHub
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Gestión centralizada de pedidos B2B, cambio de estados, seguimiento logístico y sincronización automática de catálogos y stock con proveedores.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Rol Administrador Autorizado</span>
            </span>
          </div>
        </div>

        {/* Navegación por Pestañas */}
        <div className="flex border-b border-slate-800 space-x-1 sm:space-x-4">
          <button
            onClick={() => setActiveTab('orders')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'orders'
                ? 'border-amber-500 text-amber-400 bg-slate-900/40 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Gestión de Pedidos ({orders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'sync'
                ? 'border-amber-500 text-amber-400 bg-slate-900/40 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Actualización Rápida (Stock y Precios)</span>
          </button>

          <button
            onClick={() => setActiveTab('scraper')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'scraper'
                ? 'border-amber-500 text-amber-400 bg-slate-900/40 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Scraper de Catálogo Completo</span>
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 1: GESTIÓN MAESTRA DE PEDIDOS                            */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            
            {/* KPI Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Total Órdenes</span>
                <span className="text-2xl font-bold text-white mt-1 block">{totalOrdersCount}</span>
              </div>
              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 text-center bg-emerald-950/10">
                <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block">Pagados / Aprobados</span>
                <span className="text-2xl font-bold text-emerald-300 mt-1 block">{paidOrdersCount}</span>
              </div>
              <div className="bg-slate-900 border border-blue-500/30 rounded-xl p-4 text-center bg-blue-950/10">
                <span className="text-[11px] font-mono text-blue-400 uppercase tracking-wider block">En Preparación</span>
                <span className="text-2xl font-bold text-blue-300 mt-1 block">{preparingOrdersCount}</span>
              </div>
              <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-4 text-center bg-indigo-950/10">
                <span className="text-[11px] font-mono text-indigo-400 uppercase tracking-wider block">En Reparto Chile</span>
                <span className="text-2xl font-bold text-indigo-300 mt-1 block">{shippedOrdersCount}</span>
              </div>
              <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 text-center bg-amber-950/10 col-span-2 sm:col-span-1">
                <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block">En Revisión</span>
                <span className="text-2xl font-bold text-amber-300 mt-1 block">{attentionOrdersCount}</span>
              </div>
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar por ID, RUT, cliente, óptica o tracking..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="paid">Pagados</option>
                  <option value="preparing">En Preparación</option>
                  <option value="shipped">Enviados</option>
                  <option value="delivered">Entregados</option>
                  <option value="requires_attention">En Revisión (Stock)</option>
                  <option value="payment_pending">Pago Pendiente</option>
                  <option value="cancelled">Cancelados</option>
                </select>

                <button
                  onClick={fetchOrders}
                  disabled={loadingOrders}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition"
                  title="Recargar Pedidos"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              </div>
            </div>

            {/* Listado de Pedidos */}
            <div className="space-y-4">
              {loadingOrders ? (
                <div className="p-12 text-center text-slate-400 font-mono text-sm">
                  Cargando pedidos de la plataforma...
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                  No se encontraron pedidos que coincidan con los filtros aplicados.
                </div>
              ) : (
                filteredOrders.map((ord) => {
                  const tracking = parseOrderTracking(ord);
                  const isExpanded = expandedOrderId === ord.id;

                  return (
                    <div
                      key={ord.id}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition shadow-sm"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
                        {/* Identificador y Cliente */}
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-amber-300 bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700">
                              #{ord.id.split('-')[0].toUpperCase()}
                            </span>
                            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded border uppercase tracking-wider ${
                              ord.status === 'delivered' ? 'bg-emerald-950 text-emerald-300 border-emerald-700' :
                              ['paid', 'preparing', 'shipped'].includes(ord.status) ? 'bg-blue-950 text-blue-300 border-blue-700' :
                              ord.status === 'requires_attention' ? 'bg-amber-950 text-amber-300 border-amber-700' :
                              'bg-slate-800 text-slate-300 border-slate-700'
                            }`}>
                              {ord.status}
                            </span>
                            <span className="text-[11px] font-medium text-slate-400">
                              {new Date(ord.created_at).toLocaleDateString('es-CL', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                            <strong className="text-white flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-amber-400" />
                              {ord.business_name || ord.customer_name || 'Cliente'}
                            </strong>
                            {ord.business_rut && <span className="font-mono text-slate-400">RUT: {ord.business_rut}</span>}
                            {ord.shipping_commune && <span className="text-slate-400">📍 {ord.shipping_commune}</span>}
                            {ord.customer_phone && <span className="text-slate-400">📞 {ord.customer_phone}</span>}
                          </div>
                        </div>

                        {/* Montos y Acciones */}
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-mono uppercase block">Total Pedido</span>
                            <span className="text-lg font-bold text-white font-mono">
                              ${(ord.total_amount || 0).toLocaleString('es-CL')} CLP
                            </span>
                            <span className="text-[11px] text-emerald-400 block font-mono">
                              Pago: {ord.payment_status}
                            </span>
                          </div>

                          <button
                            onClick={() => handleSelectOrderForEdit(ord)}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow transition flex items-center gap-1.5"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            <span>Modificar Estado</span>
                          </button>
                        </div>
                      </div>

                      {/* Info de Seguimiento y Courier */}
                      <div className="pt-3 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-300 font-semibold text-[11px]">
                            Etapa: {tracking.stageInfo.label} ({tracking.currentStep}/5)
                          </span>
                          {tracking.trackingNumber && (
                            <span className="font-mono text-slate-300">
                              🚚 {tracking.courier || 'Guía'}: <strong className="text-white">{tracking.trackingNumber}</strong>
                            </span>
                          )}
                          {tracking.customNote && (
                            <span className="italic text-slate-400 max-w-md truncate">
                              "{tracking.customNote}"
                            </span>
                          )}
                        </div>

                        <Link
                          href={`/mis-pedidos/${ord.id}`}
                          target="_blank"
                          className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-1 font-semibold"
                        >
                          <span>Ver Ficha Pública</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* MODAL EDITOR DE PEDIDO                                          */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-xs font-mono text-amber-400 uppercase tracking-widest block">
                    Modificar Pedido
                  </span>
                  <h2 className="text-xl font-serif font-bold text-white">
                    Orden #{selectedOrder.id.split('-')[0].toUpperCase()}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Toast Feedback */}
              {orderToast && (
                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  orderToast.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600' : 'bg-rose-950/80 text-rose-300 border border-rose-600'
                }`}>
                  <span>{orderToast.type === 'success' ? '✅' : '❌'}</span>
                  <span>{orderToast.message}</span>
                </div>
              )}

              <form onSubmit={handleSaveOrderChanges} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Estado Principal */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                      Estado del Pedido (Interno)
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {ORDER_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} ({opt.value})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Estado del Pago */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                      Estado de Pago (Mercado Pago / Transferencia)
                    </label>
                    <select
                      value={editPaymentStatus}
                      onChange={(e) => setEditPaymentStatus(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {PAYMENT_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} ({opt.value})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Etapa de Importación (Línea de Tiempo) */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                      Fase de Importación (Visible para Cliente)
                    </label>
                    <select
                      value={editStage}
                      onChange={(e) => setEditStage(e.target.value as ImportStageKey)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {IMPORT_STAGES.map((st) => (
                        <option key={st.key} value={st.key}>
                          Paso {st.step}: {st.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Courier / Empresa de Envío */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                      Empresa de Transporte / Courier
                    </label>
                    <select
                      value={editCourier}
                      onChange={(e) => setEditCourier(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {COURIER_OPTIONS.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Número de Guía / Tracking */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    Número de Guía o Código de Tracking
                  </label>
                  <input
                    type="text"
                    value={editTrackingNumber}
                    onChange={(e) => setEditTrackingNumber(e.target.value)}
                    placeholder="Ej: 1234567890 (DHL) o 99887766 (Chilexpress)"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Nota para el Cliente */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    Nota o Actualización Logística (Se muestra en el seguimiento)
                  </label>
                  <textarea
                    rows={2}
                    value={editCustomNote}
                    onChange={(e) => setEditCustomNote(e.target.value)}
                    placeholder="Ej: Mercadería arribó a Santiago. En proceso de internación aduanera."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Ítems del Pedido (Para compra al proveedor) */}
                <div className="pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                    📦 Detalle de Armazones a Comprar ({orderItems.length} ítems)
                  </span>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto max-h-40">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800/80 text-slate-400 uppercase font-mono">
                        <tr>
                          <th className="py-1.5 px-3">SKU / Modelo</th>
                          <th className="py-1.5 px-3">Marca</th>
                          <th className="py-1.5 px-3 text-center">Cant.</th>
                          <th className="py-1.5 px-3 text-right">Unitario Neto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {loadingOrderItems ? (
                          <tr><td colSpan={4} className="py-3 text-center text-slate-500">Cargando ítems...</td></tr>
                        ) : orderItems.length === 0 ? (
                          <tr><td colSpan={4} className="py-3 text-center text-slate-500">Sin ítems vinculados.</td></tr>
                        ) : (
                          orderItems.map((it, idx) => (
                            <tr key={idx}>
                              <td className="py-1.5 px-3 font-mono text-amber-300">{it.sku || it.product_id}</td>
                              <td className="py-1.5 px-3 text-white">{it.brand_name || it.product_name}</td>
                              <td className="py-1.5 px-3 text-center font-bold text-white">{it.quantity}</td>
                              <td className="py-1.5 px-3 text-right font-mono text-slate-300">
                                ${(it.unit_price_net || 0).toLocaleString('es-CL')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Botones de Acción */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingOrder}
                    className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingOrder ? 'Guardando...' : 'Guardar y Notificar'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 2: SINCRONIZACIÓN RÁPIDA (STOCK Y PRECIOS)               */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'sync' && (
          <div className="space-y-6">
            {/* Banner Informativo de Ejecución */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-1.5">
                    <span>☁️ Opción 1: Recálculo Inmediato Cloud (Desde esta Web)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Aplica la cotización del dólar, aranceles de importación (6% CIF) y margen comercial a los <strong>{catalogTotal.toLocaleString('es-CL')} productos</strong> en Supabase en menos de 1 segundo. Ideal para ajustar precios masivos al instante sin esperar.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-mono text-amber-300/80">
                  ⚡ Se ejecuta directamente con el botón amarillo inferior.
                </div>
              </div>

              <div className="bg-slate-900/90 border border-blue-500/30 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm mb-1.5">
                    <span>🖥️ Opción 2: Extracción en Vivo desde NYWD (Sin Terminal ni IDE)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Para navegar la web del proveedor en tiempo real, saltar Captchas con tu sesión y cotejar el stock/precios unitarios reales, tienes en tu Escritorio el lanzador directo:
                  </p>
                  <div className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-blue-300">
                    📂 Escritorio &gt; <strong>⚡ Sincronizar-Stock-NYWD.bat</strong>
                  </div>
                </div>
                <div className="mt-3 text-[11px] font-mono text-slate-400">
                  👆 Solo haz doble clic en tu escritorio; no requiere abrir Visual Studio Code ni consolas.
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    ⚡ Actualización de Precios y Reglas Comerciales
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Recalcula y sincroniza landed cost CIF, aranceles y margen B2B en Supabase ({catalogTotal.toLocaleString('es-CL')} productos registrados) sin tocar descripciones ni corromper imágenes.
                  </p>
                </div>
                <div className="text-[11px] font-mono px-3 py-1 rounded bg-slate-800 text-amber-300 border border-slate-700 self-start sm:self-auto">
                  ☁️ Modo Cloud Supabase Activo
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    Marca a Sincronizar
                  </label>
                  <select
                    value={syncBrand}
                    onChange={(e) => setSyncBrand(e.target.value)}
                    disabled={syncLoading}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="TODAS">🌟 TODAS LAS MARCAS ({catalogTotal.toLocaleString('es-CL')} productos)</option>
                    {availableBrands.length > 0 ? (
                      availableBrands.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} ({b.count} productos)
                        </option>
                      ))
                    ) : (
                      POPULAR_BRANDS.filter((b) => b !== 'TODAS').map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    Dólar CLP (Cálculo Landed Cost)
                  </label>
                  <input
                    type="number"
                    value={syncDolar}
                    onChange={(e) => setSyncDolar(e.target.value)}
                    disabled={syncLoading}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    Margen Extra % (Opcional)
                  </label>
                  <input
                    type="number"
                    value={syncMargin}
                    onChange={(e) => setSyncMargin(e.target.value)}
                    disabled={syncLoading}
                    placeholder="Regla B2B estándar"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex flex-col justify-center space-y-2 pt-2">
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncHeadless}
                      onChange={(e) => setSyncHeadless(e.target.checked)}
                      disabled={syncLoading}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 bg-slate-800"
                    />
                    <span>Modo Invisible (Headless)</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncDryRun}
                      onChange={(e) => setSyncDryRun(e.target.checked)}
                      disabled={syncLoading}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 bg-slate-800"
                    />
                    <span>Simular sin guardar (Dry-Run)</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-[11px] text-slate-400">
                  💡 Para sincronizar stock directamente raspando NYWD en vivo, abre en tu escritorio: <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded font-mono">⚡ Sincronizar-Stock-NYWD.bat</code>
                </span>
                <button
                  onClick={handleRunFastSync}
                  disabled={syncLoading}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow flex items-center justify-center gap-2"
                >
                  {syncLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sincronizando {syncBrand === 'TODAS' ? `los ${catalogTotal} productos` : syncBrand}...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡ Recalcular Precios en la Nube ({syncBrand === 'TODAS' ? `${catalogTotal} productos` : syncBrand})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Sync Feedback Toast */}
            {syncToast && (
              <div className={`p-4 rounded-xl text-xs flex items-center gap-2.5 ${
                syncToast.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/50' : 'bg-rose-950/80 text-rose-300 border border-rose-600/50'
              }`}>
                <span>{syncToast.type === 'success' ? '✅' : '❌'}</span>
                <span>{syncToast.message}</span>
              </div>
            )}

            {/* Sync Metrics Table */}
            {syncSummary && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                    📊 Último Resumen de Sincronización ({syncSummary.durationSeconds}s)
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    {new Date(syncSummary.timestamp).toLocaleString('es-CL')}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-xs font-mono text-slate-400 uppercase">Escaneados</span>
                    <p className="text-xl font-bold text-white mt-1">{syncSummary.totalScanned}</p>
                  </div>
                  <div className="p-3 bg-emerald-950/30 rounded-lg border border-emerald-600/30">
                    <span className="text-xs font-mono text-emerald-400 uppercase">Actualizados</span>
                    <p className="text-xl font-bold text-emerald-300 mt-1">{syncSummary.totalUpdated}</p>
                  </div>
                  <div className="p-3 bg-amber-950/30 rounded-lg border border-amber-600/30">
                    <span className="text-xs font-mono text-amber-400 uppercase">Sin Stock (0)</span>
                    <p className="text-xl font-bold text-amber-300 mt-1">{syncSummary.totalOutOfStock}</p>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-xs font-mono text-slate-400 uppercase">Sin Cambios</span>
                    <p className="text-xl font-bold text-slate-300 mt-1">{syncSummary.totalUnchanged}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 3: SCRAPER DE CATÁLOGO COMPLETO                          */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'scraper' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  🚀 Extracción Completa de Catálogo (Nuevos Modelos e Imágenes)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Ejecuta el scraper principal para importar nuevos armazones, descargar y optimizar fotos a WebP (Sharp Lanczos-3), y extraer especificaciones (material, forma, género).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    Marca
                  </label>
                  <select
                    value={scraperBrand}
                    onChange={(e) => setScraperBrand(e.target.value)}
                    disabled={scraperLoading}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="TODAS">🌟 TODAS LAS MARCAS ({catalogTotal.toLocaleString('es-CL')} productos)</option>
                    {availableBrands.length > 0 ? (
                      availableBrands.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} ({b.count} productos)
                        </option>
                      ))
                    ) : (
                      POPULAR_BRANDS.filter((b) => b !== 'TODAS').map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                    Páginas Máximas por Marca
                  </label>
                  <input
                    type="number"
                    value={scraperPages}
                    onChange={(e) => setScraperPages(e.target.value)}
                    disabled={scraperLoading}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scraperHeadless}
                      onChange={(e) => setScraperHeadless(e.target.checked)}
                      disabled={scraperLoading}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 bg-slate-800"
                    />
                    <span>Ejecutar en modo Invisible (Headless)</span>
                  </label>
                </div>
              </div>

              {scraperMessage && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-amber-300">
                  {scraperMessage}
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                <span className="text-xs text-slate-400">
                  ⚙️ Corre en segundo plano para no bloquear el navegador ni el servidor.
                </span>
                <button
                  onClick={handleRunFullScraper}
                  disabled={scraperLoading}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow flex items-center gap-2"
                >
                  {scraperLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Iniciando Scraper...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Iniciar Ingesta de Catálogo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
