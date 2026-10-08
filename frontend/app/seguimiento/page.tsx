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
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

export default function SeguimientoPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<null | any>(null);

  // MOCK DATA para el tracker
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
      setTrackedOrder({
        id: orderNumber.toUpperCase(),
        date: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
        currentStage: 3, // Fase actual
      });
    }, 800);
  };

  const stages = [
    {
      id: 1,
      title: "Pedido Confirmado",
      desc: "En preparación con proveedor en EE. UU.",
      icon: <Building2 className="w-5 h-5" />,
      date: "2 días atrás",
    },
    {
      id: 2,
      title: "Consolidación en Origen",
      desc: "Despacho hacia aeropuerto logístico (USA).",
      icon: <Package className="w-5 h-5" />,
      date: "Ayer",
    },
    {
      id: 3,
      title: "Tránsito Aéreo",
      desc: "Vuelo internacional hacia destino.",
      icon: <Plane className="w-5 h-5" />,
      date: "Hoy",
    },
    {
      id: 4,
      title: "Aduana y Bodega Nacional",
      desc: "Liberación y llegada a bodega (Chile).",
      icon: <ShieldCheck className="w-5 h-5" />,
      date: "Pendiente",
    },
    {
      id: 5,
      title: "Envío Nacional / Entregado",
      desc: "En tránsito hacia la óptica.",
      icon: <MapPin className="w-5 h-5" />,
      date: "Pendiente",
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pt-24 sm:pt-32 pb-20 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* ENCABEZADO */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-emerald-500/10 rounded-full mb-4 ring-1 ring-emerald-500/20">
            <Truck className="w-6 h-6 text-emerald-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Rastreador de Importación</h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Ingresa tu número de orden para consultar en vivo el estado logístico de tu compra B2B desde Estados Unidos hasta tu óptica.
          </p>
        </div>

        {/* BUSCADOR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 mb-10 shadow-lg">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="text" 
                placeholder="Ej. OPT-8934-US" 
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition placeholder:text-slate-600"
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={isSearching}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-70"
            >
              {isSearching ? 'Buscando...' : 'Rastrear Pedido'}
              {!isSearching && <ChevronRight className="w-4 h-4" />}
            </button>
          </form>
          <div className="flex items-start gap-2 mt-4 text-xs text-slate-500 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
            <AlertCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p>Los pedidos de importación directa tienen un tiempo estimado de entrega de <strong>10 a 15 días hábiles</strong>. El tracking se actualiza automáticamente al pasar por aduanas.</p>
          </div>
        </div>

        {/* RESULTADOS / TIMELINE */}
        {trackedOrder && (
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 border-b border-slate-800 pb-6 gap-4">
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">Orden de Compra</p>
                <h2 className="text-2xl font-black text-white">{trackedOrder.id}</h2>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-slate-400 text-sm font-medium mb-1">Fecha de Solicitud</p>
                <p className="text-slate-200 font-semibold">{trackedOrder.date}</p>
              </div>
            </div>

            <div className="relative">
              {/* LÍNEA CONECTORA (Desktop) */}
              <div className="hidden sm:block absolute left-6 top-6 bottom-6 w-0.5 bg-slate-800"></div>

              <div className="flex flex-col gap-8 relative z-10">
                {stages.map((stage, index) => {
                  const isCompleted = trackedOrder.currentStage > stage.id;
                  const isCurrent = trackedOrder.currentStage === stage.id;
                  const isPending = trackedOrder.currentStage < stage.id;

                  return (
                    <div key={stage.id} className="flex gap-4 sm:gap-6 items-start group">
                      {/* ICONO / ESTADO */}
                      <div className="flex-shrink-0 relative">
                        <div className={\`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-lg \${
                          isCompleted 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : isCurrent 
                              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20 animate-pulse'
                              : 'bg-slate-900 text-slate-600 border border-slate-800'
                        }\`}>
                          {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : stage.icon}
                        </div>
                        {/* Línea conectora Mobile */}
                        {index !== stages.length - 1 && (
                          <div className={\`sm:hidden absolute left-1/2 -translate-x-1/2 top-12 w-0.5 h-8 \${isCompleted ? 'bg-emerald-500/50' : 'bg-slate-800'}\`}></div>
                        )}
                      </div>

                      {/* CONTENIDO FASE */}
                      <div className={\`pt-1 \${isPending ? 'opacity-50' : 'opacity-100'}\`}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                          <h3 className={\`text-lg font-bold \${isCurrent ? 'text-emerald-400' : isCompleted ? 'text-slate-200' : 'text-slate-500'}\`}>
                            {stage.title}
                          </h3>
                          <span className={\`text-xs font-semibold px-2 py-0.5 rounded-md \${
                            isCompleted ? 'bg-emerald-500/10 text-emerald-400' 
                            : isCurrent ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50'
                            : 'bg-slate-800 text-slate-400'
                          }\`}>
                            {isCompleted ? 'Completado' : isCurrent ? 'En Progreso' : 'Próximamente'}
                          </span>
                        </div>
                        <p className="text-slate-400 text-sm mb-1">{stage.desc}</p>
                        <p className="text-slate-500 text-xs font-medium">{stage.date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-12 pt-6 border-t border-slate-800 text-center">
              <Link href="/catalogo" className="text-emerald-400 hover:text-emerald-300 text-sm font-semibold transition flex items-center justify-center gap-2">
                Volver al catálogo B2B
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
