"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Package, Clock, ExternalLink, ChevronRight, AlertCircle, ShoppingBag, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function MisPedidosPage() {
  const { user, isLoggedIn, opticaData } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // MOCK DATA: Historial de pedidos para la demostración
  const mockOrders = [
    {
      id: 'OPT-8934-US',
      date: '06 Octubre 2026',
      status: 'En Tránsito Aéreo',
      total: 845000,
      items: 15,
      estimatedDelivery: '18 Octubre 2026',
      active: true,
    },
    {
      id: 'OPT-7102-US',
      date: '12 Septiembre 2026',
      status: 'Entregado',
      total: 1250000,
      items: 25,
      estimatedDelivery: 'Entregado el 25 Septiembre 2026',
      active: false,
    },
    {
      id: 'OPT-5401-US',
      date: '03 Agosto 2026',
      status: 'Entregado',
      total: 560000,
      items: 10,
      estimatedDelivery: 'Entregado el 16 Agosto 2026',
      active: false,
    }
  ];

  useEffect(() => {
    // Redirigir si no está logueado después de un breve delay
    const timer = setTimeout(() => {
      setLoading(false);
      if (!isLoggedIn) {
        router.push('/login?redirect=/mis-pedidos');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [isLoggedIn, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center pt-20">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-400 font-medium">Cargando tu historial B2B...</p>
      </div>
    );
  }

  if (!isLoggedIn) return null; // Previene un flash del contenido antes del redirect

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pt-24 sm:pt-32 pb-20 px-4">
      <div className="max-w-5xl mx-auto">
        
        {/* ENCABEZADO */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">Mis Pedidos B2B</h1>
            <p className="text-slate-400">
              Historial de importaciones para <span className="text-emerald-400 font-semibold">{opticaData?.nombre_optica || user?.email}</span>
            </p>
          </div>
          <Link 
            href="/catalogo"
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl transition flex items-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            Nuevo Pedido
          </Link>
        </div>

        {/* LISTADO DE PEDIDOS */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          {mockOrders.length > 0 ? (
            <div className="divide-y divide-slate-800">
              {mockOrders.map((order) => (
                <div key={order.id} className="p-6 sm:p-8 hover:bg-slate-800/20 transition group flex flex-col md:flex-row justify-between gap-6 items-start md:items-center">
                  
                  {/* Info Principal */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-xl font-bold text-white">{order.id}</h2>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 ${
                        order.active ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {order.active && <Truck className="w-3.5 h-3.5" />}
                        {order.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> {order.date}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Package className="w-4 h-4" /> {order.items} armazones
                      </span>
                      <span className="font-semibold text-slate-300">
                        Total: ${(order.total).toLocaleString('es-CL')} CLP
                      </span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    <div className="text-sm text-slate-500 text-left md:text-right w-full md:w-auto mb-2 sm:mb-0">
                      <span className="block text-xs uppercase tracking-wider font-semibold">Estimado / Entregado</span>
                      <span className="text-slate-300">{order.estimatedDelivery}</span>
                    </div>
                    
                    {order.active ? (
                      <Link 
                        href={`/seguimiento?orden=${order.id}`}
                        className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-white font-semibold px-5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 transition flex items-center justify-center gap-2"
                      >
                        Rastrear
                        <ExternalLink className="w-4 h-4 text-emerald-400" />
                      </Link>
                    ) : (
                      <button 
                        className="w-full sm:w-auto bg-slate-900 text-slate-500 cursor-not-allowed font-semibold px-5 py-2.5 rounded-xl border border-slate-800 flex items-center justify-center gap-2"
                        disabled
                      >
                        Finalizado
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">No hay pedidos aún</h3>
              <p className="text-slate-400 max-w-md mx-auto mb-6">Aún no has realizado ninguna compra mayorista en OptiHub. Visita nuestro catálogo para comenzar tu primera importación.</p>
              <Link 
                href="/catalogo"
                className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                Explorar catálogo B2B <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
