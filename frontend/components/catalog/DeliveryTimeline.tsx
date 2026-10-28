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
    <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <span className="text-[10px] font-semibold text-[#9E8256] uppercase tracking-[0.22em] block mb-1">
            Certidumbre Logística B2B
          </span>
          <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#0F0F0F]">
            Ruta de Importación Directa (10 a 15 días hábiles)
          </h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[#5C5A55] bg-[#FAF9F6] px-3.5 py-1.5 border border-[#E6E2DD] font-mono">
          Miami, USA → Santiago, Chile
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-[#E6E2DD] divide-y sm:divide-y-0 sm:divide-x divide-[#E6E2DD]">
        {steps.map((st, i) => {
          const Icon = st.icon;
          return (
            <div
              key={i}
              className="bg-[#FAF9F6] p-5 flex flex-col justify-between hover:bg-[#FFFFFF] transition"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 flex items-center justify-center bg-[#FFFFFF] border border-[#E6E2DD] text-[#9E8256]">
                    <Icon className="w-4 h-4 stroke-[1.5]" />
                  </div>
                  <span className="font-mono text-[10px] uppercase font-bold text-[#9E8256] tracking-wider">
                    {st.day}
                  </span>
                </div>

                <div>
                  <h4 className="font-semibold text-xs text-[#0F0F0F] uppercase tracking-wider">
                    {st.title}
                  </h4>
                  <p className="text-xs text-[#5C5A55] mt-1 leading-relaxed">
                    {st.desc}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E6E2DD]/60 flex items-center gap-1.5 text-[9px] uppercase font-mono tracking-wider text-[#787670]">
                <span>Paso 0{i + 1}</span>
                <span>• Verificado</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
