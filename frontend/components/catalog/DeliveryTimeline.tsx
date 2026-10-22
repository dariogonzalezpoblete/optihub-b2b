'use client';

import React from 'react';
import { PackageCheck, PlaneTakeoff, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function DeliveryTimeline() {
  const steps = [
    {
      day: 'Día 1',
      title: 'Consolidación USA',
      desc: 'Recepción y control unitario en Miami.',
      icon: PackageCheck,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20'
    },
    {
      day: 'Día 5',
      title: 'Embarque Aéreo',
      desc: 'Vuelo directo consolidado a Santiago.',
      icon: PlaneTakeoff,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10 border-sky-500/20'
    },
    {
      day: 'Día 9',
      title: 'Aduana & Calidad',
      desc: 'Liberación arancelaria y verificación óptica.',
      icon: ShieldCheck,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20'
    },
    {
      day: 'Día 12–15',
      title: 'Entrega en Óptica',
      desc: 'Recepción en tu local con Factura SII.',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20'
    }
  ];

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest block">
            Certidumbre Logística B2B
          </span>
          <h3 className="text-lg sm:text-xl font-black text-white">
            Ruta de Importación Directa (10 a 15 días hábiles)
          </h3>
        </div>
        <span className="text-xs text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800 font-mono">
          Miami ➔ Santiago de Chile
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
        {steps.map((st, i) => {
          const Icon = st.icon;
          return (
            <div key={i} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between relative group hover:border-slate-700 transition">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${st.bg} ${st.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-black tracking-wider uppercase font-mono px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                    {st.day}
                  </span>
                </div>

                <div>
                  <h4 className="text-white font-bold text-sm">{st.title}</h4>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">{st.desc}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <span className="text-emerald-400 font-medium">
          🛡️ <strong>Garantía de Dotación Oficial:</strong> Cada armazón incluye su estuche rígido de marca, paño de microfibra original y factura electrónica chilena SII.
        </span>
      </div>
    </div>
  );
}
