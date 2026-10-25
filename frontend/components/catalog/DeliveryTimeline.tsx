'use client';

import React from 'react';
import { PackageCheck, PlaneTakeoff, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function DeliveryTimeline() {
  const steps = [
    {
      day: 'Día 1',
      title: 'Consolidación USA',
      desc: 'Recepción y control unitario en origen (Miami).',
      icon: PackageCheck,
    },
    {
      day: 'Día 5',
      title: 'Embarque Aéreo',
      desc: 'Vuelo directo consolidado hacia Santiago.',
      icon: PlaneTakeoff,
    },
    {
      day: 'Día 9',
      title: 'Aduana & Control',
      desc: 'Liberación arancelaria y verificación óptica.',
      icon: ShieldCheck,
    },
    {
      day: 'Día 12–15',
      title: 'Entrega en Óptica',
      desc: 'Recepción en su local con Factura Electrónica SII.',
      icon: CheckCircle2,
    }
  ];

  return (
    <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <span className="text-[10px] font-semibold text-[#B89768] uppercase tracking-[0.2em] block mb-1">
            Certidumbre Logística B2B
          </span>
          <h3 className="font-editorial font-serif text-xl sm:text-2xl font-semibold text-[#111111]">
            Ruta de Importación Directa (10 a 15 días hábiles)
          </h3>
        </div>
        <span className="text-xs text-[#575551] bg-[#F7F6F2] px-3.5 py-1.5 rounded-full border border-[#E5E4DF] font-mono">
          Miami, USA → Santiago, Chile
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
        {steps.map((st, i) => {
          const Icon = st.icon;
          return (
            <div
              key={i}
              className="bg-[#FAF9F6] p-4 rounded-xl border border-[#E5E4DF] flex flex-col justify-between relative hover:border-[#B89768]/60 transition"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#FFFFFF] border border-[#E5E4DF] text-[#B89768]">
                    <Icon className="w-4 h-4 stroke-[1.8]" />
                  </div>
                  <span className="text-[10px] font-bold tracking-wider uppercase font-mono px-2.5 py-0.5 rounded-full bg-[#FFFFFF] border border-[#E5E4DF] text-[#111111]">
                    {st.day}
                  </span>
                </div>

                <div>
                  <h4 className="text-[#111111] font-semibold text-sm">{st.title}</h4>
                  <p className="text-[#575551] text-xs mt-1 leading-relaxed">{st.desc}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-[#E5E4DF] flex flex-wrap items-center justify-between gap-4 text-xs text-[#575551]">
        <span className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#B89768] shrink-0" />
          <span>
            <strong className="text-[#111111]">Garantía de Dotación Oficial:</strong> Cada armazón incluye su estuche rígido original, paño de microfibra de fábrica y Factura Electrónica SII.
          </span>
        </span>
      </div>
    </div>
  );
}
